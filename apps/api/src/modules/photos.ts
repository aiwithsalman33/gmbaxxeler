import { photoScheduleSchema, updateJobSchema } from "@localpilot/contracts";
import { weeklyCount } from "@localpilot/core";
import { materializeClient, publishJobNow, PublishNowError, regenerateClient, scheduleReadiness } from "@localpilot/services";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ApiError, type AppContext } from "../context";
import { scopedClient } from "../guards";

const clientParams = z.object({ id: z.string().uuid() });
const jobParams = z.object({ id: z.string().uuid(), jobId: z.string().uuid() });
const HISTORY_STATUSES = ["published", "failed", "dead", "skipped", "needs_images", "publishing"] as const;
const RETRYABLE = ["failed", "dead", "needs_images"] as const;
const PAGE_SIZE = 100;
const IMAGE_FIELDS = { id: true, publicUrl: true, originalName: true, seoName: true } as const;

export function photoRoutes(ctx: AppContext) {
  const { db, deps } = ctx;

  async function scopedJob(request: FastifyRequest, clientId: string, jobId: string) {
    const client = await scopedClient(ctx, request, clientId);
    const job = await db.scheduledJob.findFirst({ where: { id: jobId, workspaceId: client.workspaceId, clientId: client.id, type: "photo" } });
    if (!job) throw new ApiError(404, "job_not_found", "Job not found");
    return { client, job };
  }

  return async (base: FastifyInstance) => {
    const app = base.withTypeProvider<ZodTypeProvider>();

    app.get("/clients/:id/photo-schedule", { schema: { params: clientParams } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      const schedule = await db.photoSchedule.findUnique({ where: { clientId: client.id } });
      return {
        schedule,
        timezone: client.timezone,
        aiRenameEnabled: client.aiRenameEnabled,
        weekly: schedule ? weeklyCount(schedule) : 0,
        readiness: await scheduleReadiness(deps, client.id, "photo"),
      };
    });

    app.put("/clients/:id/photo-schedule", { schema: { params: clientParams, body: photoScheduleSchema } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      const { body } = request;
      const schedule = await db.photoSchedule.upsert({
        where: { clientId: client.id },
        create: { workspaceId: client.workspaceId, clientId: client.id, ...body },
        update: { ...body, version: { increment: 1 } },
      });
      await db.client.update({ where: { id: client.id }, data: { timezone: body.timezone } });
      const created = await regenerateClient(deps, client.id);
      return { schedule, created, weekly: weeklyCount(schedule), readiness: await scheduleReadiness(deps, client.id, "photo") };
    });

    app.get("/clients/:id/photos/queue", { schema: { params: clientParams } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      return db.scheduledJob.findMany({
        where: { workspaceId: client.workspaceId, clientId: client.id, type: "photo", status: "scheduled" },
        include: { image: { select: IMAGE_FIELDS } },
        orderBy: { runAt: "asc" },
      });
    });

    app.get(
      "/clients/:id/photos/history",
      { schema: { params: clientParams, querystring: z.object({ status: z.enum(HISTORY_STATUSES).optional() }) } },
      async (request) => {
        const client = await scopedClient(ctx, request, request.params.id);
        return db.scheduledJob.findMany({
          where: {
            workspaceId: client.workspaceId,
            clientId: client.id,
            type: "photo",
            status: request.query.status ?? { in: [...HISTORY_STATUSES] },
          },
          include: { image: { select: IMAGE_FIELDS }, logs: { orderBy: { createdAt: "desc" }, take: 1 } },
          orderBy: { runAt: "desc" },
          take: PAGE_SIZE,
        });
      },
    );

    app.patch("/clients/:id/photos/jobs/:jobId", { schema: { params: jobParams, body: updateJobSchema } }, async (request) => {
      const { client, job } = await scopedJob(request, request.params.id, request.params.jobId);
      if (job.status !== "scheduled") throw new ApiError(409, "job_not_editable", "Only upcoming jobs can be edited");
      const { imageId, runAt, category } = request.body;
      if (imageId) {
        const image = await db.libraryImage.findFirst({ where: { id: imageId, clientId: client.id, deletedAt: null, folder: { kind: "photos" } } });
        if (!image) throw new ApiError(404, "image_not_found", "Image not found in the Photos folder");
      }
      return db.scheduledJob.update({ where: { id: job.id }, data: { imageId, runAt, category, manuallyEdited: true } });
    });

    app.post("/clients/:id/photos/jobs/:jobId/skip", { schema: { params: jobParams } }, async (request) => {
      const { job } = await scopedJob(request, request.params.id, request.params.jobId);
      const { count } = await db.scheduledJob.updateMany({
        where: { id: job.id, status: "scheduled" },
        data: { status: "skipped", imageId: null, finishedAt: new Date() },
      });
      if (count === 0) throw new ApiError(409, "job_not_editable", "Only upcoming jobs can be skipped");
      return { ok: true };
    });

    app.post("/clients/:id/photos/jobs/:jobId/retry", { schema: { params: jobParams } }, async (request) => {
      const { job } = await scopedJob(request, request.params.id, request.params.jobId);
      const { count } = await db.scheduledJob.updateMany({
        where: { id: job.id, status: { in: [...RETRYABLE] } },
        data: { status: "scheduled", attempts: 0, error: null, runAt: new Date(), finishedAt: null, startedAt: null },
      });
      if (count === 0) throw new ApiError(409, "job_not_retryable", "Only failed jobs can be retried");
      return { ok: true };
    });

    app.post("/clients/:id/photos/jobs/:jobId/publish-now", { schema: { params: jobParams }, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request) => {
      const { job } = await scopedJob(request, request.params.id, request.params.jobId);
      return runPublishNow(deps, job.id);
    });

    app.post("/clients/:id/photos/generate", { schema: { params: clientParams } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      return { created: await materializeClient(deps, client.id) };
    });
  };
}

export async function runPublishNow(deps: AppContext["deps"], jobId: string) {
  try {
    return await publishJobNow(deps, jobId);
  } catch (error) {
    if (error instanceof PublishNowError) throw new ApiError(409, error.code, error.message);
    throw error;
  }
}
