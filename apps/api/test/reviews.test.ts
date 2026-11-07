import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { MockGbpAdapter } from "@localpilot/gbp";
import { publishDueReplies, syncClientReviews } from "@localpilot/services";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MockAiClient } from "@localpilot/ai";
import { connectGoogle, createHarness, login, OTHER_EMAIL, resetDb, type Cookies, type Harness } from "./helpers";

let h: Harness;
let cookies: Cookies;
let client: { id: string; workspaceId: string; gbpLocationId: string };

const api = (method: "GET" | "POST" | "PUT", url: string, payload?: object, as = cookies) =>
  h.app.inject({ method, url: `/api/v1${url}`, cookies: as, ...(payload ? { payload } : {}) });
const gbp = () => h.ctx.deps.gbp as MockGbpAdapter;
const settings = (body: object) => api("PUT", `/clients/${client.id}/review-settings`, { autoReplyEnabled: true, mode: "full_auto", delayMinS: 300, delayMaxS: 600, ...body });
const sync = () => syncClientReviews(h.ctx.deps, client.id);
const list = async (query = "") => (await api("GET", `/clients/${client.id}/reviews${query}`)).json();
const incoming = async (rating: number, text: string | null = "Some words here") => {
  await gbp().simulateReview(client.workspaceId, client.gbpLocationId, { rating, text });
  await sync();
  return (await list())[0];
};
const sent = () => gbp().listReplies(client.workspaceId);
const later = () => new Date(Date.now() + 3 * 3_600_000);

beforeAll(async () => {
  h = await createHarness();
});
beforeEach(async () => {
  await resetDb(h);
  h.mail.length = 0;
  cookies = await login(h);
  await connectGoogle(h, cookies);
  const [location] = (await api("GET", "/locations/unattached")).json();
  client = (await api("POST", "/clients/import", { locations: [{ accountId: location.accountId, locationId: location.locationId }] })).json()[0];
});
afterAll(async () => {
  await h.app.close();
  await h.ctx.db.$disconnect();
});

describe("first sync", () => {
  it("imports history quietly, with no alerts, drafts or replies", async () => {
    await settings({});
    expect((await sync()).added).toBe(5);
    expect(await h.ctx.db.notification.count({ where: { type: "review.negative" } })).toBe(0);
    expect(await h.ctx.db.reviewReply.count()).toBe(0);
  });

  it("does not add reviews twice", async () => {
    await sync();
    expect((await sync()).added).toBe(0);
  });

  it("marks reviews already answered on Google", async () => {
    await sync();
    expect((await list("?replied=yes")).map((r: { reviewerName: string }) => r.reviewerName)).toEqual(["Asha R"]);
  });
});

describe("filters", () => {
  it("filters by rating, replied state and search", async () => {
    await sync();
    expect(await list("?rating=2")).toHaveLength(1);
    expect(await list("?replied=no")).toHaveLength(4);
    expect(await list("?search=recommend")).toHaveLength(1);
    expect(await list("?search=VIKRAM")).toHaveLength(1);
  });
});

describe("negative reviews", () => {
  beforeEach(async () => {
    await sync();
  });

  it.each(["draft_only", "auto_4_5", "full_auto"])("never auto-publishes a 1-star review in %s mode", async (mode) => {
    await settings({ mode });
    const review = await incoming(1, "Terrible");
    expect(review.replies[0].status).toBe("draft");
    await publishDueReplies(h.ctx.deps, later());
    expect(await sent()).toHaveLength(0);
    expect(await h.ctx.db.notification.count({ where: { type: "review.negative", severity: "critical" } })).toBe(1);
  });

  it("drafts and alerts even with auto-reply off", async () => {
    const review = await incoming(3);
    expect(review.replies[0].status).toBe("draft");
    expect(await h.ctx.db.notification.count({ where: { type: "review.negative" } })).toBe(1);
  });

  it("blocks a negative reply forced into the schedule without approval", async () => {
    const review = await incoming(2);
    await h.ctx.db.reviewReply.update({ where: { id: review.replies[0].id }, data: { status: "scheduled", publishAt: new Date(Date.now() - 1000) } });
    await publishDueReplies(h.ctx.deps);
    expect(await sent()).toHaveLength(0);
    expect((await h.ctx.db.reviewReply.findUnique({ where: { id: review.replies[0].id } }))?.status).toBe("draft");
  });

  it("still alerts if the AI can't write a draft", async () => {
    const spy = vi.spyOn(MockAiClient.prototype, "generateReply").mockRejectedValue(new Error("down"));
    await incoming(1);
    spy.mockRestore();
    expect(await h.ctx.db.notification.count({ where: { type: "review.negative" } })).toBe(1);
  });

  it("publishes once a person approves", async () => {
    const review = await incoming(1);
    const response = await api("POST", `/clients/${client.id}/replies/${review.replies[0].id}/approve`, { text: "We're very sorry. Please call us." });
    expect(response.statusCode).toBe(200);
    expect((await sent())[0]!.comment).toBe("We're very sorry. Please call us.");
    expect((await list("?rating=1"))[0].replyState).toBe("replied");
  });
});

