import { MockGbpAdapter } from "@localpilot/gbp";
import { sendDueReminders, syncClient } from "@localpilot/services";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadEnv } from "../src/config";
import { connectGoogle, createHarness, login, OTHER_EMAIL, resetDb, type Cookies, type Harness } from "./helpers";

let h: Harness;
let cookies: Cookies;

beforeAll(async () => {
  h = await createHarness();
});
beforeEach(async () => {
  await resetDb(h);
  h.mail.length = 0;
  cookies = await login(h);
  await connectGoogle(h, cookies);
});
afterAll(async () => {
  await h.app.close();
  await h.ctx.db.$disconnect();
});

const api = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: object, as = cookies) =>
  h.app.inject({ method, url: `/api/v1${url}`, cookies: as, ...(payload ? { payload } : {}) });

const ADDRESS = "4 Harbor Road, Chennai";
const addClient = async (businessName: string, extra: object = { contactPhone: "+919876500000", address: ADDRESS }) =>
  (await api("POST", "/clients", { businessName, ...extra })).json().client;

const importFirst = async (count: number) => {
  const locations = (await api("GET", "/locations/unattached")).json();
  const refs = locations.slice(0, count).map(({ accountId, locationId }: { accountId: string; locationId: string }) => ({ accountId, locationId }));
  return (await api("POST", "/clients/import", { locations: refs })).json();
};

describe("agency connection", () => {
  it("stores the refresh token encrypted and never returns it", async () => {
    const row = await h.ctx.db.googleConnection.findFirstOrThrow();
    expect(row.refreshTokenEnc).not.toContain("mock-refresh-token");
    expect(row.refreshTokenEnc?.startsWith("v1.")).toBe(true);
    const body = (await api("GET", "/google/connections")).body;
    expect(body).toContain("agency.demo@localpilot.dev");
    expect(body).not.toContain("refreshToken");
  });
});

