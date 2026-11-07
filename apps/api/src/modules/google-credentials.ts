import { googleCredentialsSchema } from "@localpilot/contracts";
import { decryptSecret, encryptSecret } from "@localpilot/crypto";
import { OAuthError, testCredentials } from "@localpilot/gbp";
import { agencyConnection, resolveCredentials } from "@localpilot/services";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ApiError, type AppContext } from "../context";
import { redirectUri } from "./google";

const SECRET_TAIL = 4;

export function googleCredentialRoutes(ctx: AppContext) {
  const { db, deps, env } = ctx;
  const uris = [redirectUri(ctx), `${env.APP_URL}/api/v1/auth/google/callback`];

  function requireOwner(request: FastifyRequest): void {
    if (request.auth.role !== "owner") throw new ApiError(403, "forbidden", "Only the owner can change this");
  }

  async function credentialSummary() {
    const settings = await db.appSettings.findUnique({ where: { id: 1 } });
    if (settings?.googleClientId && settings.googleClientSecretEnc) {
      const secret = decryptSecret(settings.googleClientSecretEnc, deps.encryptionKey);
      return { source: "settings", clientId: settings.googleClientId, maskedSecret: `••••${secret.slice(-SECRET_TAIL)}`, status: settings.credentialsStatus };
    }
    if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
      return { source: "env", clientId: env.GOOGLE_CLIENT_ID, maskedSecret: `••••${env.GOOGLE_CLIENT_SECRET.slice(-SECRET_TAIL)}`, status: settings?.credentialsStatus ?? "unknown" };
    }
    return { source: "none", clientId: null, maskedSecret: null, status: "unknown" };
  }

  return async (base: FastifyInstance) => {
    const app = base.withTypeProvider<ZodTypeProvider>();

    app.get("/settings/google/credentials", async () => ({ ...(await credentialSummary()), redirectUris: uris }));

    app.put("/settings/google/credentials", { schema: { body: googleCredentialsSchema } }, async (request) => {
      requireOwner(request);
      const { clientId, clientSecret } = request.body;
      const data = {
        googleClientId: clientId,
        credentialsStatus: "unknown",
        ...(clientSecret ? { googleClientSecretEnc: encryptSecret(clientSecret, deps.encryptionKey) } : {}),
      };
      await db.appSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
      await db.auditLog.create({ data: { workspaceId: request.auth.workspaceId, actorId: request.auth.userId, action: "google.credentials_updated", entity: "app_settings" } });
      return { ok: true };
    });

    app.delete("/settings/google/credentials", async (request) => {
      requireOwner(request);
      await db.appSettings.updateMany({ data: { googleClientId: null, googleClientSecretEnc: null, credentialsStatus: "unknown" } });
      return { ok: true };
    });

    app.post("/settings/google/credentials/test", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request) => {
      requireOwner(request);
      const credentials = await resolveCredentials(deps);
      if (!credentials) throw new ApiError(400, "missing_credentials", "Add a Client ID and Secret first");
      try {
        const status = await testCredentials(deps.googleHttp, credentials, redirectUri(ctx));
        await db.appSettings.upsert({ where: { id: 1 }, create: { id: 1, credentialsStatus: status, testedAt: new Date() }, update: { credentialsStatus: status, testedAt: new Date() } });
        return { status };
      } catch (error) {
        if (error instanceof OAuthError) throw new ApiError(502, "google_unavailable", "Couldn't reach Google. Try again shortly.");
        throw error;
      }
    });

    app.get("/settings/google/status", async (request) => {
      const [credentials, settings, agency] = await Promise.all([credentialSummary(), db.appSettings.findUnique({ where: { id: 1 } }), agencyConnection(deps, request.auth.workspaceId)]);
      return {
        adapter: deps.gbp.name,
        credentialsSet: credentials.source !== "none",
        agencyConnected: Boolean(agency),
        // Mock mode never reaches Google, so it can't show approval.
        apiAccess: deps.gbp.name === "mock" ? "not_approved" : (settings?.apiAccess ?? "unknown"),
        expectedAgencyEmail: deps.agencyEmail,
        clientOauthLinks: env.ENABLE_CLIENT_OAUTH_LINKS,
      };
    });
  };
}
