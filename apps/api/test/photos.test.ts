import { MockGbpAdapter } from "@localpilot/gbp";
import { dispatchDueJobs, materializeAll, recoverStuckJobs, STUCK_ERROR, syncClient } from "@localpilot/services";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { connectGoogle, createHarness, login, makePng, multipart, OTHER_EMAIL, resetDb, type Cookies, type Harness } from "./helpers";

let h: Harness;
let cookies: Cookies;
let client: { id: string; workspaceId: string; gbpLocationId: string };

const schedule = { weekdays: [1, 2, 3, 4], localTime: "10:00", timezone: "Asia/Kolkata", countPerDay: 2, defaultCategory: "ADDITIONAL", enabled: true };
const DAY = 86_400_000;

const api = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: object, as = cookies) =>
  h.app.inject({ method, url: `/api/v1${url}`, cookies: as, ...(payload ? { payload } : {}) });
const upload = async (count: number) => {
  const files = Array.from({ length: count }, (_, n) => ({ name: `IMG_${n}.png`, data: makePng() }));
  await h.app.inject({ method: "POST", url: `/api/v1/clients/${client.id}/library/images?folder=photos`, cookies, ...multipart(files) });
};
const setSchedule = (body: object = schedule) => api("PUT", `/clients/${client.id}/photo-schedule`, body);
const queue = async () => (await api("GET", `/clients/${client.id}/photos/queue`)).json();
const history = async () => (await api("GET", `/clients/${client.id}/photos/history`)).json();
const runAll = (days = 15) => dispatchDueJobs(h.ctx.deps, new Date(Date.now() + days * DAY), { jitter: false });
const gbp = () => h.ctx.deps.gbp as MockGbpAdapter;
const uploads = () => gbp().listUploads(client.workspaceId);
const firstDueNow = async () => {
  const [job] = await queue();
  await h.ctx.db.scheduledJob.update({ where: { id: job.id }, data: { runAt: new Date(Date.now() - 1000) } });
  return job;
};
const runDue = () => dispatchDueJobs(h.ctx.deps, new Date(), { jitter: false });

beforeAll(async () => {
  h = await createHarness();
});
beforeEach(async () => {
  await resetDb(h);
  h.mail.length = 0;
  cookies = await login(h);
  await connectGoogle(h, cookies);
  const [location] = (await api("GET", "/locations/unattached")).json();
  const imported = await api("POST", "/clients/import", { locations: [{ accountId: location.accountId, locationId: location.locationId }] });
  client = imported.json()[0];
});
afterAll(async () => {
  await h.app.close();
  await h.ctx.db.$disconnect();
});

describe("schedule", () => {
  it("creates 14 days of jobs for 8 photos a week", async () => {
    await upload(30);
    const response = await setSchedule();
    expect(response.json().weekly).toBe(8);
    const jobs = await queue();
    expect(jobs.length).toBeGreaterThanOrEqual(14);
    expect(jobs.length).toBeLessThanOrEqual(18);
    expect(new Set(jobs.map((j: { idempotencyKey: string }) => j.idempotencyKey)).size).toBe(jobs.length);
  });

  it("supports a different weekly count per client", async () => {
    await upload(5);
    const response = await setSchedule({ ...schedule, weekdays: [1, 3, 5], countPerDay: 1 });
    expect(response.json().weekly).toBe(3);
  });

  it("does not create duplicates when generation repeats", async () => {
    await setSchedule();
    const before = (await queue()).length;
    await materializeAll(h.ctx.deps);
    await materializeAll(h.ctx.deps);
    expect((await queue()).length).toBe(before);
  });

  it("rebuilds on change but keeps manual edits", async () => {
    await setSchedule();
    const [first] = await queue();
    await api("PATCH", `/clients/${client.id}/photos/jobs/${first.id}`, { category: "TEAMS" });
    await setSchedule({ ...schedule, weekdays: [5], countPerDay: 1 });
    const jobs = await queue();
    expect(jobs.find((j: { id: string }) => j.id === first.id)?.category).toBe("TEAMS");
    expect(jobs.length).toBeLessThanOrEqual(4);
  });

  it("removes upcoming jobs when disabled", async () => {
    await setSchedule();
    await setSchedule({ ...schedule, enabled: false });
    expect(await queue()).toHaveLength(0);
  });

  it("rejects an invalid timezone or weekday", async () => {
    expect((await setSchedule({ ...schedule, timezone: "Mars/Base" })).statusCode).toBe(400);
    expect((await setSchedule({ ...schedule, weekdays: [9] })).statusCode).toBe(400);
  });

  it("generates nothing for a client that isn't connected", async () => {
    await api("PATCH", `/clients/${client.id}`, { paused: true });
    await setSchedule();
    expect(await queue()).toHaveLength(0);
  });
});

