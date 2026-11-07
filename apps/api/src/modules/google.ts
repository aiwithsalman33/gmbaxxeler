import { decryptSecret, encryptSecret } from "@localpilot/crypto";
import type { GoogleConnection } from "@localpilot/db";
import { attachInviteLocations, markConnectionRevoked, reattachClients } from "@localpilot/services";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ApiError, type AppContext } from "../context";
import { requireAuth } from "../guards";
import { signState, verifyState, type OAuthState } from "../tokens";

export function redirectUri(ctx: AppContext): string {
  return `${ctx.env.API_URL}/v1/google/oauth/callback`;
}

function publicConnection({ id, googleAccountEmail, status, source, createdAt }: GoogleConnection) {
  return { id, googleAccountEmail, status, source, createdAt };
}

export function googleRoutes(ctx: AppContext) {
  const { db, deps, env } = ctx;

  async function storeConnection(state: OAuthState, code: string, businessName: string | null) {
    const identity = await deps.gbp.exchangeCode(code, redirectUri(ctx), {
      workspaceId: state.workspaceId,
      purpose: state.purpose,
      businessName,
    });
    const source = state.purpose === "agency" ? "agency" : "invite";
    if (source === "agency") {
      const active = await db.googleConnection.findFirst({ where: { workspaceId: state.workspaceId, source, status: "active" } });
      if (active && active.googleSubject !== identity.subject) {
        throw new ApiError(409, "agency_already_connected", "Disconnect the current agency account first");
      }
    }
    const secret = {
      googleAccountEmail: identity.email,
      refreshTokenEnc: encryptSecret(identity.refreshToken, deps.encryptionKey),
      scopes: identity.scopes,
      status: "active" as const,
    };
    return db.googleConnection.upsert({
      where: { workspaceId_googleSubject: { workspaceId: state.workspaceId, googleSubject: identity.subject } },
      create: { workspaceId: state.workspaceId, googleSubject: identity.subject, source, ...secret },
      update: secret,
    });
  }

  async function finishInvite(state: OAuthState, connection: GoogleConnection): Promise<void> {
    const invite = await db.clientInvite.findFirst({ where: { id: state.inviteId, workspaceId: state.workspaceId } });
    if (!invite) throw new ApiError(404, "invite_not_found", "Invite not found");
    await attachInviteLocations(deps, connection, invite.clientId);
    await db.clientInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date(), connectionId: connection.id } });
  }

  return async (base: FastifyInstance) => {
    const app = base.withTypeProvider<ZodTypeProvider>();

    app.get("/oauth/start", { preHandler: requireAuth(ctx) }, async (request, reply) => {
      const state = await signState(ctx, { workspaceId: request.auth.workspaceId, purpose: "agency" });
      return reply.redirect(deps.gbp.authUrl(state, redirectUri(ctx)));
    });

    app.get(
      "/oauth/callback",
      { schema: { querystring: z.object({ code: z.string().optional(), state: z.string(), error: z.string().optional() }) } },
      async (request, reply) => {
        const { code, state: rawState, error } = request.query;
        const state = await verifyState(ctx, rawState);
        const finish = (result: string) =>
          reply.redirect(
            state.purpose === "invite"
              ? `${env.APP_URL}/invite/done?result=${result}`
              : `${env.APP_URL}/settings?google=${result}`,
          );
        if (error || !code) return finish("denied");
        try {
          if (state.purpose === "invite") {
            const invite = await db.clientInvite.findFirst({ where: { id: state.inviteId, workspaceId: state.workspaceId } });
            const client = invite?.clientId ? await db.client.findUnique({ where: { id: invite.clientId } }) : null;
            await finishInvite(state, await storeConnection(state, code, client?.name ?? null));
          } else {
            await reattachClients(deps, await storeConnection(state, code, null));
          }
          return finish("connected");
        } catch (failure) {
          if (failure instanceof ApiError && failure.code === "agency_already_connected") return finish("different_account");
          request.log.error({ message: failure instanceof Error ? failure.message : "unknown" }, "google connect failed");
          return finish("failed");
        }
      },
    );

    await app.register(async (secured) => {
      secured.addHook("preHandler", requireAuth(ctx));

      secured.get("/connections", async (request) => {
        const connections = await db.googleConnection.findMany({
          where: { workspaceId: request.auth.workspaceId },
          orderBy: { createdAt: "asc" },
        });
        return connections.map(publicConnection);
      });

      secured.post<{ Params: { id: string } }>("/connections/:id/reconnect", async (request) => {
        const connection = await db.googleConnection.findFirst({ where: { id: request.params.id, workspaceId: request.auth.workspaceId } });
        if (!connection) throw new ApiError(404, "connection_not_found", "Connection not found");
        const state = await signState(ctx, { workspaceId: request.auth.workspaceId, purpose: "agency" });
        return { url: deps.gbp.authUrl(state, redirectUri(ctx)) };
      });

      secured.delete<{ Params: { id: string } }>("/connections/:id", async (request) => {
        const connection = await db.googleConnection.findFirst({
          where: { id: request.params.id, workspaceId: request.auth.workspaceId },
        });
        if (!connection) throw new ApiError(404, "connection_not_found", "Connection not found");
        await deps.gbp.revoke(decryptSecret(connection.refreshTokenEnc, deps.encryptionKey));
        await markConnectionRevoked(deps, connection.id);
        return { ok: true };
      });
    });
  };
}
