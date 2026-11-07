import { consentUrl, exchangeCode, IDENTITY_SCOPES, OAuthError, readIdToken } from "@localpilot/gbp";
import { resolveCredentials } from "@localpilot/services";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { signupAllowed } from "../config";
import { ApiError, type AppContext } from "../context";
import { consumeState, createState } from "../oauth-state";
import { startSession } from "../session";

/** App login only. It never touches the agency Google connection. */
export function googleLoginRoutes(ctx: AppContext) {
  const { db, deps, env } = ctx;
  const redirectUri = `${env.APP_URL}/api/v1/auth/google/callback`;

  async function findOrCreateUser(identity: { subject: string; email: string; name: string | null }) {
    const existing = await db.user.findFirst({ where: { OR: [{ googleSubject: identity.subject }, { email: identity.email }] } });
    if (existing) {
      return db.user.update({
        where: { id: existing.id },
        data: { googleSubject: identity.subject, emailVerifiedAt: existing.emailVerifiedAt ?? new Date(), lastLoginAt: new Date() },
      });
    }
    if (!signupAllowed(env, identity.email)) throw new ApiError(403, "not_allowed", "This Google account isn't allowed");
    return db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: identity.email, name: identity.name, googleSubject: identity.subject, emailVerifiedAt: new Date(), lastLoginAt: new Date() },
      });
      const workspace = await tx.workspace.create({ data: { name: "My Agency", ownerId: user.id } });
      await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "owner" } });
      return user;
    });
  }

  return async (base: FastifyInstance) => {
    const app = base.withTypeProvider<ZodTypeProvider>();
    const limit = { rateLimit: { max: Math.max(env.LOGIN_RATE_LIMIT_MAX, 20), timeWindow: "1 minute" } };

    app.get("/options", async () => {
      return { password: env.AUTH_PASSWORD_ENABLED, google: Boolean(await resolveCredentials(deps)) };
    });

    app.get("/google/start", { config: limit }, async (_request, reply) => {
      const credentials = await resolveCredentials(deps);
      if (!credentials) return reply.redirect(`${env.APP_URL}/login?error=google_not_configured`);
      const { state, codeChallenge } = await createState(ctx, { purpose: "login" });
      return reply.redirect(consentUrl({ clientId: credentials.clientId, redirectUri, scopes: IDENTITY_SCOPES, state, codeChallenge, offline: false }));
    });

    app.get(
      "/google/callback",
      { config: limit, schema: { querystring: z.object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() }) } },
      async (request, reply) => {
        const fail = (reason: string) => reply.redirect(`${env.APP_URL}/login?error=${reason}`);
        const { code, state: rawState, error } = request.query;
        if (error) return fail("google_denied");
        if (!code || !rawState) return fail("google_failed");
        try {
          const state = await consumeState(ctx, rawState);
          if (state.purpose !== "login") return fail("google_failed");
          const credentials = await resolveCredentials(deps);
          if (!credentials) return fail("google_not_configured");
          const tokens = await exchangeCode(deps.googleHttp, credentials, { code, redirectUri, codeVerifier: state.codeVerifier });
          if (!tokens.idToken) return fail("google_failed");
          const identity = readIdToken(tokens.idToken, credentials.clientId);
          if (!identity.emailVerified) return fail("google_unverified");
          // The agency account holds client access, so it's kept away from app login.
          if (deps.agencyEmail && identity.email === deps.agencyEmail) return fail("agency_account");
          const user = await findOrCreateUser(identity);
          await startSession(ctx, user.id, request, reply);
          return reply.redirect(`${env.APP_URL}/`);
        } catch (failure) {
          if (failure instanceof ApiError && failure.code === "not_allowed") return fail("not_allowed");
          if (failure instanceof ApiError && failure.code === "invalid_credentials") return fail("not_allowed");
          if (failure instanceof ApiError && failure.code === "invalid_state") return fail("google_expired");
          if (failure instanceof OAuthError && failure.kind === "redirect_uri_mismatch") return fail("google_redirect");
          request.log.error({ message: failure instanceof Error ? failure.message : "unknown" }, "google login failed");
          return fail("google_failed");
        }
      },
    );
  };
}