describe("rotation", () => {
  it("reserves each image once across the queue", async () => {
    await upload(5);
    await setSchedule();
    const ids = (await queue()).map((j: { imageId: string | null }) => j.imageId).filter(Boolean);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
  });

  it("uses every image before repeating one", async () => {
    await upload(3);
    await setSchedule();
    await runAll();
    const used = await h.ctx.db.libraryImage.findMany({ where: { clientId: client.id } });
    const jobs = (await history()).filter((j: { status: string }) => j.status === "published");
    expect(jobs.length).toBeGreaterThan(3);
    expect(used.every((image) => image.usageCount >= 1)).toBe(true);
    expect(Math.max(...used.map((i) => i.usageCount)) - Math.min(...used.map((i) => i.usageCount))).toBeLessThanOrEqual(1);
  });

  it("flags an empty folder and alerts once", async () => {
    await setSchedule();
    await runAll();
    const jobs = await history();
    expect(jobs.every((j: { status: string }) => j.status === "needs_images")).toBe(true);
    expect(await h.ctx.db.notification.count({ where: { type: "photo.needs_images" } })).toBe(1);
  });

  it("frees an image for reuse when its job is skipped", async () => {
    await upload(1);
    await setSchedule();
    const [job] = await queue();
    expect(job.imageId).toBeTruthy();
    await api("POST", `/clients/${client.id}/photos/jobs/${job.id}/skip`);
    expect((await queue())[0].id).not.toBe(job.id);
    expect(await h.ctx.db.scheduledJob.findUnique({ where: { id: job.id } })).toMatchObject({ status: "skipped", imageId: null });
  });
});

describe("publishing", () => {
  it("uploads, renames, counts usage and logs both names", async () => {
    await upload(2);
    await setSchedule();
    const job = await firstDueNow();
    await runDue();

    const [sent] = await uploads();
    expect(sent!.category).toBe("ADDITIONAL");
    const [record] = await history();
    expect(record.id).toBe(job.id);
    expect(record.status).toBe("published");
    expect(record.logs[0].originalName).toMatch(/^IMG_\d\.png$/);
    expect(record.logs[0].newName).toMatch(/^[a-z0-9-]+\.png$/);
    expect(sent!.sourceUrl.endsWith(record.logs[0].newName)).toBe(true);

    const image = await h.ctx.db.libraryImage.findUniqueOrThrow({ where: { id: record.imageId } });
    expect(image).toMatchObject({ usageCount: 1, seoName: record.logs[0].newName });
    expect(image.lastUsedAt).not.toBeNull();
    expect((await fetch(image.publicUrl)).status).toBe(200);
    expect(await h.ctx.db.aiUsage.count({ where: { clientId: client.id } })).toBe(1);
  });

  it("skips renaming when the client turns it off", async () => {
    await upload(1);
    await api("PATCH", `/clients/${client.id}`, { aiRenameEnabled: false });
    await setSchedule();
    await firstDueNow();
    await runDue();
    const [record] = await history();
    expect(record.logs[0].newName).toBeNull();
    expect(await h.ctx.db.aiUsage.count()).toBe(0);
  });

  it("never sends one job twice, even with parallel dispatchers", async () => {
    await upload(1);
    await setSchedule();
    await firstDueNow();
    await Promise.all([runDue(), runDue(), runDue(), runDue()]);
    expect(await uploads()).toHaveLength(1);
    await runDue();
    expect(await uploads()).toHaveLength(1);
  });

  it("skips a paused client's job without uploading", async () => {
    await upload(1);
    await setSchedule();
    const job = await firstDueNow();
    await api("PATCH", `/clients/${client.id}`, { paused: true });
    await runDue();
    expect(await uploads()).toHaveLength(0);
    expect((await h.ctx.db.scheduledJob.findUnique({ where: { id: job.id } }))?.status).toBe("skipped");
  });
});

