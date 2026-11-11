import { expandSchedule, MAX_RETRIES, pickImages, retryDelayMs, rotationOrder, slugifyFilename } from "@localpilot/core";
import { randomToken } from "@localpilot/crypto";
import type { Client, LibraryImage, ScheduledJob } from "@localpilot/db";
import { GbpError, QUOTA_ZERO_MESSAGE } from "@localpilot/gbp";
import { aiClientFor, recordUsage } from "./ai";
import { recordApiAccess } from "./connect";
import { notify, sessionFor, type Deps } from "./context";
import { loadKnowledge } from "./knowledge";
import { processPostJob, flagOverdueDrafts } from "./posts";
import { applyGbpFailure } from "./sync";

const BATCH_SIZE = 20;
const STUCK_AFTER_MS = 10 * 60_000;
const MIN_JITTER_MS = 1_000;
const MAX_JITTER_MS = 5_000;
const NOTIFY_WINDOW_MS = 24 * 60 * 60_000;
export const STUCK_ERROR = "The upload was interrupted, so it may have reached Google. Check the profile before retrying.";

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png" };

async function photoImages(deps: Deps, clientId: string): Promise<LibraryImage[]> {
  return deps.db.libraryImage.findMany({ where: { clientId, deletedAt: null, folder: { kind: "photos" } } });
}

async function reservedImageIds(deps: Deps, clientId: string): Promise<Set<string>> {
  const jobs = await deps.db.scheduledJob.findMany({
    where: { clientId, type: "photo", status: "scheduled", imageId: { not: null } },
    select: { imageId: true },
  });
  return new Set(jobs.map((job) => job.imageId!));
}

/** Creates jobs for the next 14 days. Safe to repeat: keys are unique per slot. */
export async function materializeClient(deps: Deps, clientId: string, now = new Date()): Promise<number> {
  const schedule = await deps.db.photoSchedule.findUnique({ where: { clientId }, include: { client: true } });
  if (!schedule?.enabled || schedule.client.status !== "connected") {
    const reason = !schedule ? "no_schedule" : !schedule.enabled ? "schedule_off" : `client_${schedule.client.status}`;
    deps.logger.info({ stage: "materialize.skipped", type: "photo", clientId, reason }, "photo jobs not created");
    return 0;
  }

  const slots = expandSchedule(schedule, now);
  const keyFor = (slot: (typeof slots)[number]) => `${clientId}:photo:${schedule.id}:${slot.localKey}:${slot.index}`;
  const existing = await deps.db.scheduledJob.findMany({
    where: { idempotencyKey: { in: slots.map(keyFor) } },
    select: { idempotencyKey: true },
  });
  const known = new Set(existing.map((job) => job.idempotencyKey));
  const fresh = slots.filter((slot) => !known.has(keyFor(slot)));
  if (fresh.length === 0) return 0;

  // Jobs beyond the folder's size stay empty and pick an image when they run.
  const images = pickImages(await photoImages(deps, clientId), await reservedImageIds(deps, clientId), fresh.length);
  const { count } = await deps.db.scheduledJob.createMany({
    data: fresh.map((slot, position) => ({
      workspaceId: schedule.workspaceId,
      clientId,
      type: "photo" as const,
      scheduleId: schedule.id,
      scheduleVersion: schedule.version,
      runAt: slot.runAt,
      category: schedule.defaultCategory,
      imageId: images[position]?.id ?? null,
      idempotencyKey: keyFor(slot),
    })),
    skipDuplicates: true,
  });
  deps.logger.info({ stage: "materialized", type: "photo", clientId, created: count, timezone: schedule.timezone, firstRunAt: fresh[0]?.runAt }, "photo jobs created");
  return count;
}

/** Applies a schedule change. Manually edited jobs and retries in progress stay put. */
export async function regenerateClient(deps: Deps, clientId: string, now = new Date()): Promise<number> {
  await deps.db.scheduledJob.deleteMany({
    where: { clientId, type: "photo", status: { in: ["scheduled", "needs_images"] }, manuallyEdited: false, attempts: 0 },
  });
  return materializeClient(deps, clientId, now);
}

