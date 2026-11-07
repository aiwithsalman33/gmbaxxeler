import { decryptSecret, encryptSecret, hmacSha256, randomToken, sha256 } from "@localpilot/crypto";
import type { OAuthPurpose } from "@localpilot/db";
import { pkcePair } from "@localpilot/gbp";
import { timingSafeEqual } from "node:crypto";
import { ApiError, type AppContext } from "./context";

const STATE_TTL_MS = 10 * 60_000;

export interface StateInput {
  purpose: OAuthPurpose;
  workspaceId?: string;
  userId?: string;
  inviteId?: string;
}

/** Signed so a forged value is rejected, stored so a real one works only once. */
export async function createState(ctx: AppContext, input: StateInput): Promise<{ state: string; codeChallenge: string }> {
  const nonce = randomToken();
  const { verifier, challenge } = pkcePair();
  await ctx.db.oAuthState.create({
    data: {
      ...input,
      stateHash: sha256(nonce),
      codeVerifierEnc: encryptSecret(verifier, ctx.deps.encryptionKey),
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    },
  });
  return { state: `${nonce}.${hmacSha256(nonce, ctx.env.JWT_SECRET)}`, codeChallenge: challenge };
}

export interface ConsumedState extends StateInput {
  codeVerifier: string;
}

export async function consumeState(ctx: AppContext, state: string): Promise<ConsumedState> {
  const invalid = new ApiError(400, "invalid_state", "This sign-in link has expired. Please try again.");
  const [nonce, signature] = state.split(".");
  if (!nonce || !signature) throw invalid;
  const expected = hmacSha256(nonce, ctx.env.JWT_SECRET);
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw invalid;

  const stateHash = sha256(nonce);
  const { count } = await ctx.db.oAuthState.updateMany({ where: { stateHash, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
  if (count === 0) throw invalid;
  const row = await ctx.db.oAuthState.findUniqueOrThrow({ where: { stateHash } });
  return {
    purpose: row.purpose,
    workspaceId: row.workspaceId ?? undefined,
    userId: row.userId ?? undefined,
    inviteId: row.inviteId ?? undefined,
    codeVerifier: decryptSecret(row.codeVerifierEnc, ctx.deps.encryptionKey),
  };
}
