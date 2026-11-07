import { MAX_RETRIES, NEGATIVE_MAX_RATING, REPLY_MAX_CHARS, replyDelaySeconds, retryDelayMs, reviewAction } from "@localpilot/core";
import type { Client, Review } from "@localpilot/db";
import { GbpError, type GbpReview } from "@localpilot/gbp";
import { aiClientFor, recordUsage } from "./ai";
import { notify, sessionFor, type Deps } from "./context";
import { loadKnowledge } from "./knowledge";
import { applyGbpFailure } from "./sync";

export async function suggestReply(deps: Deps, client: Client, review: Review): Promise<string> {
  const ai = await aiClientFor(deps, client.workspaceId);
  if (!ai) throw new Error("No OpenAI key is set");
  const settings = await deps.db.reviewSettings.findUnique({ where: { clientId: client.id } });
  const result = await ai.client.generateReply({
    knowledge: await loadKnowledge(deps, client),
    replyBrain: settings?.replyBrain ?? null,
    rating: review.rating,
    reviewerName: review.reviewerName,
    reviewText: review.text,
  });
  await recordUsage(deps, ai, { workspaceId: client.workspaceId, clientId: client.id, feature: "review_reply", result });
  return result.text.trim().slice(0, REPLY_MAX_CHARS);
}

async function createDraft(deps: Deps, client: Client, review: Review, publishAt: Date | null): Promise<void> {
  const text = await suggestReply(deps, client, review);
  await deps.db.$transaction([
    deps.db.reviewReply.create({
      data: { workspaceId: client.workspaceId, clientId: client.id, reviewId: review.id, text, source: "ai", status: publishAt ? "scheduled" : "draft", publishAt },
    }),
    deps.db.review.update({ where: { id: review.id }, data: { replyState: "draft" } }),
  ]);
}

async function handleNewReview(deps: Deps, client: Client, review: Review, now: Date): Promise<void> {
  const settings = await deps.db.reviewSettings.findUnique({ where: { clientId: client.id } });
  const action = reviewAction({
    rating: review.rating,
    hasText: Boolean(review.text?.trim()),
    autoReplyEnabled: settings?.autoReplyEnabled ?? false,
    mode: settings?.mode ?? "draft_only",
  });
  if (action === "ignore") return;

  try {
    if (action === "auto_reply") {
      const delay = replyDelaySeconds(settings?.delayMinS ?? 300, settings?.delayMaxS ?? 3600);
      await createDraft(deps, client, review, new Date(now.getTime() + delay * 1000));
    } else {
      await createDraft(deps, client, review, null);
    }
  } catch (error) {
    // The alert below still goes out if the draft couldn't be written.
    deps.logger.warn({ clientId: client.id, err: error instanceof Error ? error.message : "unknown" }, "review draft failed");
  }
  if (action === "draft_and_alert") {
    await notify(deps, {
      workspaceId: client.workspaceId,
      clientId: client.id,
      type: "review.negative",
      severity: "critical",
      title: `${review.rating}-star review for ${client.name}`,
      body: `${review.reviewerName}: ${(review.text ?? "(no text)").slice(0, 200)}`,
    });
  }
}

function reviewData(item: GbpReview) {
  return { rating: item.rating, text: item.comment, reviewerName: item.reviewerName, reviewedAt: item.createTime };
}

/**
 * The first sync of a client imports its history quietly. Only reviews that
 * arrive afterwards can trigger replies or alerts, so a new client with
 * hundreds of old reviews doesn't flood anyone.
 */
export async function syncClientReviews(deps: Deps, clientId: string, now = new Date()): Promise<{ added: number }> {
  const client = await deps.db.client.findUniqueOrThrow({ where: { id: clientId }, include: { connection: true } });
  if (client.status !== "connected" || !client.connection || !client.gbpLocationId) return { added: 0 };
  const settings = await deps.db.reviewSettings.upsert({ where: { clientId }, create: { clientId }, update: {} });
  const firstSync = settings.lastSyncedAt === null;

  let items: GbpReview[];
  try {
    items = await sessionFor(deps, client.connection).listReviews(client.gbpAccountId!, client.gbpLocationId);
  } catch (error) {
    if (await applyGbpFailure(deps, client, error)) return { added: 0 };
    throw error;
  }

  const known = await deps.db.review.findMany({ where: { clientId }, select: { id: true, gbpReviewId: true, replyState: true } });
  const byGoogleId = new Map(known.map((review) => [review.gbpReviewId, review]));
  let added = 0;
  for (const item of items) {
    const existing = byGoogleId.get(item.reviewId);
    if (existing) {
      // A reply made directly on Google still counts.
      if (item.replyComment && existing.replyState !== "replied") {
        await deps.db.review.update({ where: { id: existing.id }, data: { replyState: "replied" } });
      }
      continue;
    }
    const review = await deps.db.review.create({
      data: {
        workspaceId: client.workspaceId,
        clientId,
        gbpReviewId: item.reviewId,
        ...reviewData(item),
        replyState: item.replyComment ? "replied" : "unreplied",
        replyText: item.replyComment,
      },
    });
    added++;
    if (!firstSync && !item.replyComment) await handleNewReview(deps, client, review, now);
  }
  await deps.db.reviewSettings.update({ where: { clientId }, data: { lastSyncedAt: now } });
  return { added };
}