export async function materializeAll(deps: Deps, now = new Date()): Promise<number> {
  const schedules = await deps.db.photoSchedule.findMany({
    where: { enabled: true, client: { status: "connected" } },
    select: { clientId: true },
  });
  let created = 0;
  for (const { clientId } of schedules) created += await materializeClient(deps, clientId, now);
  return created;
}

export async function writeLog(deps: Deps, job: ScheduledJob, action: string, entry: { status: string; originalName?: string; newName?: string; resource?: string; error?: string; meta?: object }) {
  await deps.db.publishLog.create({
    data: {
      workspaceId: job.workspaceId,
      clientId: job.clientId,
      jobId: job.id,
      action,
      status: entry.status,
      originalName: entry.originalName,
      newName: entry.newName,
      gbpResourceName: entry.resource,
      error: entry.error,
      meta: entry.meta ?? {},
    },
  });
}

/** Repeated failures share one alert a day, so a bad morning can't flood the bell. */
export async function alertOnce(deps: Deps, job: ScheduledJob, input: { type: string; title: string; body: string; severity: "info" | "warning" | "critical" }) {
  const recent = await deps.db.notification.findFirst({
    where: { clientId: job.clientId, type: input.type, createdAt: { gte: new Date(Date.now() - NOTIFY_WINDOW_MS) } },
    select: { id: true },
  });
  if (!recent) await notify(deps, { workspaceId: job.workspaceId, clientId: job.clientId, ...input });
}

interface LocationDetails {
  service: string | null;
  city: string | null;
}

async function locationDetails(deps: Deps, client: Client): Promise<LocationDetails> {
  const knowledge = await loadKnowledge(deps, client);
  const place = knowledge.address?.split(",").map((part) => part.trim()).filter((part) => !/\d/.test(part)).at(-1);
  return { service: knowledge.services[0] ?? knowledge.categories[0] ?? null, city: knowledge.targetAreas[0] ?? place ?? null };
}

interface Renamed {
  image: LibraryImage;
  note: string | null;
}

/** A naming problem never blocks the upload: the photo goes out with its current name. */
async function renameImage(deps: Deps, client: Client, image: LibraryImage): Promise<Renamed> {
  if (!client.aiRenameEnabled) return { image, note: "AI renaming is off" };
  if (image.seoName) return { image, note: null };
  const ai = await aiClientFor(deps, client.workspaceId);
  if (!ai) return { image, note: "No OpenAI key is set" };

  try {
    const details = await locationDetails(deps, client);
    const body = await deps.storage.get(image.storageKey);
    const result = await ai.client.renameImage({
      image: body,
      mime: image.mime,
      businessName: client.name,
      originalName: image.originalName,
      ...details,
    });
    await recordUsage(deps, ai, { workspaceId: client.workspaceId, clientId: client.id, feature: "photo_rename", result });
    const slug = slugifyFilename(result.name);
    if (!slug) return { image, note: "OpenAI returned an unusable name" };

    const filename = `${slug}.${EXTENSIONS[image.mime] ?? "jpg"}`;
    const key = deps.storage.publicKey(`${client.id}/${randomToken(6)}/${filename}`);
    await deps.storage.copy(image.storageKey, key);
    const renamed = await deps.db.libraryImage.update({
      where: { id: image.id },
      data: { seoName: filename, storageKey: key, publicUrl: deps.storage.publicUrl(key) },
    });
    await deps.storage.remove(image.storageKey);
    return { image: renamed, note: null };
  } catch (error) {
    return { image, note: `Renaming failed: ${error instanceof Error ? error.message : "unknown error"}` };
  }
}

