import { MockGbpAdapter } from "@localpilot/gbp";
import { dispatchDueJobs, generateDueDrafts } from "@localpilot/services";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MockAiClient } from "@localpilot/ai";
import { connectGoogle, createHarness, login, makePng, multipart, OTHER_EMAIL, resetDb, type Cookies, type Harness } from "./helpers";

let h: Harness;
let cookies: Cookies;
let client: { id: string; workspaceId: string; gbpLocationId: string };

const rule = { weekdays: [1, 2, 3, 4, 5, 6, 7], localTime: "16:00", timezone: "Asia/Kolkata", countPerDay: 1, enabled: true, seoMode: "draft", draftLeadHours: 48, ctaType: "LEARN_MORE", ctaUrl: "https://example.com/book" };

const api = (method: "GET" | "POST" | "PUT" | "PATCH", url: string, payload?: object, as = cookies) =>
  h.app.inject({ method, url: `/api/v1${url}`, cookies: as, ...(payload ? { payload } : {}) });
const upload = (count: number) =>
  h.app.inject({
    method: "POST",
    url: `/api/v1/clients/${client.id}/library/images?folder=seo_images`,
    cookies,
    ...multipart(Array.from({ length: count }, (_, n) => ({ name: `POST_${n}.png`, data: makePng() }))),
  });
const setSchedule = (body: object = rule) => api("PUT", `/clients/${client.id}/seo-schedule`, body);
const posts = async () => (await api("GET", `/clients/${client.id}/posts`)).json();
const gbp = () => h.ctx.deps.gbp as MockGbpAdapter;
const published = () => gbp().listPosts(client.workspaceId);
const makeDue = (id: string) => h.ctx.db.scheduledJob.update({ where: { id }, data: { runAt: new Date(Date.now() - 1000) } });
const dispatch = () => dispatchDueJobs(h.ctx.deps, new Date(), { jitter: false });
const draftOne = async () => {
  await upload(3);
  await setSchedule();
  await generateDueDrafts(h.ctx.deps);
  return (await posts()).find((job: { status: string }) => job.status === "awaiting_approval");
};

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

describe("knowledge base", () => {
  it("saves and marks the client as onboarded", async () => {
    const before = (await api("GET", `/clients/${client.id}/dashboard`)).json();
    expect(before.client.onboarded).toBe(false);
    const saved = await api("PUT", `/clients/${client.id}/profile`, { services: ["Implants"], keywords: ["dentist"], tone: "Warm" });
    expect(saved.statusCode).toBe(200);
    expect((await api("GET", `/clients/${client.id}/dashboard`)).json().client.onboarded).toBe(true);
    const { profile } = (await api("GET", `/clients/${client.id}/profile`)).json();
    expect(profile).toMatchObject({ services: ["Implants"], tone: "Warm" });
    expect(profile.gbpSnapshot.title).toBeTruthy();
  });

  it("feeds the prompt for posts", async () => {
    await api("PUT", `/clients/${client.id}/profile`, { keywords: ["family dentist adyar"] });
    const spy = vi.spyOn(MockAiClient.prototype, "generatePost");
    await draftOne();
    expect(spy.mock.calls[0]![0].knowledge.keywords).toEqual(["family dentist adyar"]);
    spy.mockRestore();
  });
});

describe("schedule", () => {
  it("creates jobs and reserves images from the SEO folder only", async () => {
    await upload(2);
    const jobs = (await setSchedule(), await posts());
    expect(jobs.length).toBeGreaterThanOrEqual(13);
    expect(jobs.filter((job: { imageId: string | null }) => job.imageId)).toHaveLength(2);
  });

  it("needs a link unless the button is Call", async () => {
    expect((await setSchedule({ ...rule, ctaUrl: null })).statusCode).toBe(400);
    expect((await setSchedule({ ...rule, ctaType: "CALL", ctaUrl: null })).statusCode).toBe(200);
  });
});

describe("draft mode", () => {
  it("writes drafts only inside the lead time", async () => {
    await upload(3);
    await setSchedule();
    await generateDueDrafts(h.ctx.deps);
    const jobs = await posts();
    const hoursAway = (job: { runAt: string }) => (Date.parse(job.runAt) - Date.now()) / 3_600_000;
    for (const job of jobs) {
      if (job.post) expect(hoursAway(job)).toBeLessThanOrEqual(48);
      else expect(hoursAway(job)).toBeGreaterThan(48);
    }
    expect(jobs.some((job: { post: unknown }) => job.post)).toBe(true);
  });

  it("respects a per-client lead time", async () => {
    await upload(5);
    await setSchedule({ ...rule, draftLeadHours: 120 });
    await generateDueDrafts(h.ctx.deps);
    expect((await posts()).filter((job: { post: unknown }) => job.post).length).toBeGreaterThan(3);
  });

  it("never publishes an unapproved draft, and alerts instead", async () => {
    const job = await draftOne();
    await makeDue(job.id);
    await dispatch();
    expect(await published()).toHaveLength(0);
    expect((await h.ctx.db.scheduledJob.findUnique({ where: { id: job.id } }))?.status).toBe("awaiting_approval");
    expect(await h.ctx.db.notification.count({ where: { type: "seo.overdue" } })).toBe(1);
  });

  it("publishes after approval, with the edit, image and link", async () => {
    const job = await draftOne();
    await api("PATCH", `/clients/${client.id}/posts/${job.id}`, { summary: "Edited by a person.", ctaType: "BOOK", ctaUrl: "https://example.com/special" });
    expect((await api("POST", `/clients/${client.id}/posts/${job.id}/approve`)).statusCode).toBe(200);
    await makeDue(job.id);
    await dispatch();
    const [sent] = await published();
    expect(sent).toMatchObject({ summary: "Edited by a person.", ctaType: "BOOK", ctaUrl: "https://example.com/special" });
    expect(sent!.imageUrl).toContain("http");
    expect((await h.ctx.db.scheduledJob.findUnique({ where: { id: job.id } }))?.status).toBe("published");
    expect((await h.ctx.db.libraryImage.findUnique({ where: { id: job.imageId } }))?.usageCount).toBe(1);
  });

  it("never sends a post twice", async () => {
    const job = await draftOne();
    await api("POST", `/clients/${client.id}/posts/${job.id}/approve`);
    await makeDue(job.id);
    await Promise.all([dispatch(), dispatch(), dispatch()]);
    await dispatch();
    expect(await published()).toHaveLength(1);
  });

  it("rewrites a draft on request and clears approval", async () => {
    const job = await draftOne();
    const spy = vi.spyOn(MockAiClient.prototype, "generatePost");
    expect((await api("POST", `/clients/${client.id}/posts/${job.id}/regenerate`)).statusCode).toBe(200);
    expect(spy).toHaveBeenCalledOnce();
    expect((await h.ctx.db.scheduledJob.findUnique({ where: { id: job.id } }))?.status).toBe("awaiting_approval");
    spy.mockRestore();
  });

  it("passes the last 10 posts as do-not-repeat", async () => {
    await upload(14);
    await setSchedule({ ...rule, draftLeadHours: 168, countPerDay: 2 });
    const spy = vi.spyOn(MockAiClient.prototype, "generatePost");
    await generateDueDrafts(h.ctx.deps);
    const last = spy.mock.calls.at(-1)![0];
    expect(last.recentPosts).toHaveLength(10);
    spy.mockRestore();
  });
});

