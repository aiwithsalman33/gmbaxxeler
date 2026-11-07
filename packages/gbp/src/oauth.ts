import { createHash, randomBytes } from "node:crypto";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export const BUSINESS_SCOPE = "https://www.googleapis.com/auth/business.manage";
export const IDENTITY_SCOPES = ["openid", "email", "profile"];

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
}

export type OAuthFailure = "invalid_grant" | "invalid_client" | "redirect_uri_mismatch" | "unavailable";

export class OAuthError extends Error {
  constructor(public readonly kind: OAuthFailure) {
    super(`Google OAuth failed: ${kind}`);
    this.name = "OAuthError";
  }
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: pkceChallenge(verifier) };
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export interface ConsentOptions {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  codeChallenge: string;
  loginHint?: string | null;
  /** Agency access needs a refresh token. Login only needs an identity. */
  offline: boolean;
}

export function consentUrl(options: ConsentOptions): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: "code",
    scope: options.scopes.join(" "),
    state: options.state,
    code_challenge: options.codeChallenge,
    code_challenge_method: "S256",
    prompt: options.offline ? "consent select_account" : "select_account",
  });
  if (options.offline) params.set("access_type", "offline");
  if (options.loginHint) params.set("login_hint", options.loginHint);
  return `${AUTH_URL}?${params}`;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scopes: string[];
  idToken: string | null;
}

async function tokenRequest(http: typeof fetch, body: Record<string, string>): Promise<TokenResponse> {
  const response = await http(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    id_token?: string;
    error?: string;
  };
  if (!response.ok || !data.access_token) {
    if (data.error === "invalid_grant" || data.error === "invalid_client" || data.error === "redirect_uri_mismatch") throw new OAuthError(data.error);
    throw new OAuthError("unavailable");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in ?? 3600,
    scopes: (data.scope ?? "").split(" ").filter(Boolean),
    idToken: data.id_token ?? null,
  };
}

export function exchangeCode(
  http: typeof fetch,
  credentials: GoogleCredentials,
  input: { code: string; redirectUri: string; codeVerifier: string },
): Promise<TokenResponse> {
  return tokenRequest(http, {
    code: input.code,
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
    grant_type: "authorization_code",
  });
}

export function refreshAccessToken(http: typeof fetch, credentials: GoogleCredentials, refreshToken: string): Promise<TokenResponse> {
  return tokenRequest(http, {
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

export async function revokeToken(http: typeof fetch, token: string): Promise<void> {
  await http(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);
}

/**
 * Sends a deliberately bad code. Google checks the client first, so
 * invalid_grant proves the ID and secret are right without any sign-in.
 */
export async function testCredentials(http: typeof fetch, credentials: GoogleCredentials, redirectUri: string): Promise<"valid" | "invalid"> {
  try {
    await exchangeCode(http, credentials, { code: "credential-check", redirectUri, codeVerifier: "credential-check" });
    return "valid";
  } catch (error) {
    if (error instanceof OAuthError && error.kind === "invalid_client") return "invalid";
    if (error instanceof OAuthError && error.kind === "invalid_grant") return "valid";
    throw error;
  }
}

export interface IdTokenClaims {
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

/** The token came straight from Google over TLS, so its claims are checked, not its signature. */
export function readIdToken(idToken: string, clientId: string, now = Date.now()): IdTokenClaims {
  const payload = idToken.split(".")[1];
  if (!payload) throw new OAuthError("unavailable");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    aud?: string;
    iss?: string;
    exp?: number;
    sub?: string;
    email?: string;
    email_verified?: boolean | string;
    name?: string;
  };
  const issuerOk = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  if (claims.aud !== clientId || !issuerOk || !claims.exp || claims.exp * 1000 < now || !claims.sub || !claims.email) {
    throw new OAuthError("unavailable");
  }
  return {
    subject: claims.sub,
    email: claims.email.toLowerCase(),
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
    name: claims.name ?? null,
  };
}
