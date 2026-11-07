import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context";

export function healthRoutes(ctx: AppContext) {
  return async (app: FastifyInstance) => {
    app.get("/health", { config: { rateLimit: false }, logLevel: "silent" }, async (_request, reply) => {
      const [database, storage] = await Promise.allSettled([ctx.db.$queryRaw`SELECT 1`, ctx.storage.ping()]);
      const checks = { database: database.status === "fulfilled", storage: storage.status === "fulfilled" };
      const healthy = checks.database && checks.storage;
      return reply.status(healthy ? 200 : 503).send({ status: healthy ? "ok" : "degraded", checks });
    });
  };
}
