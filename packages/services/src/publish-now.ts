import type { JobStatus } from "@localpilot/db";
import { processPhotoJob } from "./photos";
import { generatePostForJob, processPostJob } from "./posts";
import type { Deps } from "./context";
import { workerHealth } from "./worker-status";

export interface PublishNowResult {
  status: JobStatus;
  error: string | null;
  simulated: boolean;
}

export class PublishNowError extends Error {
  constructor(
    public readonly code: "not_publishable" | "needs_approval",
    message: string,
  ) {
    super(message);
  }
}

/**
 * Runs one upcoming job right away, for testing a schedule without waiting.
 * It goes through the same claim-and-publish path the worker uses, so the result is real
 * (or simulated, with the mock adapter) and is logged and counted the same way.
 */
export async function publishJobNow(deps: Deps, jobId: string): Promise<PublishNowResult> {
  let job = await deps.db.scheduledJob.findUniqueOrThrow({ where: { id: jobId }, include: { post: true } });
  if (job.status === "awaiting_approval") throw new PublishNowError("needs_approval", "Approve this post first, then publish it.");
  if (job.status !== "scheduled") throw new PublishNowError("not_publishable", "Only upcoming items can be published now");

  if (job.type === "seo_post" && !job.post) {
    await generatePostForJob(deps, job);
    job = await deps.db.scheduledJob.findUniqueOrThrow({ where: { id: jobId }, include: { post: true } });
    if (job.status === "awaiting_approval") throw new PublishNowError("needs_approval", "The post is written. Review and approve it, then publish it.");
    if (job.status !== "scheduled") return { status: job.status, error: job.error, simulated: job.simulated };
  }

  const now = new Date();
  // Moving runAt to now keeps the worker's claim rule intact: only due, scheduled jobs are claimed.
  await deps.db.scheduledJob.updateMany({ where: { id: jobId, status: "scheduled" }, data: { runAt: now, manuallyEdited: true } });
  deps.logger.info({ stage: "publish_now", type: job.type, jobId, clientId: job.clientId }, "publish now requested");
  await (job.type === "photo" ? processPhotoJob(deps, jobId, now) : processPostJob(deps, jobId, now));

  const finished = await deps.db.scheduledJob.findUniqueOrThrow({ where: { id: jobId } });
  return { status: finished.status, error: finished.error, simulated: finished.simulated };
}

export type Blocker =
  | { code: "client_not_connected"; message: string }
  | { code: "schedule_off"; message: string }
  | { code: "no_schedule"; message: string }
  | { code: "folder_empty"; message: string }
  | { code: "worker_offline"; message: string }
  | { code: "api_not_approved"; message: string }
  | { code: "needs_approval"; message: string; count: number };

export interface Readiness {
  /** True when nothing stops the next item from publishing on time. */
  ready: boolean;
  simulated: boolean;
  blockers: Blocker[];
}

/** Explains, in plain words, why scheduled items for this client won't publish. */
export async function scheduleReadiness(deps: Deps, clientId: string, type: "photo" | "seo_post", now = new Date()): Promise<Readiness> {
  const client = await deps.db.client.findUniqueOrThrow({ where: { id: clientId } });
  const schedule =
    type === "photo" ? await deps.db.photoSchedule.findUnique({ where: { clientId } }) : await deps.db.seoSchedule.findUnique({ where: { clientId } });
  const folderKind = type === "photo" ? "photos" : "seo_images";
  const [images, health, settings, awaiting] = await Promise.all([
    deps.db.libraryImage.count({ where: { clientId, deletedAt: null, folder: { kind: folderKind } } }),
    workerHealth(deps.db, now),
    deps.db.appSettings.findUnique({ where: { id: 1 } }),
    type === "seo_post" ? deps.db.scheduledJob.count({ where: { clientId, type, status: "awaiting_approval" } }) : Promise.resolve(0),
  ]);

  const blockers: Blocker[] = [];
  if (client.status !== "connected") {
    blockers.push({
      code: "client_not_connected",
      message: `This client is ${client.status.replace(/_/g, " ")}. Items are only scheduled and published for connected clients.`,
    });
  }
  if (!schedule) blockers.push({ code: "no_schedule", message: "No schedule is saved yet." });
  else if (!schedule.enabled) blockers.push({ code: "schedule_off", message: "The schedule is switched off." });
  if (images === 0) {
    blockers.push({
      code: "folder_empty",
      message: `The ${type === "photo" ? "Photos" : "SEO Post Images"} folder in the Library is empty, so there is nothing to publish.`,
    });
  }
  if (health.status !== "online") {
    blockers.push({
      code: "worker_offline",
      message:
        health.status === "never_started"
          ? "The background worker has never checked in, so nothing publishes on schedule. Check that the worker container is running."
          : "The background worker is offline, so nothing publishes on schedule. Check the worker container.",
    });
  }
  if (deps.gbp.name === "real" && settings?.apiAccess === "not_approved") {
    blockers.push({ code: "api_not_approved", message: "Google Business Profile API access is not approved for this project, so Google rejects every publish." });
  }
  if (awaiting > 0) {
    blockers.push({ code: "needs_approval", count: awaiting, message: `${awaiting} ${awaiting === 1 ? "post is" : "posts are"} waiting for approval. Unapproved posts never publish.` });
  }
  // Waiting approvals are a nudge, not a stop: other posts can still publish.
  const ready = blockers.every((blocker) => blocker.code === "needs_approval");
  return { ready, simulated: deps.gbp.name === "mock", blockers };
}

