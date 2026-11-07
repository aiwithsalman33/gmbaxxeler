import { decryptSecret, encryptSecret } from "@localpilot/crypto";
import type { GoogleConnection } from "@localpilot/db";
import { BUSINESS_SCOPE, GbpError, OAuthError } from "@localpilot/gbp";
import { attachInviteLocations, needsConfirmation, reattachClients, scanLocations } from "@localpilot/services";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ApiError, type AppContext } from "../context";
import { requireAuth } from "../guards";
import { consumeState, createState, type ConsumedState } from "../oauth-state";

const idParams = z.object({ id: z.string().uuid() });

export function redirectUri(ctx: AppContext): string {
  return `${ctx.env.APP_URL}/api/v1/google/oauth/callback`;
}

export function googleRoutes(ctx: AppContext) {
  const { db, deps, env } = ctx;

  function publicConnection(connection: GoogleConnection) {
    const { id, googleAccountEmail, status, source, scopes, lastSyncedAt, accountsCount, locationsCount, lastError, createdAt } = connection;
    return { id, googleAccountEmail, status, source, scopes, lastSyncedAt, accountsCount, locationsCount, lastError, createdAt, needsConfirmation: needsConfirmation(deps, connection) };
  }

  async function storeConnection(state: ConsumedState, code: string, businessName: string | null): Promise<GoogleConnection> {
    const workspaceId = state.workspaceId!;
    const purpose = state.purpose === "invite" ? "invite" : "agency";
    const identity = await deps.gbp.exchangeCode(code, redirectUri(ctx), { workspaceId, purpose, businessName, codeVerifier: state.codeVerifier });
    if (!identity.scopes.includes(BUSINESS_SCOPE)) throw new ApiError(400, "missing_permission", "Business Profile permission was not granted");

    const source = purpose === "agency" ? "agency" : "invite";
    if (source === "agency") {
      const active = await db.googleConnection.findFirst({ where: { workspaceId, source, status: "active" } });
      if (active && active.googleSubject !== identity.subject) throw new ApiError(409, "agency_already_connected", "Disconnect the current agency account first");
    }
    const key = { workspaceId_googleSubject: { workspaceId, googleSubject: identity.subject } };
    const existing = await db.googleConnection.findUnique({ where: key });
    if (!identity.refreshToken && !existing?.refreshTokenEnc) throw new ApiError(400, "no_refresh_token", "Google didn't return a refresh token");

    const data = {
      googleAccountEmail: identity.email,
      googleName: identity.name,
      scopes: identity.scopes,
      status: "active" as const,
      lastError: null,
      accessTokenEnc: null,
      accessTokenExpiresAt: null,
      ...(identity.refreshToken ? { refreshTokenEnc: encryptSecret(identity.refreshToken, deps.encryptionKey) } : {}),
    };
    return db.googleConnection.upsert({ where: key, create: { workspaceId, googleSubject: identity.subject, source, ...data }, update: data });
  }

  async function finishAgency(connection: GoogleConnection): Promise<string> {
    if (needsConfirmation(deps, connection)) return "mismatch";
    await reattachClients(deps, connection);
    await scanLocations(deps, connection);
    return "connected";
  }

  async function finishInvite(state: ConsumedState, code: string): Promise<void> {
    const invite = await db.clientInvite.findFirst({ where: { id: state.inviteId, workspaceId: state.workspaceId } });
    if (!invite) throw new ApiError(404, "invite_not_found", "Invite not found");
    const client = invite.clientId ? await db.client.findUnique({ where: { id: invite.clientId } }) : null;
    const connection = await storeConnection(state, code, client?.name ?? null);
    await attachInviteLocations(deps, connection, invite.clientId);
    await db.clientInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date(), connectionId: connection.id } });
  }

  function resultFor(failure: unknown): string | null {
    if (failure instanceof ApiError) {
      if (failure.code === "invalid_state") return "expired";
      if (failure.code === "agency_already_connected") return "different_account";
      if (failure.code === "missing_permission" || failure.code === "no_refresh_token") return failure.code;
    }
    if (failure instanceof OAuthError && failure.kind === "redirect_uri_mismatch") return "redirect_mismatch";
    if (failure instanceof OAuthError && failure.kind === "invalid_grant") return "invalid_grant";
    if (failure instanceof OAuthError && failure.kind === "invalid_client") return "invalid_client";
    if (failure instanceof GbpError && failure.kind === "quota_zero") return "quota_zero";
    return null;
  }

  async function startUrl(workspaceId: string, userId: string, reply: FastifyReply): Promise<string | null> {
    try {
      const { state, codeChallenge } = await createState(ctx, { purpose: "agency", workspaceId, userId });
      return await deps.gbp.authUrl({ state, redirectUri: redirectUri(ctx), codeChallenge, loginHint: deps.agencyEmail });
    } catch (error) {
      if (error instanceof GbpError && error.kind === "not_configured") {
        reply.redirect(`${env.APP_URL}/settings/google?google=no_credentials`);
        return null;
      }
      throw error;
    }
  }

  return async (base: FastifyInstance) => {
    const app = base.withTypeProvider<ZodTypeProvider>();

    app.get("/oauth/start", { preHandler: requireAuth(ctx) }, async (request, reply) => {
      const url = await startUrl(request.auth.workspaceId, request.auth.userId, reply);
      return url ? reply.redirect(url) : reply;
    });

    app.get(
      "/oauth/callback",
      { schema: { querystring: z.object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() }) } },
      async (request, reply) => {
        const { code, state: rawState, error } = request.query;
        const finish = (result: string, invite = false) => reply.redirect(invite ? `${env.APP_URL}/invite/done?result=${result}` : `${env.APP_URL}/settings/google?google=${result}`);
        let state: ConsumedState;
        try {
          state = await consumeState(ctx, rawState ?? "");
        } catch {
          return finish("expired");
        }
        const invite = state.purpose === "invite";
        if (state.purpose === "login") return finish("failed");
        if (error === "access_denied") return finish("denied", invite);
        if (error || !code) return finish("failed", invite);
        try {
          if (invite) await finishInvite(state, code);
          else return finish(await finishAgency(await storeConnection(state, code, null)));
          return finish("connected", invite);
        } catch (failure) {
          const result = resultFor(failure);
          if (result) return finish(result, invite);
          request.log.error({ message: failure instanceof Error ? failure.message : "unknown" }, "google connect failed");
          return finish("failed", invite);
        }
      },
    );

    await app.register(async (secured) => {
      secured.addHook("preHandler", requireAuth(ctx));
      const typed = secured.withTypeProvider<ZodTypeProvider>();

      async function scoped(request: { auth: { workspaceId: string } }, id: string): Promise<GoogleConnection> {
        const connection = await db.googleConnection.findFirst({ where: { id, workspaceId: request.auth.workspaceId } });
        if (!connection) throw new ApiError(404, "connection_not_found", "Connection not found");
        return connection;
      }

      typed.get("/connections", async (request) => {
        const connections = await db.googleConnection.findMany({ where: { workspaceId: request.auth.workspaceId }, orderBy: { createdAt: "asc" } });
        return connections.map(publicConnection);
      });

      typed.post("/connections/:id/reconnect", { schema: { params: idParams } }, async (request, reply) => {
        await scoped(request, request.params.id);
        const url = await startUrl(request.auth.workspaceId, request.auth.userId, reply);
        return url ? { url } : reply;
      });

      typed.post("/connections/:id/confirm-mismatch", { schema: { params: idParams } }, async (request) => {
        if (request.auth.role !== "owner") throw new ApiError(403, "forbidden", "Only the owner can change this");
        const connection = await scoped(request, request.params.id);
        const updated = await db.googleConnection.update({ where: { id: connection.id }, data: { mismatchConfirmedAt: new Date() } });
        await reattachClients(deps, updated);
        return publicConnection(updated);
      });

      typed.post("/connections/:id/rescan", { schema: { params: idParams }, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request) => {
        const connection = await scoped(request, request.params.id);
        const { accounts, locations } = await scanLocations(deps, connection);
        return { accounts, locations: locations.length };
      });

      typed.delete("/connections/:id", { schema: { params: idParams } }, async (request) => {
        if (request.auth.role !== "owner") throw new ApiError(403, "forbidden", "Only the owner can change this");
        const connection = await scoped(request, request.params.id);
        if (connection.refreshTokenEnc) await deps.gbp.revoke(decryptSecret(connection.refreshTokenEnc, deps.encryptionKey));
        await db.googleConnection.update({
          where: { id: connection.id },
          data: { status: "disconnected", refreshTokenEnc: null, accessTokenEnc: null, accessTokenExpiresAt: null },
        });
        await db.client.updateMany({ where: { connectionId: connection.id, status: "connected" }, data: { status: "reconnect_required" } });
        return { ok: true };
      });
    });
  };
}
