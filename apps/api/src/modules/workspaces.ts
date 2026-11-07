import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ApiError, type AppContext } from "../context";

const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  timezone: z.string().trim().max(64).optional(),
});

export function workspaceRoutes(ctx: AppContext) {
  return async (base: FastifyInstance) => {
    const app = base.withTypeProvider<ZodTypeProvider>();

    app.get("/me", async (request) => {
      const user = await ctx.db.user.findUniqueOrThrow({
        where: { id: request.auth.userId },
        select: { id: true, name: true, email: true, phone: true },
      });
      const workspace = await ctx.db.workspace.findUniqueOrThrow({
        where: { id: request.auth.workspaceId },
        select: { id: true, name: true, timezone: true },
      });
      return { user, workspace, role: request.auth.role };
    });

    app.get("/workspace", async (request) => {
      return ctx.db.workspace.findUniqueOrThrow({ where: { id: request.auth.workspaceId } });
    });

    app.patch("/workspace", { schema: { body: updateWorkspaceSchema } }, async (request) => {
      if (request.auth.role !== "owner") throw new ApiError(403, "forbidden", "Only the owner can change this");
      return ctx.db.workspace.update({ where: { id: request.auth.workspaceId }, data: request.body });
    });

    app.delete("/workspace/members/:id", { schema: { params: z.object({ id: z.string().uuid() }) } }, async (request) => {
      if (request.auth.role !== "owner") throw new ApiError(403, "forbidden", "Only the owner can change this");
      const member = await ctx.db.workspaceMember.findFirst({ where: { id: request.params.id, workspaceId: request.auth.workspaceId } });
      if (!member) throw new ApiError(404, "member_not_found", "Team member not found");
      if (member.userId === request.auth.userId) throw new ApiError(409, "cannot_remove_self", "You can't remove yourself");
      await ctx.db.workspaceMember.delete({ where: { id: member.id } });
      await ctx.db.session.updateMany({ where: { userId: member.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      return { ok: true };
    });

    app.get("/workspace/members", async (request) => {
      return ctx.db.workspaceMember.findMany({
        where: { workspaceId: request.auth.workspaceId },
        include: { user: { select: { email: true, name: true } } },
        orderBy: { createdAt: "asc" },
      });
    });
  };
}
