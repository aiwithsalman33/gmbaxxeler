import type { Client } from "@localpilot/db";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ApiError, type AppContext } from "./context";
import { verifyAccess, type AccessClaims } from "./tokens";

export const ACCESS_COOKIE = "lp_access";
export const REFRESH_COOKIE = "lp_refresh";

declare module "fastify" {
  interface FastifyRequest {
    auth: AccessClaims;
  }
}

export function requireAuth(ctx: AppContext) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const token = request.cookies[ACCESS_COOKIE];
    if (!token) throw new ApiError(401, "unauthenticated", "Please log in");
    try {
      request.auth = await verifyAccess(ctx, token);
    } catch {
      throw new ApiError(401, "unauthenticated", "Please log in");
    }
  };
}

/** Every client route goes through this: an id from another workspace is a 404. */
export async function scopedClient(ctx: AppContext, request: FastifyRequest, id: string): Promise<Client> {
  const client = await ctx.db.client.findFirst({
    where: { id, workspaceId: request.auth.workspaceId, status: { not: "removed" } },
  });
  if (!client) throw new ApiError(404, "client_not_found", "Client not found");
  return client;
}