async function chooseImage(deps: Deps, job: ScheduledJob): Promise<LibraryImage | null> {
  const images = await photoImages(deps, job.clientId);
  const assigned = images.find((image) => image.id === job.imageId);
  if (assigned) return assigned;
  const [unreserved] = pickImages(images, await reservedImageIds(deps, job.clientId), 1);
  return unreserved ?? rotationOrder(images)[0] ?? null;
}

export async function failJob(
  deps: Deps,
  job: ScheduledJob,
  client: Client,
  image: LibraryImage | null,
  error: unknown,
  now: Date,
  kind = { action: "photo.upload", label: "Photo" },
): Promise<void> {
  const message = error instanceof Error ? error.message : "Unknown error";
  const failures = job.attempts + 1;
  const names = { originalName: image?.originalName, newName: image?.seoName ?? undefined };
  const permanent = error instanceof GbpError && error.kind !== "rate_limited" && error.kind !== "unavailable";

  await writeLog(deps, job, kind.action, { status: "failed", error: message, ...names, meta: { attempt: failures } });
  deps.logger.warn(
    { stage: "failed", type: job.type, jobId: job.id, clientId: job.clientId, attempt: failures, permanent, kind: error instanceof GbpError ? error.kind : "error", error: message },
    "job failed",
  );
  if (error instanceof GbpError && error.kind === "quota_zero") {
    // Retrying can't help until Google approves the project, so fail once with a clear reason.
    await deps.db.scheduledJob.update({ where: { id: job.id }, data: { status: "failed", attempts: failures, error: QUOTA_ZERO_MESSAGE, finishedAt: now } });
    await recordApiAccess(deps, "not_approved");
    await alertOnce(deps, job, {
      type: "gbp.quota_zero",
      severity: "critical",
      title: "Google API access not approved",
      body: `${QUOTA_ZERO_MESSAGE}. Scheduled posts can't publish until Google approves it.`,
    });
    return;
  }
  if (permanent) {
    await deps.db.scheduledJob.update({ where: { id: job.id }, data: { status: "failed", attempts: failures, error: message, finishedAt: now } });
    await applyGbpFailure(deps, client, error);
    return;
  }
  if (failures <= MAX_RETRIES) {
    await deps.db.scheduledJob.update({
      where: { id: job.id },
      data: { status: "scheduled", attempts: failures, error: message, runAt: new Date(now.getTime() + retryDelayMs(failures)) },
    });
    return;
  }
  await deps.db.scheduledJob.update({ where: { id: job.id }, data: { status: "dead", attempts: failures, error: message, finishedAt: now } });
  await alertOnce(deps, job, {
    type: `${kind.label.toLowerCase()}.dead`,
    severity: "critical",
    title: `${kind.label} failed for ${client.name}`,
    body: `Gave up after ${MAX_RETRIES} retries: ${message}`,
  });
}

