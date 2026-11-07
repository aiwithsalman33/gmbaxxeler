import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppContext } from "../context";

const LIST_LIMIT = 30;

export function notificationRoutes(ctx: AppContext) {
  const { db } = ctx;

  return async (base: FastifyInstance) => {
    const app = base.withTypeProvider<ZodTypeProvider>();

    app.get("/notifications", async (request) => {
      const where = { workspaceId: request.auth.workspaceId };
      const [items, unread] = await Promise.all([
        db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: LIST_LIMIT }),
        db.notification.count({ where: { ...where, readAt: null } }),
      ]);
      return { items, unread };
    });

    app.post("/notifications/:id/read", { schema: { params: z.object({ id: z.string().uuid() }) } }, async (request) => {
      await db.notification.updateMany({
        where: { id: request.params.id, workspaceId: request.auth.workspaceId },
        data: { readAt: new Date() },
      });
      return { ok: true };
    });

    app.post("/notifications/read-all", async (request) => {
      await db.notification.updateMany({
        where: { workspaceId: request.auth.workspaceId, readAt: null },
        data: { readAt: new Date() },
      });
      return { ok: true };
    });
  };
}