export async function syncAllReviews(deps: Deps, now = new Date()): Promise<void> {
  const clients = await deps.db.client.findMany({ where: { status: "connected" }, select: { id: true } });
  for (const { id } of clients) {
    try {
      await syncClientReviews(deps, id, now);
    } catch (error) {
      deps.logger.error({ clientId: id, err: error instanceof Error ? error.message : "unknown" }, "review sync failed");
    }
  }
}

/** Sends one reply. The claim stops two workers replying to the same review. */
export async function publishReply(deps: Deps, replyId: string, now = new Date()): Promise<boolean> {
  const claimed = await deps.db.reviewReply.updateMany({ where: { id: replyId, status: "scheduled" }, data: { status: "publishing" } });
  if (claimed.count === 0) return false;

  const reply = await deps.db.reviewReply.findUniqueOrThrow({ where: { id: replyId }, include: { review: true } });
  const client = await deps.db.client.findUniqueOrThrow({ where: { id: reply.clientId }, include: { connection: true } });
  // The last line of defence: an unapproved negative reply can't leave the system.
  if (reply.review.rating <= NEGATIVE_MAX_RATING && !reply.approvedById) {
    await deps.db.reviewReply.update({ where: { id: reply.id }, data: { status: "draft", error: "Needs approval" } });
    return false;
  }
  try {
    if (!client.connection || client.status !== "connected") throw new GbpError("access_denied", `Client is ${client.status.replace(/_/g, " ")}`);
    await sessionFor(deps, client.connection).replyToReview(client.gbpAccountId!, client.gbpLocationId!, reply.review.gbpReviewId, reply.text);
    await deps.db.$transaction([
      deps.db.reviewReply.update({ where: { id: reply.id }, data: { status: "published", publishedAt: new Date(), error: null } }),
      deps.db.review.update({ where: { id: reply.reviewId }, data: { replyState: "replied", replyText: reply.text } }),
    ]);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const attempts = reply.attempts + 1;
    const permanent = error instanceof GbpError && error.kind !== "rate_limited" && error.kind !== "unavailable";
    if (!permanent && attempts <= MAX_RETRIES) {
      await deps.db.reviewReply.update({ where: { id: reply.id }, data: { status: "scheduled", attempts, error: message, publishAt: new Date(now.getTime() + retryDelayMs(attempts)) } });
      return false;
    }
    await deps.db.reviewReply.update({ where: { id: reply.id }, data: { status: "failed", attempts, error: message } });
    if (permanent) await applyGbpFailure(deps, client, error);
    await notify(deps, {
      workspaceId: reply.workspaceId,
      clientId: reply.clientId,
      type: "review.reply_failed",
      severity: "critical",
      title: `A review reply failed for ${client.name}`,
      body: message,
    });
    return false;
  }
}

/** Like stuck photo jobs, a stuck reply may have reached Google, so a person decides. */
async function recoverStuckReplies(deps: Deps, now: Date): Promise<void> {
  await deps.db.reviewReply.updateMany({
    where: { status: "publishing", updatedAt: { lt: new Date(now.getTime() - 10 * 60_000) } },
    data: { status: "failed", error: "Sending was interrupted. Check Google before sending again." },
  });
}

export async function publishDueReplies(deps: Deps, now = new Date()): Promise<number> {
  await recoverStuckReplies(deps, now);
  const due = await deps.db.reviewReply.findMany({ where: { status: "scheduled", publishAt: { lte: now } }, take: 20, select: { id: true } });
  for (const { id } of due) await publishReply(deps, id, now);
  return due.length;
}
