import { jwtVerify, SignJWT } from "jose";
import type { AppContext } from "./context";

const ACCESS_TTL = "15m";

export interface AccessClaims {
  userId: string;
  workspaceId: string;
  role: string;
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

