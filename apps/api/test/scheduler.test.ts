import { GbpError, MockGbpAdapter, QUOTA_ZERO_MESSAGE, type GbpAdapter } from "@localpilot/gbp";
import { dispatchDueJobs, materializeAll, recordHeartbeat, recordJobRun, regenerateClient, type Deps } from "@localpilot/services";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { connectGoogle, createHarness, login, makePng, multipart, type Cookies, type Harness } from "./helpers";
import { resetDb } from "./helpers";

/**
 * The full scheduling path, end to end: schedule -> jobs created -> job picked at its time ->
 * published (simulated with the mock adapter) -> logs and image usage updated. Also covers
 * timezones, daylight saving, retries, Google's zero-quota error, Publish now and worker health.
 */

let h: Harness;
let cookies: Cookies;
let client: { id: string; workspaceId: string };

const MINUTE = 60_000;
const api = (method: "GET" | "POST" | "PUT", url: string, payload?: object, as: Cookies | undefined = cookies) =>
  h.app.inject({ method, url: `/api/v1${url}`, cookies: as, ...(payload ? { payload } : {}) });
const upload = async (count: number, folder: "photos" | "seo_images" = "photos") => {
  const files = Array.from({ length: count }, (_, n) => ({ name: `IMG_${folder}_${n}.png`, data: makePng() }));
  await h.app.inject({ method: "POST", url: `/api/v1/clients/${client.id}/library/images?folder=${folder}`, cookies, ...multipart(files) });
};
const photoRule = (over: object = {}) => ({ weekdays: [1, 2, 3, 4, 5, 6, 7], localTime: "10:00", timezone: "Asia/Kolkata", countPerDay: 1, defaultCategory: "ADDITIONAL", enabled: true, ...over });
const jobs = () => h.ctx.db.scheduledJob.findMany({ where: { clientId: client.id, type: "photo" }, orderBy: { runAt: "asc" } });
const firstJob = async () => {
  const [job] = await jobs();
  if (!job) throw new Error("expected a scheduled job");
  return job;
};
const dispatchAt = (at: Date, deps: Deps = h.ctx.deps) => dispatchDueJobs(deps, at, { jitter: false });
const gbp = () => h.ctx.deps.gbp as MockGbpAdapter;

beforeAll(async () => {
  h = await createHarness();
});
beforeEach(async () => {
  await resetDb(h);
  await h.ctx.db.$executeRawUnsafe("TRUNCATE worker_status, worker_job_runs, app_settings");
  cookies = await login(h);
  await connectGoogle(h, cookies);
  const [location] = (await api("GET", "/locations/unattached")).json();
  client = (await api("POST", "/clients/import", { locations: [{ accountId: location.accountId, locationId: location.locationId }] })).json()[0];
});
afterAll(async () => {
  await h.app.close();
  await h.ctx.db.$disconnect();
});

