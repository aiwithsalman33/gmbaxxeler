import { MockGbpAdapter, RealGbpAdapter } from "@localpilot/gbp";
import { checkConnections, connectionTokens, syncClient } from "@localpilot/services";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createState, consumeState } from "../src/oauth-state";
import { createFakeGoogle } from "./fake-google";
import { connectGoogle, cookiesFrom, createHarness, login, OTHER_EMAIL, PASSWORD, resetDb, type Cookies, type Harness } from "./helpers";

const AGENCY = "baranikumargd2@gmail.com";
const realEnv = { GBP_ADAPTER: "real", GOOGLE_CLIENT_ID: "client-id", GOOGLE_CLIENT_SECRET: "client-secret", AGENCY_GOOGLE_EMAIL: AGENCY, SIGNUP_ALLOWED_EMAILS: "owner@example.com,axxeler@gmail.com" };

let google: ReturnType<typeof createFakeGoogle>;
let h: Harness;
let cookies: Cookies;

const api = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object, as = cookies) =>
  h.app.inject({ method, url: `/api/v1${url}`, cookies: as, ...(payload ? { payload } : {}) });

async function connect(as = cookies): Promise<URL> {
  const start = await api("GET", "/google/oauth/start", undefined, as);
  const consent = new URL(String(start.headers.location));
  expect(consent.searchParams.get("code_challenge_method")).toBe("S256");
  const callback = await h.app.inject({ method: "GET", url: `/api/v1/google/oauth/callback?code=real-code&state=${encodeURIComponent(consent.searchParams.get("state")!)}` });
  return new URL(String(callback.headers.location));
}

beforeAll(async () => {
  google = createFakeGoogle();
  h = await createHarness(realEnv, { googleHttp: (...args) => google.fetch(...args) });
});
beforeEach(async () => {
  await resetDb(h);
  await h.ctx.db.appSettings.deleteMany();
  h.mail.length = 0;
  google = createFakeGoogle();
  cookies = await login(h);
});
afterAll(async () => {
  await h.app.close();
  await h.ctx.db.$disconnect();
});

describe("OAuth state", () => {
  it("works once and rejects forgery and expiry", async () => {
    const { state } = await createState(h.ctx, { purpose: "login" });
    await expect(consumeState(h.ctx, `${state.split(".")[0]}.forged`)).rejects.toThrow(/expired/);
    expect((await consumeState(h.ctx, state)).purpose).toBe("login");
    await expect(consumeState(h.ctx, state)).rejects.toThrow(/expired/);

    const late = await createState(h.ctx, { purpose: "login" });
    await h.ctx.db.oAuthState.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(consumeState(h.ctx, late.state)).rejects.toThrow(/expired/);
  });
});

