import { replySchema, reviewFilterSchema, reviewSettingsSchema } from "@localpilot/contracts";
import { publishReply, suggestReply, syncClientReviews } from "@localpilot/services";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ApiError, type AppContext } from "../context";
import { scopedClient } from "../guards";

const clientParams = z.object({ id: z.string().uuid() });
const reviewParams = z.object({ id: z.string().uuid(), reviewId: z.string().uuid() });
const replyParams = z.object({ id: z.string().uuid(), replyId: z.string().uuid() });
const PAGE_SIZE = 200;

export function reviewRoutes(ctx: AppContext) {
  const { db, deps } = ctx;

  async function scopedReview(request: FastifyRequest, clientId: string, reviewId: string) {
    const client = await scopedClient(ctx, request, clientId);
    const review = await db.review.findFirst({ where: { id: reviewId, workspaceId: client.workspaceId, clientId: client.id } });
    if (!review) throw new ApiError(404, "review_not_found", "Review not found");
    return { client, review };
  }

  /** A person pressed send, so this publishes now, whatever the rating. */
  async function sendReply(replyId: string, userId: string) {
    await db.reviewReply.update({ where: { id: replyId }, data: { status: "scheduled", approvedById: userId, publishAt: new Date(), attempts: 0, error: null } });
    const sent = await publishReply(deps, replyId);
    const reply = await db.reviewReply.findUniqueOrThrow({ where: { id: replyId } });
    if (!sent) throw new ApiError(502, "reply_failed", reply.error ?? "The reply couldn't be sent. It will retry.");
    return reply;
  }

  return async (base: FastifyInstance) => {
    const app = base.withTypeProvider<ZodTypeProvider>();

    app.get("/clients/:id/reviews", { schema: { params: clientParams, querystring: reviewFilterSchema } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      const { rating, replied, search } = request.query;
      return db.review.findMany({
        where: {
          workspaceId: client.workspaceId,
          clientId: client.id,
          ...(rating ? { rating } : {}),
          ...(replied === "yes" ? { replyState: "replied" as const } : {}),
          ...(replied === "no" ? { replyState: { not: "replied" as const } } : {}),
          ...(search
            ? { OR: [{ text: { contains: search, mode: "insensitive" as const } }, { reviewerName: { contains: search, mode: "insensitive" as const } }] }
            : {}),
        },
        include: { replies: { where: { status: { in: ["draft", "scheduled", "failed"] } }, orderBy: { createdAt: "desc" }, take: 1 } },
        orderBy: { reviewedAt: "desc" },
        take: PAGE_SIZE,
      });
    });

    app.post("/clients/:id/reviews/sync", { schema: { params: clientParams }, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      return syncClientReviews(deps, client.id);
    });

    app.post("/clients/:id/reviews/:reviewId/suggest", { schema: { params: reviewParams }, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request) => {
      const { client, review } = await scopedReview(request, request.params.id, request.params.reviewId);
      try {
        return { text: await suggestReply(deps, client, review) };
      } catch (error) {
        throw new ApiError(502, "generation_failed", error instanceof Error ? error.message : "The reply couldn't be written");
      }
    });

    app.post("/clients/:id/reviews/:reviewId/reply", { schema: { params: reviewParams, body: replySchema } }, async (request) => {
      const { client, review } = await scopedReview(request, request.params.id, request.params.reviewId);
      if (review.replyState === "replied") throw new ApiError(409, "already_replied", "This review already has a reply");
      await db.reviewReply.updateMany({ where: { reviewId: review.id, status: { in: ["draft", "scheduled", "failed"] } }, data: { status: "cancelled" } });
      const reply = await db.reviewReply.create({
        data: { workspaceId: client.workspaceId, clientId: client.id, reviewId: review.id, text: request.body.text, source: "manual", status: "draft" },
      });
      return sendReply(reply.id, request.auth.userId);
    });

    app.post("/clients/:id/replies/:replyId/approve", { schema: { params: replyParams, body: replySchema.partial() } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      const reply = await db.reviewReply.findFirst({ where: { id: request.params.replyId, clientId: client.id, status: { in: ["draft", "failed"] } } });
      if (!reply) throw new ApiError(404, "reply_not_found", "Draft not found");
      if (request.body.text) await db.reviewReply.update({ where: { id: reply.id }, data: { text: request.body.text } });
      return sendReply(reply.id, request.auth.userId);
    });

    app.get("/clients/:id/review-settings", { schema: { params: clientParams } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      return db.reviewSettings.upsert({ where: { clientId: client.id }, create: { clientId: client.id }, update: {} });
    });

    app.put("/clients/:id/review-settings", { schema: { params: clientParams, body: reviewSettingsSchema } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      const { body } = request;
      return db.reviewSettings.upsert({ where: { clientId: client.id }, create: { clientId: client.id, ...body }, update: body });
    });
  };
}
