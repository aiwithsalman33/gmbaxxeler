import { jwtVerify, SignJWT } from "jose";
import { ApiError, type AppContext } from "./context";

const ACCESS_TTL = "15m";
const STATE_TTL = "10m";

export interface AccessClaims {
  userId: string;
  workspaceId: string;
  role: string;
}

export interface OAuthState {
  workspaceId: string;
  purpose: "agency" | "invite";
  inviteId?: string;
}

export function signAccess(ctx: AppContext, claims: AccessClaims): Promise<string> {
  return new SignJWT({ wid: claims.workspaceId, role: claims.role, typ: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(ctx.jwtKey);
}

export async function verifyAccess(ctx: AppContext, token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, ctx.jwtKey, { algorithms: ["HS256"] });
  if (payload.typ !== "access" || !payload.sub) throw new Error("Wrong token type");
  return { userId: payload.sub, workspaceId: String(payload.wid), role: String(payload.role) };
}

export function signState(ctx: AppContext, state: OAuthState): Promise<string> {
  return new SignJWT({ ...state, typ: "oauth_state" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(STATE_TTL)
    .sign(ctx.jwtKey);
}

export async function verifyState(ctx: AppContext, token: string): Promise<OAuthState> {
  try {
    const { payload } = await jwtVerify(token, ctx.jwtKey, { algorithms: ["HS256"] });
    if (payload.typ !== "oauth_state") throw new Error("Wrong token type");
    return payload as unknown as OAuthState;
  } catch {
    throw new ApiError(400, "invalid_state", "This link has expired. Please try again.");
  }
}