describe("agency connection", () => {
  it("connects with PKCE and stores tokens encrypted", async () => {
    const result = await connect();
    expect(result.searchParams.get("google")).toBe("connected");
    expect(google.verifiers[0]).toMatch(/^[\w-]{40,}$/);
    const row = await h.ctx.db.googleConnection.findFirstOrThrow();
    expect(row.googleAccountEmail).toBe(AGENCY);
    expect(row.refreshTokenEnc).not.toContain("refresh-1");
    expect((await api("GET", "/google/connections")).body).not.toContain("refreshToken");
  });

  it("reconnecting the same account updates the row", async () => {
    await connect();
    await connect();
    expect(await h.ctx.db.googleConnection.count()).toBe(1);
  });

  it("refuses a connection without business.manage", async () => {
    google.options.scopes = ["openid", "email"];
    expect((await connect()).searchParams.get("google")).toBe("missing_permission");
    expect(await h.ctx.db.googleConnection.count()).toBe(0);
  });

  it("explains a missing refresh token", async () => {
    google.options.noRefreshToken = true;
    expect((await connect()).searchParams.get("google")).toBe("no_refresh_token");
  });

  it("explains access_denied", async () => {
    const start = await api("GET", "/google/oauth/start");
    const state = new URL(String(start.headers.location)).searchParams.get("state")!;
    const callback = await h.app.inject({ method: "GET", url: `/api/v1/google/oauth/callback?error=access_denied&state=${encodeURIComponent(state)}` });
    expect(String(callback.headers.location)).toContain("google=denied");
  });

  it("rejects a replayed callback", async () => {
    const start = await api("GET", "/google/oauth/start");
    const state = encodeURIComponent(new URL(String(start.headers.location)).searchParams.get("state")!);
    await h.app.inject({ method: "GET", url: `/api/v1/google/oauth/callback?code=c&state=${state}` });
    const replay = await h.app.inject({ method: "GET", url: `/api/v1/google/oauth/callback?code=c&state=${state}` });
    expect(String(replay.headers.location)).toContain("google=expired");
  });

  it("warns on an unexpected account until confirmed", async () => {
    google.options.email = "someone-else@gmail.com";
    expect((await connect()).searchParams.get("google")).toBe("mismatch");
    const [connection] = (await api("GET", "/google/connections")).json();
    expect(connection).toMatchObject({ needsConfirmation: true });
    expect((await api("GET", "/locations")).json()).toEqual([]);
    await api("POST", `/google/connections/${connection.id}/confirm-mismatch`);
    expect((await api("GET", "/google/connections")).json()[0].needsConfirmation).toBe(false);
    expect((await api("GET", "/locations")).json()).toHaveLength(10);
  });

  it("lists every location across accounts and pages", async () => {
    await connect();
    const locations = (await api("GET", "/locations")).json();
    expect(locations).toHaveLength(10);
    expect(new Set(locations.map((l: { accountName: string }) => l.accountName))).toEqual(new Set(["Baranikumar", "Client Group"]));
    expect(locations[0].categories).toEqual(["Dentist"]);
  });

  it("re-scans and records the counts", async () => {
    await connect();
    const [connection] = (await api("GET", "/google/connections")).json();
    const scan = (await api("POST", `/google/connections/${connection.id}/rescan`)).json();
    expect(scan).toMatchObject({ accounts: 2, locations: 10 });
    expect((await api("GET", "/settings/google/status")).json().apiAccess).toBe("approved");
  });

  it("explains a project with zero quota", async () => {
    await connect();
    google.options.quotaZero = true;
    const [connection] = (await api("GET", "/google/connections")).json();
    const scan = await api("POST", `/google/connections/${connection.id}/rescan`);
    expect(scan.statusCode).toBe(503);
    expect(scan.json().error.message).toContain("not yet approved");
    expect((await api("GET", "/settings/google/status")).json().apiAccess).toBe("not_approved");
  });

  it("disconnect revokes at Google, deletes tokens and keeps client data", async () => {
    await connect();
    const [location] = (await api("GET", "/locations")).json();
    const [client] = (await api("POST", "/clients/import", { locations: [{ accountId: location.accountId, locationId: location.locationId }] })).json();
    const [connection] = (await api("GET", "/google/connections")).json();
    await api("DELETE", `/google/connections/${connection.id}`);
    expect(google.revokedTokens).toEqual(["refresh-1"]);
    expect(await h.ctx.db.googleConnection.findFirstOrThrow()).toMatchObject({ refreshTokenEnc: null, status: "disconnected" });
    expect((await api("GET", `/clients/${client.id}`)).json().status).toBe("reconnect_required");
  });
});

describe("tokens", () => {
  it("refreshes once when many calls arrive together", async () => {
    await connect();
    const connection = await h.ctx.db.googleConnection.findFirstOrThrow();
    const tokens = connectionTokens(h.ctx.deps, connection);
    const results = await Promise.all(Array.from({ length: 6 }, () => tokens.get()));
    expect(google.refreshCount).toBe(1);
    expect(new Set(results).size).toBe(1);
  });

  it("replaces a token Google rejected", async () => {
    await connect();
    const connection = await h.ctx.db.googleConnection.findFirstOrThrow();
    const tokens = connectionTokens(h.ctx.deps, connection);
    const first = await tokens.get();
    expect(await tokens.get(first)).not.toBe(first);
  });

  it("a revoked token flags the connection and clients, and alerts with a Reconnect link", async () => {
    await connect();
    const [location] = (await api("GET", "/locations")).json();
    const [client] = (await api("POST", "/clients/import", { locations: [{ accountId: location.accountId, locationId: location.locationId }] })).json();
    await h.ctx.db.googleConnection.updateMany({ data: { accessTokenEnc: null, accessTokenExpiresAt: null } });
    google.revokedRefresh = true;
    h.mail.length = 0;
    await checkConnections(h.ctx.deps);
    expect((await h.ctx.db.googleConnection.findFirstOrThrow()).status).toBe("error");
    expect((await api("GET", `/clients/${client.id}`)).json().status).toBe("reconnect_required");
    expect(h.mail.some((mail) => mail.text.includes("/settings/google"))).toBe(true);
  });

  it("login keeps working while the agency connection is broken", async () => {
    await connect();
    await h.ctx.db.googleConnection.updateMany({ data: { status: "error" } });
    const response = await h.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "owner@example.com", password: PASSWORD } });
    expect(response.statusCode).toBe(200);
  });
});

