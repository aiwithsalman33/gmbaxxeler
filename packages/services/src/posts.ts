import { aiLabelForCta, type AiResult } from "@localpilot/ai";
import { capPostText, expandSchedule, pickImages, rotationOrder } from "@localpilot/core";
import type { Client, ClientProfile, LibraryImage, ScheduledJob } from "@localpilot/db";
import { aiClientFor, recordUsage } from "./ai";
import { sessionFor, type Deps } from "./context";
import { loadKnowledge } from "./knowledge";
import { alertOnce, failJob, writeLog } from "./photos";

const AUTO_LEAD_MS = 15 * 60_000;
const RECENT_POST_COUNT = 10;
const BATCH_SIZE = 20;

function seoImages(deps: Deps, clientId: string): Promise<LibraryImage[]> {
  return deps.db.libraryImage.findMany({ where: { clientId, deletedAt: null, folder: { kind: "seo_images" } } });
}

async function reservedSeoImages(deps: Deps, clientId: string): Promise<Set<string>> {
  const jobs = await deps.db.scheduledJob.findMany({
    where: { clientId, type: "seo_post", status: { in: ["scheduled", "awaiting_approval"] }, imageId: { not: null } },
    select: { imageId: true },
  });
  return new Set(jobs.map((job) => job.imageId!));
}

export async function materializeSeoClient(deps: Deps, clientId: string, now = new Date()): Promise<number> {
  const schedule = await deps.db.seoSchedule.findUnique({ where: { clientId }, include: { client: true } });
  if (!schedule?.enabled || schedule.client.status !== "connected") return 0;

  const slots = expandSchedule(schedule, now);
  const keyFor = (slot: (typeof slots)[number]) => `${clientId}:seo:${schedule.id}:${slot.localKey}:${slot.index}`;
  const existing = await deps.db.scheduledJob.findMany({ where: { idempotencyKey: { in: slots.map(keyFor) } }, select: { idempotencyKey: true } });
  const known = new Set(existing.map((job) => job.idempotencyKey));
  const fresh = slots.filter((slot) => !known.has(keyFor(slot)));
  if (fresh.length === 0) return 0;

  const images = pickImages(await seoImages(deps, clientId), await reservedSeoImages(deps, clientId), fresh.length);
  const { count } = await deps.db.scheduledJob.createMany({
    data: fresh.map((slot, position) => ({
      workspaceId: schedule.workspaceId,
      clientId,
      type: "seo_post" as const,
      scheduleId: schedule.id,
      scheduleVersion: schedule.version,
      runAt: slot.runAt,
      imageId: images[position]?.id ?? null,
      idempotencyKey: keyFor(slot),
    })),
    skipDuplicates: true,
  });
  return count;
}

/** Jobs that already have a post, or that a person edited, stay put. */
export async function regenerateSeoClient(deps: Deps, clientId: string, now = new Date()): Promise<number> {
  await deps.db.scheduledJob.deleteMany({
    where: { clientId, type: "seo_post", status: { in: ["scheduled", "needs_images"] }, manuallyEdited: false, attempts: 0, post: null },
  });
  return materializeSeoClient(deps, clientId, now);
}

export async function materializeAllSeo(deps: Deps, now = new Date()): Promise<number> {
  const schedules = await deps.db.seoSchedule.findMany({ where: { enabled: true, client: { status: "connected" } }, select: { clientId: true } });
  let created = 0;
  for (const { clientId } of schedules) created += await materializeSeoClient(deps, clientId, now);
  return created;
}

async function chooseImage(deps: Deps, job: ScheduledJob): Promise<LibraryImage | null> {
  const images = await seoImages(deps, job.clientId);
  const assigned = images.find((image) => image.id === job.imageId);
  if (assigned) return assigned;
  const [unreserved] = pickImages(images, await reservedSeoImages(deps, job.clientId), 1);
  return unreserved ?? rotationOrder(images)[0] ?? null;
}

interface Generated {
  result: AiResult;
  image: LibraryImage;
}

async function writePost(deps: Deps, client: Client, profile: ClientProfile | null, image: LibraryImage): Promise<AiResult> {
  const ai = await aiClientFor(deps, client.workspaceId);
  if (!ai) throw new Error("No OpenAI key is set");
  const recent = await deps.db.post.findMany({
    where: { clientId: client.id },
    orderBy: { createdAt: "desc" },
    take: RECENT_POST_COUNT,
    select: { summary: true },
  });
  const result = await ai.client.generatePost({
    image: await deps.storage.get(image.storageKey),
    mime: image.mime,
    knowledge: await loadKnowledge(deps, client),
    recentPosts: recent.map((post) => post.summary),
    ctaLabel: aiLabelForCta(profile?.ctaType ?? "LEARN_MORE"),
  });
  await recordUsage(deps, ai, { workspaceId: client.workspaceId, clientId: client.id, feature: "seo_post", result });
  return result;
}