describe("manager invitation flow", () => {
  it("adds a client, then accepts the matching invitation and connects it", async () => {
    const created = await api("POST", "/clients", { businessName: "Harbor View Dental", contactPhone: "+919876500000", address: ADDRESS });
    expect(created.statusCode).toBe(201);
    const { client, guide } = created.json();
    expect(client.status).toBe("invited");
    expect(guide.text).toContain("agency.demo@localpilot.dev");
    expect(guide.whatsappUrl).toContain("wa.me/919876500000");

    const sent = await api("POST", `/clients/${client.id}/guide/send`, { channel: "whatsapp" });
    expect(sent.json().status).toBe("waiting_for_access");

    await api("POST", `/dev/mock/clients/${client.id}/invite`);
    const poll = (await api("POST", "/clients/check-invitations")).json();
    expect(poll).toMatchObject({ seen: 1, accepted: 1, needsReview: 0, connected: 1 });

    const connected = (await api("GET", `/clients/${client.id}`)).json();
    expect(connected).toMatchObject({ status: "connected", matchMethod: "auto_name" });
    expect(connected.gbpLocationId).toBeTruthy();

    const dashboard = (await api("GET", `/clients/${client.id}/dashboard?range=28`)).json();
    expect(dashboard.metrics.series).toHaveLength(28);
    expect(dashboard.metrics.current.views).toBeGreaterThan(0);
    expect(dashboard.metrics.previous.views).toBeGreaterThan(0);

    const titles = (await api("GET", "/notifications")).json().items.map((n: { title: string }) => n.title);
    expect(titles).toContain("Harbor View Dental is connected");
  });

  it("is safe to poll again", async () => {
    const client = await addClient("Harbor View Dental");
    await api("POST", `/dev/mock/clients/${client.id}/invite`);
    await api("POST", "/clients/check-invitations");
    expect((await api("POST", "/clients/check-invitations")).json()).toMatchObject({ seen: 0, accepted: 0, connected: 0 });
    expect(await h.ctx.db.notification.count({ where: { type: "client.connected" } })).toBe(1);
  });

  it("never auto-accepts an unmatched invitation, and an admin can match it", async () => {
    const client = await addClient("Harbor View Dental");
    await api("POST", "/dev/mock/invitations", { locationName: "Completely Unrelated Plumbing" });
    expect((await api("POST", "/clients/check-invitations")).json()).toMatchObject({ accepted: 0, needsReview: 1 });

    const [invitation] = (await api("GET", "/invitations")).json();
    expect(invitation.status).toBe("needs_review");

    const result = await api("POST", `/invitations/${invitation.id}/match`, { clientId: client.id });
    expect(result.statusCode).toBe(200);
    expect((await api("GET", `/clients/${client.id}`)).json().status).toBe("connected");
    expect((await api("GET", "/invitations")).json()).toHaveLength(0);
  });

  it("suggests a client on a name-only match, and a person accepts it", async () => {
    const client = await addClient("Harbor View Dental", { contactPhone: "+919876500000" });
    await api("POST", `/dev/mock/clients/${client.id}/invite`);
    expect((await api("POST", "/clients/check-invitations")).json()).toMatchObject({ accepted: 0, needsReview: 1 });
    expect((await api("GET", `/clients/${client.id}`)).json().status).toBe("invited");

    const [invitation] = (await api("GET", "/invitations")).json();
    expect(invitation.suggestedClientId).toBe(client.id);
    await api("POST", `/invitations/${invitation.id}/match`, { clientId: client.id });
    expect((await api("GET", `/clients/${client.id}`)).json().status).toBe("connected");
  });

  it("emails the admin when a client connects", async () => {
    const client = await addClient("Harbor View Dental");
    await api("POST", `/dev/mock/clients/${client.id}/invite`);
    h.mail.length = 0;
    await api("POST", "/clients/check-invitations");
    expect(h.mail.some((mail) => mail.subject.includes("is connected"))).toBe(true);
  });

  it("simulates one clean and one unsure invitation", async () => {
    await addClient("Harbor View Dental");
    await api("POST", "/dev/mock/sample-invitations");
    expect((await api("POST", "/clients/check-invitations")).json()).toMatchObject({ accepted: 1, needsReview: 1 });
  });

  it("sends ambiguous invitations to review", async () => {
    await addClient("Acme Motors");
    await addClient("Acme Motors");
    await api("POST", "/dev/mock/invitations", { locationName: "Acme Motors" });
    expect((await api("POST", "/clients/check-invitations")).json()).toMatchObject({ accepted: 0, needsReview: 1 });
  });

  it("binds an already-accessible location by phone", async () => {
    const client = await addClient("Some Other Name", { contactPhone: "+919800000005" });
    expect((await api("POST", "/clients/check-invitations")).json().connected).toBe(1);
    expect((await api("GET", `/clients/${client.id}`)).json()).toMatchObject({ status: "connected", matchMethod: "auto_phone" });
  });

  it("supports manual location matching", async () => {
    const client = await addClient("No Match Here Ltd", { contactEmail: "owner@gmail.com" });
    const [location] = (await api("GET", "/locations/unattached")).json();
    const matched = await api("POST", `/clients/${client.id}/match-location`, { accountId: location.accountId, locationId: location.locationId });
    expect(matched.json()).toMatchObject({ status: "connected", matchMethod: "manual" });
  });
});

describe("reminders", () => {
  it("sends day 2 and day 5 once each, then stops on connect", async () => {
    const client = await addClient("Harbor View Dental");
    const day = (n: number) => new Date(Date.now() + n * 86_400_000);
    expect(await sendDueReminders(h.ctx.deps, day(1))).toBe(0);
    expect(await sendDueReminders(h.ctx.deps, day(2.1))).toBe(1);
    expect(await sendDueReminders(h.ctx.deps, day(2.2))).toBe(0);
    expect(await sendDueReminders(h.ctx.deps, day(5.1))).toBe(1);

    const reminders = await h.ctx.db.clientReminder.findMany({ where: { clientId: client.id } });
    expect(reminders.map((r) => r.kind).sort()).toEqual(["day_2", "day_5"]);
  });
});

