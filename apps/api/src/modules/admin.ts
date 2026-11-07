import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ApiError, type AppContext } from "../context";

const FAILED = ["failed", "dead", "needs_images"] as const;
const PAGE_SIZE = 200;

export function adminRoutes(ctx: AppContext) {
  const { db } = ctx;

  return async (base: FastifyInstance) => {
    const app = base.withTypeProvider<ZodTypeProvider>();

    app.get("/admin/failed-jobs", async (request) => {
      const jobs = await db.scheduledJob.findMany({
        where: { workspaceId: request.auth.workspaceId, status: { in: [...FAILED] } },
        include: { client: { select: { name: true } } },
        orderBy: { finishedAt: "desc" },
        take: PAGE_SIZE,
      });
      return jobs.map(({ id, type, status, error, attempts, runAt, finishedAt, clientId, client }) => ({
        id, type, status, error, attempts, runAt, finishedAt, clientId, clientName: client.name,
      }));
    });

    app.post("/admin/failed-jobs/:id/retry", { schema: { params: z.object({ id: z.string().uuid() }) } }, async (request) => {
      const { count } = await db.scheduledJob.updateMany({
        where: { id: request.params.id, workspaceId: request.auth.workspaceId, status: { in: [...FAILED] } },
        data: { status: "scheduled", attempts: 0, error: null, runAt: new Date(), finishedAt: null, startedAt: null },
      });
      if (count === 0) throw new ApiError(404, "job_not_found", "Job not found");
      return { ok: true };
    });
  };
}
