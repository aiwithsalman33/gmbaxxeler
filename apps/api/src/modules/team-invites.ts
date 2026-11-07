import { acceptInviteSchema, inviteMemberSchema } from "@localpilot/contracts";
import { hashPassword, randomToken, sha256 } from "@localpilot/crypto";
import { queueEmail } from "@localpilot/services";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ApiError, type AppContext } from "../context";
import { requireAuth } from "../guards";

const INVITE_TTL_MS = 7 * 86_400_000;
const tokenParams = z.object({ token: z.string().min(16).max(200) });

export function teamInviteRoutes(ctx: AppContext) {
  const { db, deps, env } = ctx;

  function requireOwner(request: FastifyRequest): void {
    if (request.auth.role !== "owner") throw new ApiError(403, "forbidden", "Only the owner can change this");
  }

  async function liveInvite(token: string) {
    const invite = await db.teamInvite.findUnique({ where: { tokenHash: sha256(token) }, include: { workspace: { select: { name: true } } } });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) throw new ApiError(404, "invite_invalid", "This invite is invalid or has expired");
    return invite;
  }

  return async (base: FastifyInstance) => {
    const app = base.withTypeProvider<ZodTypeProvider>();

    app.get("/public/team-invites/:token", { schema: { params: tokenParams } }, async (request) => {
      const invite = await liveInvite(request.params.token);
      const user = await db.user.findUnique({ where: { email: invite.email }, select: { passwordHash: true } });
      return { agencyName: invite.workspace.name, email: invite.email, needsPassword: !user?.passwordHash };
    });

    app.post("/public/team-invites/:token/accept", { schema: { params: tokenParams, body: acceptInviteSchema }, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request) => {
      const invite = await liveInvite(request.params.token);
      const { password, name } = request.body;
      const existing = await db.user.findUnique({ where: { email: invite.email } });
      if (!existing?.passwordHash && !password) throw new ApiError(400, "password_required", "Choose a password");
      const passwordHash = password && !existing?.passwordHash ? await hashPassword(password) : undefined;

      const claimed = await db.teamInvite.updateMany({ where: { id: invite.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
      if (claimed.count === 0) throw new ApiError(404, "invite_invalid", "This invite is invalid or has expired");

      // The invite link reached this inbox, which proves the address.
      const now = new Date();
      const user = await db.user.upsert({
        where: { email: invite.email },
        create: { email: invite.email, passwordHash, name, emailVerifiedAt: now },
        update: { ...(passwordHash ? { passwordHash } : {}), emailVerifiedAt: existing?.emailVerifiedAt ?? now },
      });
      await db.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
        create: { workspaceId: invite.workspaceId, userId: user.id, role: invite.role },
        update: {},
      });
      return { ok: true };
    });

    await app.register(async (secured) => {
      secured.addHook("preHandler", requireAuth(ctx));
      const typed = secured.withTypeProvider<ZodTypeProvider>();

      typed.get("/workspace/invites", async (request) => {
        return db.teamInvite.findMany({
          where: { workspaceId: request.auth.workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        });
      });

      typed.post("/workspace/invites", { schema: { body: inviteMemberSchema } }, async (request, reply) => {
        requireOwner(request);
        const { email, role } = request.body;
        const { workspaceId, userId } = request.auth;
        const member = await db.workspaceMember.findFirst({ where: { workspaceId, user: { email } } });
        if (member) throw new ApiError(409, "already_member", "This person is already on the team");

        const token = randomToken();
        await db.teamInvite.deleteMany({ where: { workspaceId, email, acceptedAt: null } });
        const invite = await db.teamInvite.create({
          data: { workspaceId, email, role, tokenHash: sha256(token), invitedById: userId, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
          select: { id: true, email: true, role: true, expiresAt: true },
        });
        const workspace = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true } });
        await queueEmail(deps, { template: "team_invite", to: email, workspaceId, transactional: true, data: { agencyName: workspace.name, link: `${env.APP_URL}/team-invite/${token}` } });
        return reply.status(201).send(invite);
      });

      typed.delete("/workspace/invites/:id", { schema: { params: z.object({ id: z.string().uuid() }) } }, async (request) => {
        requireOwner(request);
        const { count } = await db.teamInvite.deleteMany({ where: { id: request.params.id, workspaceId: request.auth.workspaceId, acceptedAt: null } });
        if (count === 0) throw new ApiError(404, "invite_not_found", "Invite not found");
        return { ok: true };
      });
    });
  };
}
