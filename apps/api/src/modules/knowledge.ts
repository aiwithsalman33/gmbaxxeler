import { profileSchema } from "@localpilot/contracts";
import { syncClient } from "@localpilot/services";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ApiError, type AppContext } from "../context";
import { scopedClient } from "../guards";

const params = z.object({ id: z.string().uuid() });

export function knowledgeRoutes(ctx: AppContext) {
  const { db, deps } = ctx;

  return async (base: FastifyInstance) => {
    const app = base.withTypeProvider<ZodTypeProvider>();

    app.get("/clients/:id/profile", { schema: { params } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      const profile = await db.clientProfile.findUnique({ where: { clientId: client.id } });
      return { name: client.name, profile };
    });

    app.put("/clients/:id/profile", { schema: { params, body: profileSchema } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      const data = { ...request.body, onboardedAt: new Date() };
      return db.clientProfile.upsert({ where: { clientId: client.id }, create: { clientId: client.id, ...data }, update: data });
    });

    app.post("/clients/:id/profile/resync", { schema: { params } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      if (client.status !== "connected") throw new ApiError(409, "client_not_connected", "This client is not connected");
      return { result: await syncClient(deps, client.id) };
    });
  };
}
