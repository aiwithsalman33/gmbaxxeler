import { randomToken, sha256 } from "@localpilot/crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ApiError, type AppContext } from "./context";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "./guards";
import { signAccess } from "./tokens";

const REFRESH_TTL_MS = 30 * 86_400_000;
export const REFRESH_PATH = "/api/v1/auth";

export function cookieOptions(ctx: AppContext) {
  return { httpOnly: true, sameSite: "lax" as const, secure: ctx.env.APP_ENV === "production" };
}

export async function startSession(ctx: AppContext, userId: string, request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const member = await ctx.db.workspaceMember.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
  if (!member) throw new ApiError(401, "invalid_credentials", "Email or password is incorrect");
  const refresh = randomToken();
  await ctx.db.session.create({
    data: {
      userId,
      refreshTokenHash: sha256(refresh),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      userAgent: request.headers["user-agent"]?.slice(0, 200),
    },
  });
  const access = await signAccess(ctx, { userId, workspaceId: member.workspaceId, role: member.role });
  const cookies = cookieOptions(ctx);
  reply
    .setCookie(ACCESS_COOKIE, access, { ...cookies, path: "/", maxAge: 15 * 60 })
    .setCookie(REFRESH_COOKIE, refresh, { ...cookies, path: REFRESH_PATH, maxAge: REFRESH_TTL_MS / 1000 });
}