describe("access loss", () => {
  it("flags access_removed on a 403 and restores it when access returns", async () => {
    const [client] = await importFirst(1);
    await api("POST", `/dev/mock/clients/${client.id}/revoke`);
    await syncClient(h.ctx.deps, client.id);
    expect((await api("GET", `/clients/${client.id}`)).json().status).toBe("access_removed");
    expect(await h.ctx.db.notification.count({ where: { type: "client.access_removed" } })).toBe(1);

    const gbp = h.ctx.deps.gbp as MockGbpAdapter;
    await gbp.simulateRestoreLocation(client.workspaceId, client.gbpLocationId);
    await api("POST", "/clients/check-invitations");
    expect((await api("GET", `/clients/${client.id}`)).json().status).toBe("connected");
  });

  it("flags reconnect_required when the token is revoked, and clears it on reconnect", async () => {
    const [client] = await importFirst(1);
    const gbp = h.ctx.deps.gbp as MockGbpAdapter;
    await gbp.simulateTokenRevoked(client.workspaceId);
    await api("POST", "/clients/check-invitations");
    expect((await api("GET", `/clients/${client.id}`)).json().status).toBe("reconnect_required");
    expect((await api("GET", "/google/connections")).json()[0].status).toBe("error");

    await connectGoogle(h, cookies);
    expect((await api("GET", `/clients/${client.id}`)).json().status).toBe("connected");
  });
});

describe("import and switching data", () => {
  it("imports all 10 sample locations across two accounts", async () => {
    const locations = (await api("GET", "/locations")).json();
    expect(locations).toHaveLength(10);
    expect(new Set(locations.map((l: { accountId: string }) => l.accountId)).size).toBe(2);
    const imported = (await api("POST", "/clients/import", { all: true })).json();
    expect(imported).toHaveLength(10);
    expect((await api("GET", "/clients")).json()).toHaveLength(10);
    expect((await api("GET", "/locations")).json().every((l: { clientId: string | null }) => l.clientId)).toBe(true);
  });

  it("imports 3 clients with separate metrics", async () => {
    const imported = await importFirst(3);
    expect(imported).toHaveLength(3);
    const views = await Promise.all(
      imported.map(async (c: { id: string }) => (await api("GET", `/clients/${c.id}/dashboard?range=7`)).json().metrics.current.views),
    );
    expect(new Set(views).size).toBe(3);
    expect((await api("GET", "/locations/unattached")).json()).toHaveLength(7);
  });

  it("gives each client a strength score and checklist", async () => {
    const [client] = await importFirst(1);
    const { strength } = (await api("GET", `/clients/${client.id}/dashboard`)).json();
    expect(strength.score).toBeGreaterThan(0);
    expect(strength.checklist).toHaveLength(9);
  });

  it("can re-import a removed client", async () => {
    const [client] = await importFirst(1);
    await api("DELETE", `/clients/${client.id}`);
    expect((await api("GET", `/clients/${client.id}`)).statusCode).toBe(404);
    const again = await importFirst(10);
    expect(again.find((c: { id: string }) => c.id === client.id)?.status).toBe("connected");
  });
});

describe("workspace isolation", () => {
  it("hides one workspace's client from another", async () => {
    const [client] = await importFirst(1);
    const other = await login(h, OTHER_EMAIL);
    const routes: ["GET" | "POST" | "PATCH" | "DELETE", string, object?][] = [
      ["GET", `/clients/${client.id}`],
      ["PATCH", `/clients/${client.id}`, { notes: "x" }],
      ["DELETE", `/clients/${client.id}`],
      ["GET", `/clients/${client.id}/dashboard`],
      ["POST", `/clients/${client.id}/dashboard/refresh`],
      ["GET", `/clients/${client.id}/guide`],
      ["GET", `/clients/${client.id}/library/images`],
    ];
    for (const [method, url, body] of routes) {
      expect((await api(method, url, body, other)).statusCode, `${method} ${url}`).toBe(404);
    }
    expect((await api("GET", "/clients", undefined, other)).json()).toEqual([]);
  });

  it("does not let another workspace match or decline an invitation", async () => {
    await addClient("Harbor View Dental");
    await api("POST", "/dev/mock/invitations", { locationName: "Unrelated Plumbing" });
    await api("POST", "/clients/check-invitations");
    const [invitation] = (await api("GET", "/invitations")).json();
    const other = await login(h, OTHER_EMAIL);
    expect((await api("POST", `/invitations/${invitation.id}/decline`, undefined, other)).statusCode).toBe(404);
  });
});