describe("Google login", () => {
  async function signIn(options: Parameters<typeof createFakeGoogle>[0]) {
    Object.assign(google.options, options);
    const start = await h.app.inject({ method: "GET", url: "/api/v1/auth/google/start" });
    const consent = new URL(String(start.headers.location));
    expect(consent.searchParams.get("scope")).toBe("openid email profile");
    return h.app.inject({ method: "GET", url: `/api/v1/auth/google/callback?code=c&state=${encodeURIComponent(consent.searchParams.get("state")!)}` });
  }

  it("logs in an allowlisted account with identity scopes only", async () => {
    const response = await signIn({ email: "axxeler@gmail.com", subject: "login-1", scopes: ["openid", "email", "profile"] });
    expect(String(response.headers.location)).toBe("http://localhost:8080/");
    const session = cookiesFrom(response);
    expect((await api("GET", "/me", undefined, session)).json().user.email).toBe("axxeler@gmail.com");
    expect(await h.ctx.db.googleConnection.count()).toBe(0);
  });

  it("refuses an address that isn't allowed", async () => {
    expect(String((await signIn({ email: "stranger@gmail.com", subject: "x" })).headers.location)).toContain("error=not_allowed");
  });

  it("refuses the agency account for app login", async () => {
    expect(String((await signIn({ email: AGENCY, subject: "agency" })).headers.location)).toContain("error=agency_account");
  });

  it("refuses an unverified Google email", async () => {
    expect(String((await signIn({ email: "axxeler@gmail.com", emailVerified: false })).headers.location)).toContain("error=google_unverified");
  });

  it("links to an existing password account", async () => {
    await signIn({ email: "owner@example.com", subject: "linked" });
    expect((await h.ctx.db.user.findFirstOrThrow()).googleSubject).toBe("linked");
    expect(await h.ctx.db.user.count()).toBe(1);
  });

  it("reports whether Google login is available", async () => {
    expect((await h.app.inject({ method: "GET", url: "/api/v1/auth/options" })).json()).toEqual({ password: true, google: true });
  });
});

describe("credentials", () => {
  it("masks the secret, encrypts it, and lets Settings override env", async () => {
    await api("PUT", "/settings/google/credentials", { clientId: "from-settings", clientSecret: "settings-secret-1234" });
    const row = await h.ctx.db.appSettings.findFirstOrThrow();
    expect(row.googleClientSecretEnc).not.toContain("settings-secret");
    const shown = await api("GET", "/settings/google/credentials");
    expect(shown.body).not.toContain("settings-secret");
    expect(shown.json()).toMatchObject({ source: "settings", clientId: "from-settings", maskedSecret: "••••1234" });
    expect(shown.json().redirectUris).toContain("http://localhost:8080/api/v1/google/oauth/callback");
  });

  it("tests credentials without signing in", async () => {
    expect((await api("POST", "/settings/google/credentials/test")).json()).toEqual({ status: "valid" });
    await api("PUT", "/settings/google/credentials", { clientId: "x", clientSecret: "wrong" });
    expect((await api("POST", "/settings/google/credentials/test")).json()).toEqual({ status: "invalid" });
  });

  it("is owner-only", async () => {
    const other = await login(h, OTHER_EMAIL);
    await h.ctx.db.workspaceMember.updateMany({ where: { user: { email: OTHER_EMAIL } }, data: { role: "member" } });
    const relogin = await login(h, OTHER_EMAIL);
    expect(other).toBeTruthy();
    expect((await api("PUT", "/settings/google/credentials", { clientId: "x", clientSecret: "y" }, relogin)).statusCode).toBe(403);
  });
});

describe("no Google credentials", () => {
  it("starts, reports health, and explains what's missing", async () => {
    const bare = await createHarness({ GBP_ADAPTER: "real", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" });
    expect((await bare.app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    expect((await bare.app.inject({ method: "GET", url: "/api/v1/auth/options" })).json().google).toBe(false);
    const session = await login(bare);
    const start = await bare.app.inject({ method: "GET", url: "/api/v1/google/oauth/start", cookies: session });
    expect(String(start.headers.location)).toContain("google=no_credentials");
    await bare.app.close();
    await bare.ctx.db.$disconnect();
  });
});

describe("mock status", () => {
  it("shows API access as not approved", async () => {
    const demo = await createHarness();
    await resetDb(demo);
    const session = await login(demo);
    await connectGoogle(demo, session);
    expect((await demo.app.inject({ method: "GET", url: "/api/v1/settings/google/status", cookies: session })).json()).toMatchObject({ adapter: "mock", apiAccess: "not_approved", agencyConnected: true });
    expect(demo.ctx.deps.gbp).toBeInstanceOf(MockGbpAdapter);
    await demo.app.close();
    await demo.ctx.db.$disconnect();
  });
});

describe("adapter", () => {
  it("is real in this suite", () => {
    expect(h.ctx.deps.gbp).toBeInstanceOf(RealGbpAdapter);
  });
});

describe("lost access", () => {
  it("is handled by the sync path", async () => {
    await connect();
    const [location] = (await api("GET", "/locations")).json();
    const [client] = (await api("POST", "/clients/import", { locations: [{ accountId: location.accountId, locationId: location.locationId }] })).json();
    google.locations["1"] = [];
    await syncClient(h.ctx.deps, client.id);
    expect((await api("GET", `/clients/${client.id}`)).json().status).toBe("access_removed");
  });
});