describe("auto replies", () => {
  beforeEach(async () => {
    await sync();
  });

  it("schedules a good review after a random delay", async () => {
    await settings({});
    const before = Date.now();
    const review = await incoming(5);
    const reply = review.replies[0];
    expect(reply.status).toBe("scheduled");
    const delay = Date.parse(reply.publishAt) - before;
    expect(delay).toBeGreaterThanOrEqual(299_000);
    expect(delay).toBeLessThanOrEqual(605_000);

    await publishDueReplies(h.ctx.deps);
    expect(await sent()).toHaveLength(0);
    await publishDueReplies(h.ctx.deps, later());
    expect(await sent()).toHaveLength(1);
    expect((await list("?rating=5"))[0].replyState).toBe("replied");
  });

  it("only drafts in draft-only mode", async () => {
    await settings({ mode: "draft_only" });
    expect((await incoming(5)).replies[0].status).toBe("draft");
    await publishDueReplies(h.ctx.deps, later());
    expect(await sent()).toHaveLength(0);
  });

  it("does nothing when auto-reply is off", async () => {
    expect((await incoming(5)).replies).toHaveLength(0);
  });

  it("never replies twice with parallel workers", async () => {
    await settings({});
    await incoming(5);
    await Promise.all([publishDueReplies(h.ctx.deps, later()), publishDueReplies(h.ctx.deps, later()), publishDueReplies(h.ctx.deps, later())]);
    expect(await sent()).toHaveLength(1);
  });

  it("uses the Reply Brain", async () => {
    await settings({ replyBrain: "Sign off as Team Sunrise" });
    const spy = vi.spyOn(MockAiClient.prototype, "generateReply");
    await incoming(5);
    expect(spy.mock.calls[0]![0].replyBrain).toBe("Sign off as Team Sunrise");
    spy.mockRestore();
  });
});

describe("manual replies", () => {
  it("suggests a reply and sends a manual one", async () => {
    await sync();
    const [review] = await list("?replied=no&rating=4");
    const suggestion = (await api("POST", `/clients/${client.id}/reviews/${review.id}/suggest`)).json();
    expect(suggestion.text).toContain("Thank you");
    const response = await api("POST", `/clients/${client.id}/reviews/${review.id}/reply`, { text: "Thanks for coming in." });
    expect(response.statusCode).toBe(200);
    expect(await sent()).toHaveLength(1);
    expect((await api("POST", `/clients/${client.id}/reviews/${review.id}/reply`, { text: "Again" })).statusCode).toBe(409);
  });
});

describe("lost access", () => {
  it("flags the client when review sync gets a 403", async () => {
    await sync();
    await gbp().simulateRevokeLocation(client.workspaceId, client.gbpLocationId);
    await sync();
    expect((await api("GET", `/clients/${client.id}`)).json().status).toBe("access_removed");
  });
});

describe("alert delivery", () => {
  it("sends critical alerts to the webhook, and a dead webhook breaks nothing", async () => {
    const received: { text: string; chat_id?: string }[] = [];
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        received.push(JSON.parse(Buffer.concat(chunks).toString()));
        response.writeHead(200).end("{}");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const webhookUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
    await api("PUT", "/settings/notifications", { emails: ["alerts@example.com"], webhookUrl, webhookKind: "telegram", webhookChatId: "42" });
    await sync();
    await incoming(1, "Awful");
    server.close();
    expect(received[0]).toMatchObject({ chat_id: "42" });
    expect(received[0]!.text).toContain("1-star review");

    await incoming(2, "Webhook is down now");
    expect(await h.ctx.db.notification.count({ where: { type: "review.negative" } })).toBe(2);
  });
});

describe("isolation", () => {
  it("hides reviews from other workspaces", async () => {
    await sync();
    const [review] = await list();
    const other = await login(h, OTHER_EMAIL);
    const routes: ["GET" | "POST", string, object?][] = [
      ["GET", `/clients/${client.id}/reviews`],
      ["POST", `/clients/${client.id}/reviews/sync`],
      ["POST", `/clients/${client.id}/reviews/${review.id}/suggest`],
      ["POST", `/clients/${client.id}/reviews/${review.id}/reply`, { text: "x" }],
      ["GET", `/clients/${client.id}/review-settings`],
    ];
    for (const [method, url, body] of routes) expect((await api(method, url, body, other)).statusCode, url).toBe(404);
  });
});
