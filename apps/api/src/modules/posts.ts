import { seoScheduleSchema, updatePostSchema } from "@localpilot/contracts";
import { weeklyCount } from "@localpilot/core";
import { generatePostForJob, regenerateSeoClient } from "@localpilot/services";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ApiError, type AppContext } from "../context";
import { scopedClient } from "../guards";

const clientParams = z.object({ id: z.string().uuid() });
const jobParams = z.object({ id: z.string().uuid(), jobId: z.string().uuid() });
const PAGE_SIZE = 100;
const IMAGE_FIELDS = { id: true, publicUrl: true, originalName: true } as const;

export function postRoutes(ctx: AppContext) {
  const { db, deps } = ctx;

  async function scopedJob(request: FastifyRequest, clientId: string, jobId: string) {
    const client = await scopedClient(ctx, request, clientId);
    const job = await db.scheduledJob.findFirst({
      where: { id: jobId, workspaceId: client.workspaceId, clientId: client.id, type: "seo_post" },
      include: { post: true, image: { select: IMAGE_FIELDS } },
    });
    if (!job) throw new ApiError(404, "post_not_found", "Post not found");
    return { client, job };
  }

  return async (base: FastifyInstance) => {
    const app = base.withTypeProvider<ZodTypeProvider>();

    app.get("/clients/:id/seo-schedule", { schema: { params: clientParams } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      const [schedule, profile] = await Promise.all([
        db.seoSchedule.findUnique({ where: { clientId: client.id } }),
        db.clientProfile.findUnique({ where: { clientId: client.id } }),
      ]);
      return {
        schedule,
        timezone: client.timezone,
        weekly: schedule ? weeklyCount(schedule) : 0,
        seoMode: profile?.seoMode ?? "draft",
        draftLeadHours: profile?.draftLeadHours ?? 48,
        ctaType: profile?.ctaType ?? "LEARN_MORE",
        ctaUrl: profile?.ctaUrl ?? null,
      };
    });

    app.put("/clients/:id/seo-schedule", { schema: { params: clientParams, body: seoScheduleSchema } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      const { seoMode, draftLeadHours, ctaType, ctaUrl, ...rule } = request.body;
      const defaults = { seoMode, draftLeadHours, ctaType, ctaUrl };
      const schedule = await db.seoSchedule.upsert({
        where: { clientId: client.id },
        create: { workspaceId: client.workspaceId, clientId: client.id, ...rule },
        update: { ...rule, version: { increment: 1 } },
      });
      await db.clientProfile.upsert({ where: { clientId: client.id }, create: { clientId: client.id, ...defaults }, update: defaults });
      await db.client.update({ where: { id: client.id }, data: { timezone: rule.timezone } });
      return { schedule, created: await regenerateSeoClient(deps, client.id), weekly: weeklyCount(schedule) };
    });

    app.get("/clients/:id/posts", { schema: { params: clientParams } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      return db.scheduledJob.findMany({
        where: { workspaceId: client.workspaceId, clientId: client.id, type: "seo_post" },
        include: { post: true, image: { select: IMAGE_FIELDS } },
        orderBy: { runAt: "asc" },
        take: PAGE_SIZE,
      });
    });

    app.get("/clients/:id/posts/:jobId", { schema: { params: jobParams } }, async (request) => {
      return (await scopedJob(request, request.params.id, request.params.jobId)).job;
    });

    app.patch("/clients/:id/posts/:jobId", { schema: { params: jobParams, body: updatePostSchema } }, async (request) => {
      const { job } = await scopedJob(request, request.params.id, request.params.jobId);
      if (!job.post) throw new ApiError(409, "post_not_written", "This post hasn't been written yet");
      if (!["scheduled", "awaiting_approval"].includes(job.status)) throw new ApiError(409, "post_not_editable", "Only upcoming posts can be edited");
      await db.scheduledJob.update({ where: { id: job.id }, data: { manuallyEdited: true } });
      return db.post.update({ where: { id: job.post.id }, data: { ...request.body, ctaUrl: request.body.ctaUrl ?? null, aiGenerated: false } });
    });

    app.post("/clients/:id/posts/:jobId/approve", { schema: { params: jobParams } }, async (request) => {
      const { job } = await scopedJob(request, request.params.id, request.params.jobId);
      const { count } = await db.scheduledJob.updateMany({ where: { id: job.id, status: "awaiting_approval" }, data: { status: "scheduled" } });
      if (count === 0 || !job.post) throw new ApiError(409, "post_not_awaiting", "This post isn't waiting for approval");
      await db.post.update({ where: { id: job.post.id }, data: { approvedById: request.auth.userId, approvedAt: new Date() } });
      await db.auditLog.create({
        data: { workspaceId: job.workspaceId, clientId: job.clientId, actorId: request.auth.userId, action: "post.approved", entity: "post", entityId: job.post.id },
      });
      return { ok: true };
    });

    app.post("/clients/:id/posts/:jobId/regenerate", { schema: { params: jobParams }, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request) => {
      const { job } = await scopedJob(request, request.params.id, request.params.jobId);
      if (!["scheduled", "awaiting_approval"].includes(job.status)) throw new ApiError(409, "post_not_editable", "Only upcoming posts can be rewritten");
      try {
        await generatePostForJob(deps, job);
      } catch (error) {
        throw new ApiError(502, "generation_failed", error instanceof Error ? error.message : "The post couldn't be written");
      }
      return { ok: true };
    });

    app.post("/clients/:id/posts/:jobId/skip", { schema: { params: jobParams } }, async (request) => {
      const { job } = await scopedJob(request, request.params.id, request.params.jobId);
      const { count } = await db.scheduledJob.updateMany({
        where: { id: job.id, status: { in: ["scheduled", "awaiting_approval"] } },
        data: { status: "skipped", imageId: null, finishedAt: new Date() },
      });
      if (count === 0) throw new ApiError(409, "post_not_editable", "Only upcoming posts can be skipped");
      return { ok: true };
    });

    app.post("/clients/:id/posts/:jobId/retry", { schema: { params: jobParams } }, async (request) => {
      const { job } = await scopedJob(request, request.params.id, request.params.jobId);
      const { count } = await db.scheduledJob.updateMany({
        where: { id: job.id, status: { in: ["failed", "dead", "needs_images"] } },
        data: { status: "scheduled", attempts: 0, error: null, runAt: new Date(), finishedAt: null, startedAt: null },
      });
      if (count === 0) throw new ApiError(409, "job_not_retryable", "Only failed posts can be retried");
      return { ok: true };
    });
  };
}
