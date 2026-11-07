import { queueEmail } from "@localpilot/services";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ApiError, type AppContext } from "../context";

const LOG_SIZE = 50;

export function mailRoutes(ctx: AppContext) {
  const { db, deps } = ctx;

  return async (base: FastifyInstance) => {
    const app = base.withTypeProvider<ZodTypeProvider>();

    app.post("/settings/mail/test", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request) => {
      if (request.auth.role !== "owner") throw new ApiError(403, "forbidden", "Only the owner can do this");
      if (deps.mailProvider.offReason) throw new ApiError(409, "mail_off", deps.mailProvider.offReason);
      const user = await db.user.findUniqueOrThrow({ where: { id: request.auth.userId }, select: { email: true } });
      await queueEmail(deps, { template: "test", to: user.email, workspaceId: request.auth.workspaceId, transactional: true });
      return { ok: true, to: user.email };
    });

    app.get("/settings/mail/log", async (request) => {
      return db.emailLog.findMany({
        where: { workspaceId: request.auth.workspaceId },
        select: { id: true, to: true, template: true, status: true, error: true, sentAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: LOG_SIZE,
      });
    });
  };
}
