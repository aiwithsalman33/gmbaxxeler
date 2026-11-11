import type { FastifyInstance } from "fastify";
import { workerHealth } from "@localpilot/services";
import type { AppContext } from "../context";

export function healthRoutes(ctx: AppContext) {
  return async (app: FastifyInstance) => {
    app.get("/health", { config: { rateLimit: false }, logLevel: "silent" }, async (_request, reply) => {
      const [database, storage] = await Promise.allSettled([ctx.db.$queryRaw`SELECT 1`, ctx.storage.ping()]);
      const checks = { database: database.status === "fulfilled", storage: storage.status === "fulfilled" };
      const healthy = checks.database && checks.storage;
      return reply.status(healthy ? 200 : 503).send({ status: healthy ? "ok" : "degraded", checks });
    });

    // For uptime monitors: 200 while the worker is beating, 503 when it is offline or never started.
    app.get("/health/worker", { config: { rateLimit: false }, logLevel: "silent" }, async (_request, reply) => {
      const health = await workerHealth(ctx.db);
      return reply
        .status(health.status === "online" ? 200 : 503)
        .send({ status: health.status, lastBeatAt: health.lastBeatAt, lastRunAt: health.lastRunAt, startedAt: health.startedAt });
    });
  };
}
