import { dateRangeSchema } from "@localpilot/contracts";
import { isoDate, summarizeMetrics } from "@localpilot/core";
import { syncClient } from "@localpilot/services";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ApiError, type AppContext } from "../context";
import { scopedClient } from "../guards";

const params = z.object({ id: z.string().uuid() });

export function dashboardRoutes(ctx: AppContext) {
  const { db, deps } = ctx;

  return async (base: FastifyInstance) => {
    const app = base.withTypeProvider<ZodTypeProvider>();

    app.get("/clients/:id/dashboard", { schema: { params, querystring: dateRangeSchema } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      const [rows, stats, profile] = await Promise.all([
        db.metricSnapshot.findMany({
          where: { workspaceId: client.workspaceId, clientId: client.id },
          select: { date: true, metric: true, value: true },
        }),
        db.locationStats.findUnique({ where: { clientId: client.id } }),
        db.clientProfile.findUnique({ where: { clientId: client.id } }),
      ]);
      const summary = summarizeMetrics(
        rows.map((row) => ({ ...row, date: isoDate(row.date) })),
        request.query.range,
      );
      const snapshot = profile?.gbpSnapshot as { title?: string; address?: string } | undefined;
      return {
        client: { id: client.id, name: client.name, status: client.status, onboarded: Boolean(profile?.onboardedAt) },
        basics: {
          name: snapshot?.title ?? client.name,
          address: snapshot?.address ?? client.address,
          rating: stats?.rating ?? null,
          reviewCount: stats?.reviewCount ?? 0,
          photoCount: stats?.photoCount ?? 0,
          lastPostAt: stats?.lastPostAt ?? null,
        },
        strength: { score: stats?.strengthScore ?? 0, checklist: stats?.checklist ?? [] },
        metrics: summary,
        syncedAt: stats?.syncedAt ?? null,
      };
    });

    app.post("/clients/:id/dashboard/refresh", { schema: { params }, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      if (client.status !== "connected") throw new ApiError(409, "client_not_connected", "This client is not connected");
      return { result: await syncClient(deps, client.id) };
    });
  };
}