describe("schedule to published", () => {
  it("creates jobs in the client's timezone, waits for run time, then publishes and records everything", async () => {
    await upload(3);
    expect((await api("PUT", `/clients/${client.id}/photo-schedule`, photoRule())).statusCode).toBe(200);
    // Rebuild from a fixed moment so the expected times are exact.
    const from = new Date("2026-11-16T00:00:00Z"); // Monday, 05:30 in Kolkata
    await regenerateClient(h.ctx.deps, client.id, from);
    const first = await firstJob();
    // 10:00 in Asia/Kolkata (UTC+5:30) is 04:30 UTC, the same day.
    expect(first.runAt.toISOString()).toBe("2026-11-16T04:30:00.000Z");
    expect(first.status).toBe("scheduled");

    // One minute early: nothing is picked.
    expect(await dispatchAt(new Date(first.runAt.getTime() - MINUTE))).toBe(0);
    expect((await h.ctx.db.scheduledJob.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("scheduled");

    // At run time: picked and published.
    expect(await dispatchAt(first.runAt)).toBe(1);
    const done = await h.ctx.db.scheduledJob.findUniqueOrThrow({ where: { id: first.id }, include: { logs: true, image: true } });
    expect(done.status).toBe("published");
    expect(done.simulated).toBe(true);
    expect(done.logs).toHaveLength(1);
    expect(done.logs[0]).toMatchObject({ action: "photo.upload", status: "published", meta: { simulated: true } });
    expect(done.image?.usageCount).toBe(1);
    expect(done.image?.lastUsedAt).not.toBeNull();
    expect(await gbp().listUploads(client.workspaceId)).toHaveLength(1);

    // History marks it as simulated for the UI.
    const history = (await api("GET", `/clients/${client.id}/photos/history`)).json();
    expect(history[0]).toMatchObject({ id: first.id, status: "published", simulated: true });
  });

  it("keeps the wall-clock time across a daylight saving change", async () => {
    await upload(2);
    await api("PUT", `/clients/${client.id}/photo-schedule`, photoRule({ timezone: "America/New_York", localTime: "09:00" }));
    // New York leaves daylight saving on Sunday 1 November 2026.
    await regenerateClient(h.ctx.deps, client.id, new Date("2026-10-29T00:00:00Z"));
    const byDate = new Map((await jobs()).map((job) => [job.runAt.toISOString().slice(0, 10), job.runAt.toISOString()]));
    expect(byDate.get("2026-10-30")).toBe("2026-10-30T13:00:00.000Z"); // 09:00 EDT = UTC-4
    expect(byDate.get("2026-11-02")).toBe("2026-11-02T14:00:00.000Z"); // 09:00 EST = UTC-5
  });

  it("is created by the hourly materialize job too, without duplicates", async () => {
    await upload(2);
    await api("PUT", `/clients/${client.id}/photo-schedule`, photoRule());
    const before = (await jobs()).length;
    expect(before).toBeGreaterThan(0);
    await materializeAll(h.ctx.deps);
    expect((await jobs()).length).toBe(before);
  });
});

describe("retries", () => {
  it("retries after 1 and 5 minutes, then publishes on the third try", async () => {
    await upload(2);
    await api("PUT", `/clients/${client.id}/photo-schedule`, photoRule());
    await regenerateClient(h.ctx.deps, client.id, new Date("2026-11-16T00:00:00Z"));
    const first = await firstJob();
    await api("POST", "/dev/mock/fail-uploads", { count: 2 });

    await dispatchAt(first.runAt);
    let job = await h.ctx.db.scheduledJob.findUniqueOrThrow({ where: { id: first.id } });
    expect(job).toMatchObject({ status: "scheduled", attempts: 1 });
    expect(job.runAt.getTime()).toBe(first.runAt.getTime() + MINUTE);

    // Not yet due: the retry waits.
    expect(await dispatchAt(new Date(job.runAt.getTime() - 1000))).toBe(0);

    await dispatchAt(job.runAt);
    const second = await h.ctx.db.scheduledJob.findUniqueOrThrow({ where: { id: first.id } });
    expect(second).toMatchObject({ status: "scheduled", attempts: 2 });
    expect(second.runAt.getTime()).toBe(job.runAt.getTime() + 5 * MINUTE);

    await dispatchAt(second.runAt);
    job = await h.ctx.db.scheduledJob.findUniqueOrThrow({ where: { id: first.id } });
    expect(job.status).toBe("published");
    const logs = await h.ctx.db.publishLog.findMany({ where: { jobId: first.id }, orderBy: { createdAt: "asc" } });
    expect(logs.map((log) => log.status)).toEqual(["failed", "failed", "published"]);
  });
});

describe("Google API not approved", () => {
  /** A real-adapter stand-in whose every upload hits Google's zero-quota answer. */
  function quotaZeroDeps(): Deps {
    const real: GbpAdapter = Object.create(h.ctx.deps.gbp, {
      name: { value: "real" },
      session: {
        value: () => ({
          uploadPhoto: async () => {
            throw new GbpError("quota_zero", QUOTA_ZERO_MESSAGE);
          },
        }),
      },
    });
    return { ...h.ctx.deps, gbp: real };
  }

  it("fails once with a clear message, never retries, and records that access isn't approved", async () => {
    await upload(2);
    await api("PUT", `/clients/${client.id}/photo-schedule`, photoRule());
    await regenerateClient(h.ctx.deps, client.id, new Date("2026-11-16T00:00:00Z"));
    const first = await firstJob();
    await dispatchAt(first.runAt, quotaZeroDeps());

    const job = await h.ctx.db.scheduledJob.findUniqueOrThrow({ where: { id: first.id } });
    expect(job).toMatchObject({ status: "failed", attempts: 1, error: "Google Business Profile API access is not approved for this project" });
    // A later dispatch doesn't pick it up again.
    expect(await dispatchAt(new Date(first.runAt.getTime() + 60 * MINUTE), quotaZeroDeps())).toBe(0);
    expect((await h.ctx.db.appSettings.findUnique({ where: { id: 1 } }))?.apiAccess).toBe("not_approved");
    const alerts = await h.ctx.db.notification.findMany({ where: { type: "gbp.quota_zero" } });
    expect(alerts).toHaveLength(1);
  });
});

describe("publish now", () => {
  it("publishes an upcoming photo immediately and labels it simulated", async () => {
    await upload(2);
    await api("PUT", `/clients/${client.id}/photo-schedule`, photoRule());
    const first = await firstJob();
    const response = await api("POST", `/clients/${client.id}/photos/jobs/${first.id}/publish-now`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "published", simulated: true, error: null });
    expect(await gbp().listUploads(client.workspaceId)).toHaveLength(1);
    // A second press can't send it twice.
    expect((await api("POST", `/clients/${client.id}/photos/jobs/${first.id}/publish-now`)).statusCode).toBe(409);
  });

  it("asks for approval before publishing a draft post", async () => {
    await upload(2, "seo_images");
    const rule = { weekdays: [1, 2, 3, 4, 5, 6, 7], localTime: "16:00", timezone: "Asia/Kolkata", countPerDay: 1, enabled: true, seoMode: "draft", draftLeadHours: 48, ctaType: "LEARN_MORE", ctaUrl: "https://example.com/book" };
    await api("PUT", `/clients/${client.id}/seo-schedule`, rule);
    const [post] = (await api("GET", `/clients/${client.id}/posts`)).json();
    const first = await api("POST", `/clients/${client.id}/posts/${post.id}/publish-now`);
    expect(first.statusCode).toBe(409);
    expect(first.json().error.code).toBe("needs_approval");

    expect((await api("POST", `/clients/${client.id}/posts/${post.id}/approve`)).statusCode).toBe(200);
    const second = await api("POST", `/clients/${client.id}/posts/${post.id}/publish-now`);
    expect(second.json()).toMatchObject({ status: "published", simulated: true });
    expect(await gbp().listPosts(client.workspaceId)).toHaveLength(1);
  });

  it("writes and publishes in one go in auto mode", async () => {
    await upload(2, "seo_images");
    const rule = { weekdays: [1, 2, 3, 4, 5, 6, 7], localTime: "16:00", timezone: "UTC", countPerDay: 1, enabled: true, seoMode: "auto", draftLeadHours: 48, ctaType: "LEARN_MORE", ctaUrl: "https://example.com/book" };
    await api("PUT", `/clients/${client.id}/seo-schedule`, rule);
    const [post] = (await api("GET", `/clients/${client.id}/posts`)).json();
    const response = await api("POST", `/clients/${client.id}/posts/${post.id}/publish-now`);
    expect(response.json()).toMatchObject({ status: "published", simulated: true });
  });
});

describe("worker health", () => {
  it("reports never started, online, then offline", async () => {
    let response = await h.app.inject({ method: "GET", url: "/api/health/worker" });
    expect(response.statusCode).toBe(503);
    expect(response.json().status).toBe("never_started");

    await recordHeartbeat(h.ctx.db, { startedAt: new Date(), adapter: "mock" });
    response = await h.app.inject({ method: "GET", url: "/api/health/worker" });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("online");

    await recordHeartbeat(h.ctx.db, { startedAt: new Date(), adapter: "mock" }, new Date(Date.now() - 5 * MINUTE));
    response = await h.app.inject({ method: "GET", url: "/api/health/worker" });
    expect(response.statusCode).toBe(503);
    expect(response.json().status).toBe("offline");
  });

  it("shows each job's last run and failure to signed-in users only", async () => {
    await recordHeartbeat(h.ctx.db, { startedAt: new Date(), adapter: "mock" });
    await recordJobRun(h.ctx.db, "publish-due-jobs", async () => 2);
    await expect(recordJobRun(h.ctx.db, "sync-reviews", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");

    expect((await h.app.inject({ method: "GET", url: "/api/v1/admin/worker" })).statusCode).toBe(401);
    const body = (await api("GET", "/admin/worker")).json();
    expect(body.status).toBe("online");
    expect(body.adapterInUse).toBe("mock");
    const byName = Object.fromEntries(body.jobs.map((job: { name: string }) => [job.name, job]));
    expect(byName["publish-due-jobs"]).toMatchObject({ runs: 1, failures: 0, lastError: null });
    expect(byName["sync-reviews"]).toMatchObject({ runs: 1, failures: 1, lastError: "boom" });
  });
});

describe("readiness", () => {
  it("explains what stops publishing, and clears once fixed", async () => {
    await api("PUT", `/clients/${client.id}/photo-schedule`, photoRule());
    let readiness = (await api("GET", `/clients/${client.id}/photo-schedule`)).json().readiness;
    expect(readiness.ready).toBe(false);
    expect(readiness.simulated).toBe(true);
    expect(readiness.blockers.map((b: { code: string }) => b.code).sort()).toEqual(["folder_empty", "worker_offline"]);

    await upload(1);
    await recordHeartbeat(h.ctx.db, { startedAt: new Date(), adapter: "mock" });
    readiness = (await api("GET", `/clients/${client.id}/photo-schedule`)).json().readiness;
    expect(readiness).toMatchObject({ ready: true, blockers: [] });
  });

  it("flags a client that isn't connected", async () => {
    await h.ctx.db.client.update({ where: { id: client.id }, data: { status: "reconnect_required" } });
    const readiness = (await api("GET", `/clients/${client.id}/photo-schedule`)).json().readiness;
    expect(readiness.blockers.map((b: { code: string }) => b.code)).toContain("client_not_connected");
  });
});