describe("rules", () => {
  it("rejects an edited post over 1,500 characters", async () => {
    const job = await draftOne();
    const response = await api("PATCH", `/clients/${client.id}/posts/${job.id}`, { summary: "a".repeat(1501), ctaType: "BOOK", ctaUrl: "https://example.com" });
    expect(response.statusCode).toBe(400);
  });

  it("caps long AI text at 1,500 characters", async () => {
    const spy = vi.spyOn(MockAiClient.prototype, "generatePost").mockResolvedValue({ text: "Long sentence here. ".repeat(200), model: "mock", inputTokens: 1, outputTokens: 1 });
    const job = await draftOne();
    expect(job.post.summary.length).toBeLessThanOrEqual(1500);
    spy.mockRestore();
  });

  it("sends a Call button with no link", async () => {
    await upload(2);
    await setSchedule({ ...rule, seoMode: "auto", ctaType: "CALL", ctaUrl: null, weekdays: [1, 2, 3, 4, 5, 6, 7] });
    const [job] = await posts();
    await makeDue(job.id);
    await generateDueDrafts(h.ctx.deps);
    await dispatch();
    const [sent] = await published();
    expect(sent).toMatchObject({ ctaType: "CALL", ctaUrl: null });
  });
});

describe("auto mode", () => {
  it("writes close to publish time and needs no approval", async () => {
    await upload(2);
    await setSchedule({ ...rule, seoMode: "auto" });
    await generateDueDrafts(h.ctx.deps);
    expect((await posts()).filter((job: { post: unknown }) => job.post)).toHaveLength(0);

    const [job] = await posts();
    await makeDue(job.id);
    await generateDueDrafts(h.ctx.deps);
    await dispatch();
    expect(await published()).toHaveLength(1);
  });
});

describe("failures", () => {
  it("retries and then alerts", async () => {
    const job = await draftOne();
    await api("POST", `/clients/${client.id}/posts/${job.id}/approve`);
    await gbp().simulateUploadFailures(client.workspaceId, 10);
    for (let i = 0; i < 4; i++) {
      await makeDue(job.id);
      await dispatch();
    }
    expect((await h.ctx.db.scheduledJob.findUnique({ where: { id: job.id } }))?.status).toBe("dead");
    expect(await h.ctx.db.notification.count({ where: { type: "post.dead" } })).toBe(1);
  });

  it("flags an empty folder", async () => {
    await setSchedule();
    await generateDueDrafts(h.ctx.deps);
    expect(await h.ctx.db.notification.count({ where: { type: "seo.needs_images" } })).toBe(1);
  });

  it("leaves the job queued and alerts when writing fails", async () => {
    const spy = vi.spyOn(MockAiClient.prototype, "generatePost").mockRejectedValue(new Error("OpenAI returned 429"));
    await upload(1);
    await setSchedule();
    await generateDueDrafts(h.ctx.deps);
    spy.mockRestore();
    expect(await h.ctx.db.notification.count({ where: { type: "seo.generate_failed" } })).toBe(1);
    expect((await posts()).every((job: { status: string }) => job.status === "scheduled")).toBe(true);
  });
});

describe("isolation", () => {
  it("hides posts and profiles from other workspaces", async () => {
    const job = await draftOne();
    const other = await login(h, OTHER_EMAIL);
    const routes: ["GET" | "POST" | "PUT" | "PATCH", string, object?][] = [
      ["GET", `/clients/${client.id}/profile`],
      ["PUT", `/clients/${client.id}/profile`, {}],
      ["GET", `/clients/${client.id}/seo-schedule`],
      ["GET", `/clients/${client.id}/posts`],
      ["GET", `/clients/${client.id}/posts/${job.id}`],
      ["POST", `/clients/${client.id}/posts/${job.id}/approve`],
    ];
    for (const [method, url, body] of routes) expect((await api(method, url, body, other)).statusCode, url).toBe(404);
  });
});
