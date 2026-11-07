import { decryptSecret, encryptSecret } from "@localpilot/crypto";
import type { GoogleConnection } from "@localpilot/db";
import { GbpError, OAuthError, refreshAccessToken, type GoogleCredentials, type TokenSource } from "@localpilot/gbp";
import type { Deps } from "./context";

const EXPIRY_MARGIN_MS = 60_000;
const LOCK_TIMEOUT_MS = 20_000;

/** Settings override env. Login needs these before any workspace is known, so they're app-wide. */
export async function resolveCredentials(deps: Deps): Promise<GoogleCredentials | null> {
  const settings = await deps.db.appSettings.findUnique({ where: { id: 1 } });
  if (settings?.googleClientId && settings.googleClientSecretEnc) {
    return { clientId: settings.googleClientId, clientSecret: decryptSecret(settings.googleClientSecretEnc, deps.encryptionKey) };
  }
  const { clientId, clientSecret } = deps.googleEnv;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * The API and worker can both need a new token, so the lock lives in Postgres.
 * Whoever waits reuses the token the first process stored.
 */
export function connectionTokens(deps: Deps, connection: Pick<GoogleConnection, "id">): TokenSource {
  return {
    get: (rejected) =>
      deps.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${connection.id}))::text`;
          const row = await tx.googleConnection.findUniqueOrThrow({ where: { id: connection.id } });
          const stored = row.accessTokenEnc ? decryptSecret(row.accessTokenEnc, deps.encryptionKey) : null;
          const fresh = row.accessTokenExpiresAt && row.accessTokenExpiresAt.getTime() > Date.now() + EXPIRY_MARGIN_MS;
          if (stored && fresh && stored !== rejected) return stored;

          if (!row.refreshTokenEnc) throw new GbpError("auth_revoked", "This Google account isn't connected");
          const credentials = await resolveCredentials(deps);
          if (!credentials) throw new GbpError("not_configured", "Google credentials aren't set");
          try {
            const refreshed = await refreshAccessToken(deps.googleHttp, credentials, decryptSecret(row.refreshTokenEnc, deps.encryptionKey));
            await tx.googleConnection.update({
              where: { id: row.id },
              data: {
                accessTokenEnc: encryptSecret(refreshed.accessToken, deps.encryptionKey),
                accessTokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
              },
            });
            return refreshed.accessToken;
          } catch (error) {
            if (error instanceof OAuthError && error.kind === "invalid_grant") throw new GbpError("auth_revoked", "Google authorization is no longer valid");
            throw error;
          }
        },
        { timeout: LOCK_TIMEOUT_MS, maxWait: LOCK_TIMEOUT_MS },
      ),
  };
}
