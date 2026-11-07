import { MockGbpAdapter } from "@localpilot/gbp";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { dispatchDueJobs, generatePostForJob, syncClientReviews } from "@localpilot/services";
import { ApiError, type AppContext } from "../context";
import { scopedClient } from "../guards";

const params = z.object({ id: z.string().uuid() });

/** Registered only with the mock adapter outside production. */
export function devRoutes(ctx: AppContext) {
  return async (base: FastifyInstance) => {
    const { gbp } = ctx.deps;
    if (!(gbp instanceof MockGbpAdapter) || ctx.env.APP_ENV === "production") return;
    const app = base.withTypeProvider<ZodTypeProvider>();

    app.get("/dev/mock/enabled", async () => ({ enabled: true }));

    app.post("/dev/mock/clients/:id/invite", { schema: { params } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      const name = await gbp.simulateInvitation(client.workspaceId, { locationName: client.name, address: client.address });
      return { invitation: name };
    });

    app.post("/dev/mock/invitations", { schema: { body: z.object({ locationName: z.string().min(1), address: z.string().optional() }) } }, async (request) => {
      return { invitation: await gbp.simulateInvitation(request.auth.workspaceId, request.body) };
    });

    app.post("/dev/mock/clients/:id/photos/publish-next", { schema: { params } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      const job = await ctx.db.scheduledJob.findFirst({ where: { clientId: client.id, type: "photo", status: "scheduled" }, orderBy: { runAt: "asc" } });
      if (!job) throw new ApiError(409, "queue_empty", "The queue is empty");
      await ctx.db.scheduledJob.update({ where: { id: job.id }, data: { runAt: new Date(Date.now() - 1000) } });
      await dispatchDueJobs(ctx.deps, new Date(), { jitter: false });
      return { ok: true };
    });

    app.post("/dev/mock/clients/:id/posts/write-next", { schema: { params } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      const job = await ctx.db.scheduledJob.findFirst({ where: { clientId: client.id, type: "seo_post", status: "scheduled", post: null }, orderBy: { runAt: "asc" } });
      if (!job) throw new ApiError(409, "queue_empty", "No post is waiting to be written");
      await generatePostForJob(ctx.deps, job);
      return { ok: true };
    });

    app.post("/dev/mock/clients/:id/posts/publish-next", { schema: { params } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      const job = await ctx.db.scheduledJob.findFirst({ where: { clientId: client.id, type: "seo_post", status: "scheduled", post: { isNot: null } }, orderBy: { runAt: "asc" } });
      if (!job) throw new ApiError(409, "queue_empty", "No approved post is waiting");
      await ctx.db.scheduledJob.update({ where: { id: job.id }, data: { runAt: new Date(Date.now() - 1000) } });
      await dispatchDueJobs(ctx.deps, new Date(), { jitter: false });
      return { ok: true };
    });

    app.post(
      "/dev/mock/clients/:id/reviews",
      { schema: { params, body: z.object({ rating: z.number().int().min(1).max(5), text: z.string().nullable().default("A new review from the mock adapter.") }) } },
      async (request) => {
        const client = await scopedClient(ctx, request, request.params.id);
        if (!client.gbpLocationId) throw new ApiError(409, "client_not_connected", "This client has no location");
        await syncClientReviews(ctx.deps, client.id);
        await gbp.simulateReview(client.workspaceId, client.gbpLocationId, request.body);
        return syncClientReviews(ctx.deps, client.id);
      },
    );

    app.post("/dev/mock/fail-uploads", { schema: { body: z.object({ count: z.number().int().min(0).max(20) }) } }, async (request) => {
      await gbp.simulateUploadFailures(request.auth.workspaceId, request.body.count);
      return { ok: true };
    });

    app.post("/dev/mock/clients/:id/revoke", { schema: { params } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      if (!client.gbpLocationId) throw new ApiError(409, "client_not_connected", "This client has no location");
      await gbp.simulateRevokeLocation(client.workspaceId, client.gbpLocationId);
      return { ok: true };
    });
  };
}