describe("failures", () => {
  it("retries with backoff, then goes dead and alerts", async () => {
    await upload(1);
    await setSchedule();
    const job = await firstDueNow();
    await gbp().simulateUploadFailures(client.workspaceId, 10);

    const expected = [1, 5, 25];
    for (const minutes of expected) {
      const now = new Date();
      await dispatchDueJobs(h.ctx.deps, now, { jitter: false });
      const row = await h.ctx.db.scheduledJob.findUniqueOrThrow({ where: { id: job.id } });
      expect(row.status).toBe("scheduled");
      expect(row.runAt.getTime()).toBe(now.getTime() + minutes * 60_000);
      await h.ctx.db.scheduledJob.update({ where: { id: job.id }, data: { runAt: new Date(Date.now() - 1000) } });
    }
    await runDue();
    expect(await h.ctx.db.scheduledJob.findUnique({ where: { id: job.id } })).toMatchObject({ status: "dead", attempts: 4 });
    expect(await h.ctx.db.notification.count({ where: { type: "photo.dead" } })).toBe(1);

    const failed = (await api("GET", "/admin/failed-jobs")).json();
    expect(failed[0]).toMatchObject({ id: job.id, status: "dead" });
  });

  it("recovers on a retry and keeps the same image", async () => {
    await upload(1);
    await setSchedule();
    const job = await firstDueNow();
    await gbp().simulateUploadFailures(client.workspaceId, 1);
    await runDue();
    await h.ctx.db.scheduledJob.update({ where: { id: job.id }, data: { runAt: new Date(Date.now() - 1000) } });
    await runDue();
    expect((await h.ctx.db.scheduledJob.findUnique({ where: { id: job.id } }))?.status).toBe("published");
    expect((await h.ctx.db.libraryImage.findFirstOrThrow()).usageCount).toBe(1);
    expect(await uploads()).toHaveLength(1);
  });

  it("does not retry a 403, and flags the client", async () => {
    await upload(1);
    await setSchedule();
    const job = await firstDueNow();
    await gbp().simulateRevokeLocation(client.workspaceId, client.gbpLocationId);
    await runDue();
    expect(await h.ctx.db.scheduledJob.findUnique({ where: { id: job.id } })).toMatchObject({ status: "failed", attempts: 1 });
    expect((await api("GET", `/clients/${client.id}`)).json().status).toBe("access_removed");
  });

  it("never auto-retries a job stuck mid-upload", async () => {
    await upload(1);
    await setSchedule();
    const job = await firstDueNow();
    await h.ctx.db.scheduledJob.update({ where: { id: job.id }, data: { status: "publishing", startedAt: new Date(Date.now() - 20 * 60_000) } });
    expect(await recoverStuckJobs(h.ctx.deps)).toBe(1);
    expect(await h.ctx.db.scheduledJob.findUnique({ where: { id: job.id } })).toMatchObject({ status: "failed", error: STUCK_ERROR });
    await runDue();
    expect(await uploads()).toHaveLength(0);
  });

  it("lets a person retry a failed job", async () => {
    await upload(1);
    await setSchedule();
    const job = await firstDueNow();
    await gbp().simulateRevokeLocation(client.workspaceId, client.gbpLocationId);
    await runDue();
    await gbp().simulateRestoreLocation(client.workspaceId, client.gbpLocationId);
    await api("POST", "/clients/check-invitations");
    await syncClient(h.ctx.deps, client.id);

    expect((await api("POST", `/clients/${client.id}/photos/jobs/${job.id}/retry`)).statusCode).toBe(200);
    await runDue();
    expect((await h.ctx.db.scheduledJob.findUnique({ where: { id: job.id } }))?.status).toBe("published");
  });
});

describe("library changes", () => {
  it("releases a job's image when it is deleted", async () => {
    await upload(1);
    await setSchedule();
    const [job] = await queue();
    await api("DELETE", `/clients/${client.id}/library/images/${job.imageId}`);
    expect((await h.ctx.db.scheduledJob.findUnique({ where: { id: job.id } }))?.imageId).toBeNull();
  });
});

describe("isolation", () => {
  it("hides schedules and jobs from other workspaces", async () => {
    await upload(1);
    await setSchedule();
    const [job] = await queue();
    const other = await login(h, OTHER_EMAIL);
    const routes: ["GET" | "POST" | "PATCH", string, object?][] = [
      ["GET", `/clients/${client.id}/photo-schedule`],
      ["GET", `/clients/${client.id}/photos/queue`],
      ["GET", `/clients/${client.id}/photos/history`],
      ["PATCH", `/clients/${client.id}/photos/jobs/${job.id}`, { category: "TEAMS" }],
      ["POST", `/clients/${client.id}/photos/jobs/${job.id}/skip`],
    ];
    for (const [method, url, body] of routes) {
      expect((await api(method, url, body, other)).statusCode, url).toBe(404);
    }
    expect((await api("POST", `/admin/failed-jobs/${job.id}/retry`, undefined, other)).statusCode).toBe(404);
  });

  it("rejects another client's image on a job", async () => {
    await upload(1);
    await setSchedule();
    const [job] = await queue();
    const response = await api("PATCH", `/clients/${client.id}/photos/jobs/${job.id}`, { imageId: "00000000-0000-4000-8000-000000000000" });
    expect(response.statusCode).toBe(404);
  });
});

describe("OpenAI settings", () => {
  it("stores the key encrypted and only ever shows it masked", async () => {
    const key = "sk-test-abcdefghijklmnop1234";
    expect((await api("PUT", "/settings/openai", { apiKey: key, visionModel: "gpt-test" })).statusCode).toBe(200);
    const row = await h.ctx.db.openaiSettings.findFirstOrThrow();
    expect(row.apiKeyEnc).not.toContain(key);
    const response = await api("GET", "/settings/openai");
    expect(response.body).not.toContain(key);
    expect(response.json()).toMatchObject({ connected: true, maskedKey: "sk-...1234", visionModel: "gpt-test" });
  });

  it("keeps the key when saving only the model", async () => {
    await api("PUT", "/settings/openai", { apiKey: "sk-test-abcdefghijklmnop1234", visionModel: "a" });
    await api("PUT", "/settings/openai", { visionModel: "b" });
    expect((await api("GET", "/settings/openai")).json()).toMatchObject({ maskedKey: "sk-...1234", visionModel: "b" });
  });

  it("reports estimated cost per client", async () => {
    await upload(1);
    await setSchedule();
    await firstDueNow();
    await runDue();
    const { clients } = (await api("GET", "/settings/openai/usage")).json();
    expect(clients[0]).toMatchObject({ clientId: client.id, calls: 1 });
    expect(clients[0].estCost).toBeGreaterThan(0);
  });
});