export async function generatePostForJob(deps: Deps, job: ScheduledJob, now = new Date()): Promise<void> {
  const client = await deps.db.client.findUniqueOrThrow({ where: { id: job.clientId } });
  const profile = await deps.db.clientProfile.findUnique({ where: { clientId: client.id } });
  const image = await chooseImage(deps, job);
  if (!image) {
    await deps.db.scheduledJob.update({ where: { id: job.id }, data: { status: "needs_images", error: "The SEO Post Images folder is empty", finishedAt: now } });
    await alertOnce(deps, job, { type: "seo.needs_images", severity: "warning", title: `${client.name} is out of post images`, body: "Upload images to the SEO Post Images folder." });
    return;
  }
  const generated: Generated = { result: await writePost(deps, client, profile, image), image };
  const manualApproval = (profile?.seoMode ?? "draft") === "draft";
  await deps.db.$transaction([
    deps.db.post.upsert({
      where: { jobId: job.id },
      create: {
        workspaceId: job.workspaceId,
        clientId: job.clientId,
        jobId: job.id,
        postType: "standard",
        summary: capPostText(generated.result.text),
        ctaType: profile?.ctaType ?? "LEARN_MORE",
        ctaUrl: profile?.ctaUrl ?? null,
        aiGenerated: true,
      },
      update: { summary: capPostText(generated.result.text), approvedAt: null, approvedById: null },
    }),
    deps.db.scheduledJob.update({
      where: { id: job.id },
      data: { imageId: image.id, status: manualApproval ? "awaiting_approval" : "scheduled" },
    }),
  ]);
  if (manualApproval) {
    await alertOnce(deps, job, { type: "seo.draft_ready", severity: "info", title: `Post drafts ready for ${client.name}`, body: "Review them in SEO Posts before they publish." });
  }
}

/** Drafts run ahead of time per client (48 hours by default); auto-publish just before posting. */
export async function generateDueDrafts(deps: Deps, now = new Date()): Promise<number> {
  const profiles = await deps.db.seoSchedule.findMany({
    where: { enabled: true, client: { status: "connected" } },
    select: { clientId: true, client: { select: { profile: { select: { draftLeadHours: true, seoMode: true } } } } },
  });
  let generated = 0;
  for (const { clientId, client } of profiles) {
    const mode = client.profile?.seoMode ?? "draft";
    const leadMs = mode === "draft" ? (client.profile?.draftLeadHours ?? 48) * 3_600_000 : AUTO_LEAD_MS;
    const jobs = await deps.db.scheduledJob.findMany({
      where: { clientId, type: "seo_post", status: "scheduled", post: null, runAt: { lte: new Date(now.getTime() + leadMs) } },
      orderBy: { runAt: "asc" },
      take: BATCH_SIZE,
    });
    for (const job of jobs) {
      try {
        await generatePostForJob(deps, job, now);
        generated++;
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown";
        await deps.db.scheduledJob.update({ where: { id: job.id }, data: { error: message } });
        await alertOnce(deps, job, { type: "seo.generate_failed", severity: "warning", title: "A post couldn't be written", body: message });
      }
    }
  }
  return generated;
}

/** An unapproved draft never publishes. It waits, and the admin hears about it. */
export async function flagOverdueDrafts(deps: Deps, now = new Date()): Promise<number> {
  const overdue = await deps.db.scheduledJob.findMany({ where: { type: "seo_post", status: "awaiting_approval", runAt: { lte: now } }, include: { client: { select: { name: true } } } });
  for (const job of overdue) {
    await alertOnce(deps, job, { type: "seo.overdue", severity: "warning", title: `A post for ${job.client.name} is waiting`, body: "Its publish time passed. Approve it to publish." });
  }
  return overdue.length;
}

export async function processPostJob(deps: Deps, jobId: string, now = new Date()): Promise<void> {
  const claimed = await deps.db.scheduledJob.updateMany({
    where: { id: jobId, type: "seo_post", status: "scheduled", runAt: { lte: now }, post: { isNot: null } },
    data: { status: "publishing", startedAt: now },
  });
  if (claimed.count === 0) return;

  const job = await deps.db.scheduledJob.findUniqueOrThrow({ where: { id: jobId }, include: { post: true, image: true } });
  const client = await deps.db.client.findUniqueOrThrow({ where: { id: job.clientId }, include: { connection: true } });
  const post = job.post!;

  if (client.status === "paused") {
    await deps.db.scheduledJob.update({ where: { id: job.id }, data: { status: "skipped", error: "Client is paused", imageId: null, finishedAt: now } });
    return;
  }
  if (client.status !== "connected" || !client.connection) {
    const error = `Client is ${client.status.replace(/_/g, " ")}`;
    await deps.db.scheduledJob.update({ where: { id: job.id }, data: { status: "failed", error, finishedAt: now } });
    await writeLog(deps, job, "post.publish", { status: "failed", error });
    return;
  }
  const image = job.image;
  try {
    if (!image) throw new Error("The post's image is missing");
    const profile = await deps.db.clientProfile.findUnique({ where: { clientId: client.id } });
    const snapshot = profile?.gbpSnapshot as { phone?: string | null } | undefined;
    if (post.ctaType === "CALL" && !snapshot?.phone) throw new Error("The profile has no phone number for the Call button");
    const published = await sessionFor(deps, client.connection).publishPost({
      accountId: client.gbpAccountId!,
      locationId: client.gbpLocationId!,
      summary: post.summary,
      ctaType: post.ctaType,
      ctaUrl: post.ctaType === "CALL" ? null : post.ctaUrl,
      imageUrl: image.publicUrl,
    });
    await deps.db.$transaction([
      deps.db.scheduledJob.update({ where: { id: job.id }, data: { status: "published", error: null, finishedAt: new Date() } }),
      deps.db.post.update({ where: { id: post.id }, data: { gbpPostName: published.name } }),
      deps.db.libraryImage.update({ where: { id: image.id }, data: { usageCount: { increment: 1 }, lastUsedAt: new Date() } }),
    ]);
    await writeLog(deps, job, "post.publish", { status: "published", resource: published.name });
  } catch (error) {
    await failJob(deps, job, client, image, error, now, { action: "post.publish", label: "Post" });
  }
}
