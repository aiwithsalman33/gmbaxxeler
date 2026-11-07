import { randomToken, sha256 } from "@localpilot/crypto";
import { phoneSchema } from "@localpilot/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ApiError, type AppContext } from "../context";
import { requireAuth, scopedClient } from "../guards";
import { signState } from "../tokens";
import { redirectUri } from "./google";

const INVITE_TTL_MS = 7 * 86_400_000;

const createInviteSchema = z.object({
  clientId: z.string().uuid().optional(),
  contactPhone: phoneSchema.optional(),
  contactEmail: z.string().email().optional(),
});

/** Secondary flow: a client signs in with Google directly instead of adding a manager. */
export function inviteRoutes(ctx: AppContext) {
  const { db, deps, env } = ctx;

  async function liveInvite(token: string) {
    const invite = await db.clientInvite.findUnique({ where: { tokenHash: sha256(token) } });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw new ApiError(404, "invite_invalid", "This invite link is invalid or has expired");
    }
    return invite;
  }

  return async (base: FastifyInstance) => {
    const app = base.withTypeProvider<ZodTypeProvider>();

    app.get("/public/invites/:token", { schema: { params: z.object({ token: z.string() }) } }, async (request) => {
      const invite = await liveInvite(request.params.token);
      const workspace = await db.workspace.findUniqueOrThrow({ where: { id: invite.workspaceId }, select: { name: true } });
      return { agencyName: workspace.name, expiresAt: invite.expiresAt };
    });

    app.get("/public/invites/:token/start", { schema: { params: z.object({ token: z.string() }) } }, async (request, reply) => {
      const invite = await liveInvite(request.params.token);
      const state = await signState(ctx, { workspaceId: invite.workspaceId, purpose: "invite", inviteId: invite.id });
      return reply.redirect(deps.gbp.authUrl(state, redirectUri(ctx)));
    });

    await app.register(async (secured) => {
      secured.addHook("preHandler", requireAuth(ctx));
      const typed = secured.withTypeProvider<ZodTypeProvider>();

      typed.post("/invites", { schema: { body: createInviteSchema } }, async (request) => {
        const { clientId, contactPhone, contactEmail } = request.body;
        if (clientId) await scopedClient(ctx, request, clientId);
        const token = randomToken();
        const invite = await db.clientInvite.create({
          data: {
            workspaceId: request.auth.workspaceId,
            clientId,
            contactPhone,
            contactEmail,
            tokenHash: sha256(token),
            expiresAt: new Date(Date.now() + INVITE_TTL_MS),
          },
        });
        return { id: invite.id, url: `${env.APP_URL}/invite/${token}`, expiresAt: invite.expiresAt };
      });

      typed.get("/invites", async (request) => {
        return db.clientInvite.findMany({
          where: { workspaceId: request.auth.workspaceId },
          select: { id: true, clientId: true, contactPhone: true, contactEmail: true, expiresAt: true, acceptedAt: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        });
      });

      typed.delete("/invites/:id", { schema: { params: z.object({ id: z.string().uuid() }) } }, async (request) => {
        const { count } = await db.clientInvite.deleteMany({ where: { id: request.params.id, workspaceId: request.auth.workspaceId } });
        if (count === 0) throw new ApiError(404, "invite_not_found", "Invite not found");
        return { ok: true };
      });
    });
  };
}