describe("mock data", () => {
  it("starts empty unless sample data is switched on", async () => {
    const empty = await createHarness({ MOCK_SAMPLE_DATA: "false" });
    await resetDb(empty);
    empty.mail.length = 0;
    const session = await login(empty);
    await connectGoogle(empty, session);
    const response = await empty.app.inject({ method: "GET", url: "/api/v1/locations/unattached", cookies: session });
    expect(response.json()).toEqual([]);
    await empty.app.close();
    await empty.ctx.db.$disconnect();
  });

  it("is allowed in production, for use until Google approves API access", () => {
    const production = {
      APP_ENV: "production",
      DATABASE_URL: "postgresql://x",
      JWT_SECRET: "a".repeat(64),
      ENCRYPTION_KEY: "ab".repeat(32),
      APP_URL: "https://x.example",
      API_URL: "https://x.example/api",
      PUBLIC_MEDIA_URL: "https://x.example/media",
      MINIO_ENDPOINT: "http://minio:9000",
      MINIO_ACCESS_KEY: "a",
      MINIO_SECRET_KEY: "b",
      MAIL_PROVIDER: "smtp",
      SMTP_HOST: "h",
      SMTP_USER: "u",
      SMTP_PASS: "p",
      MAIL_FROM: "x@example.com",
    };
    expect(() => loadEnv({ ...production, GBP_ADAPTER: "mock", AI_ADAPTER: "mock" })).not.toThrow();
    expect(() => loadEnv({ ...production, GBP_ADAPTER: "real", AI_ADAPTER: "openai" })).not.toThrow();
  });
});

describe("mock routes", () => {
  it("are not registered with the real adapter", async () => {
    const real = await createHarness({ GBP_ADAPTER: "real", GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" });
    const response = await real.app.inject({ method: "GET", url: "/api/v1/dev/mock/enabled", cookies });
    expect(response.statusCode).toBe(404);
    await real.app.close();
    await real.ctx.db.$disconnect();
  });
});

describe("client sign-in links", () => {
  it("are off unless the env flag is set", async () => {
    const off = await createHarness({ ENABLE_CLIENT_OAUTH_LINKS: "false" });
    expect((await off.app.inject({ method: "GET", url: "/api/v1/public/invites/abc" })).statusCode).toBe(404);
    await off.app.close();
    await off.ctx.db.$disconnect();
  });
});

describe("fallback OAuth invite", () => {
  it("attaches the client's location without touching the agency connection", async () => {
    const client = await addClient("Harbor View Dental");
    const { url } = (await api("POST", "/invites", { clientId: client.id })).json();
    const token = url.split("/").pop();
    const start = await h.app.inject({ method: "GET", url: `/api/v1/public/invites/${token}/start` });
    const callback = new URL(String(start.headers.location));
    const done = await h.app.inject({ method: "GET", url: callback.pathname + callback.search });
    expect(done.headers.location).toContain("result=connected");

    const connected = (await api("GET", `/clients/${client.id}`)).json();
    expect(connected).toMatchObject({ status: "connected", matchMethod: "oauth" });
    expect((await h.app.inject({ method: "GET", url: `/api/v1/public/invites/${token}` })).statusCode).toBe(404);
    const connections = (await api("GET", "/google/connections")).json();
    expect(connections.map((c: { source: string }) => c.source).sort()).toEqual(["agency", "invite"]);
  });
});