/** Claiming flips the status atomically, so two workers can never send the same job. */
export async function processPhotoJob(deps: Deps, jobId: string, now = new Date()): Promise<void> {
  const claimed = await deps.db.scheduledJob.updateMany({
    where: { id: jobId, status: "scheduled", runAt: { lte: now } },
    data: { status: "publishing", startedAt: now },
  });
  if (claimed.count === 0) return;

  const job = await deps.db.scheduledJob.findUniqueOrThrow({ where: { id: jobId } });
  const client = await deps.db.client.findUniqueOrThrow({ where: { id: job.clientId }, include: { connection: true } });
  deps.logger.info({ stage: "publishing", type: "photo", jobId, clientId: job.clientId, runAt: job.runAt, attempt: job.attempts + 1, adapter: deps.gbp.name }, "photo publishing");

  if (client.status === "paused") {
    await deps.db.scheduledJob.update({ where: { id: job.id }, data: { status: "skipped", error: "Client is paused", imageId: null, finishedAt: now } });
    deps.logger.info({ stage: "skipped", type: "photo", jobId, reason: "client_paused" }, "photo skipped");
    return;
  }
  if (client.status !== "connected" || !client.connection) {
    const error = `Client is ${client.status.replace(/_/g, " ")}`;
    await deps.db.scheduledJob.update({ where: { id: job.id }, data: { status: "failed", error, finishedAt: now } });
    await writeLog(deps, job, "photo.upload", { status: "failed", error });
    deps.logger.warn({ stage: "failed", type: "photo", jobId, error }, "photo failed");
    return;
  }

  const chosen = await chooseImage(deps, job);
  if (!chosen) {
    await deps.db.scheduledJob.update({ where: { id: job.id }, data: { status: "needs_images", error: "The Photos folder is empty", finishedAt: now } });
    await alertOnce(deps, job, {
      type: "photo.needs_images",
      severity: "warning",
      title: `${client.name} is out of photos`,
      body: "Upload images to the Photos folder. Scheduled uploads can't run until then.",
    });
    return;
  }

  const { image, note } = await renameImage(deps, client, chosen);
  try {
    const uploaded = await sessionFor(deps, client.connection).uploadPhoto({
      accountId: client.gbpAccountId!,
      locationId: client.gbpLocationId!,
      sourceUrl: image.publicUrl,
      category: job.category ?? "ADDITIONAL",
    });
    const simulated = deps.gbp.name === "mock";
    await deps.db.$transaction([
      deps.db.scheduledJob.update({
        where: { id: job.id },
        data: { status: "published", imageId: image.id, error: null, finishedAt: new Date(), simulated },
      }),
      deps.db.libraryImage.update({ where: { id: image.id }, data: { usageCount: { increment: 1 }, lastUsedAt: new Date() } }),
    ]);
    await writeLog(deps, job, "photo.upload", {
      status: "published",
      originalName: image.originalName,
      newName: image.seoName ?? undefined,
      resource: uploaded.name,
      meta: { ...(note ? { note } : {}), ...(simulated ? { simulated: true } : {}) },
    });
    deps.logger.info({ stage: "published", type: "photo", jobId, clientId: job.clientId, simulated, resource: uploaded.name }, "photo published");
  } catch (error) {
    await failJob(deps, job, client, image, error, now);
  }
}

/** A job stuck mid-upload may have reached Google, so a person decides. It never retries itself. */
export async function recoverStuckJobs(deps: Deps, now = new Date()): Promise<number> {
  const stuck = await deps.db.scheduledJob.findMany({
    where: { status: "publishing", startedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } },
  });
  for (const job of stuck) {
    await deps.db.scheduledJob.update({ where: { id: job.id }, data: { status: "failed", error: STUCK_ERROR, finishedAt: now } });
    await writeLog(deps, job, "photo.upload", { status: "failed", error: STUCK_ERROR });
    await alertOnce(deps, job, { type: "photo.stuck", severity: "critical", title: "A photo upload needs checking", body: STUCK_ERROR });
  }
  return stuck.length;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs due jobs one at a time, which keeps us inside Google's per-project quota. */
export async function dispatchDueJobs(deps: Deps, now = new Date(), options: { jitter?: boolean } = {}): Promise<number> {
  await recoverStuckJobs(deps, now);
  await flagOverdueDrafts(deps, now);
  const due = await deps.db.scheduledJob.findMany({
    where: { status: "scheduled", runAt: { lte: now }, OR: [{ type: "photo" }, { type: "seo_post", post: { isNot: null } }] },
    orderBy: { runAt: "asc" },
    take: BATCH_SIZE,
    select: { id: true, type: true },
  });
  if (due.length) deps.logger.info({ stage: "picked", count: due.length, jobIds: due.map((job) => job.id) }, "due jobs picked");
  for (const [position, { id, type }] of due.entries()) {
    if (position > 0 && options.jitter !== false) await pause(MIN_JITTER_MS + Math.random() * (MAX_JITTER_MS - MIN_JITTER_MS));
    await (type === "photo" ? processPhotoJob(deps, id, now) : processPostJob(deps, id, now));
  }
  return due.length;
}
