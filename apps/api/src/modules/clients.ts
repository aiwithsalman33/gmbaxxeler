import { addClientSchema, importClientsSchema, locationRefSchema, matchInvitationSchema, sendGuideSchema, updateClientSchema } from "@localpilot/contracts";
import type { Client } from "@localpilot/db";
import {
  agencyConnection,
  declineInvitation,
  ensureFolders,
  guideMessage,
  importLocations,
  listUnattachedLocations,
  matchInvitationManually,
  matchLocationManually,
  pollInvitations,
  queueEmail,
  whatsappLink,
} from "@localpilot/services";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ApiError, type AppContext } from "../context";
import { scopedClient } from "../guards";

const idParams = z.object({ id: z.string().uuid() });

export function clientRoutes(ctx: AppContext) {
  const { db, deps } = ctx;

  async function guideFor(client: Client) {
    const connection = await agencyConnection(deps, client.workspaceId);
    const agencyEmail = connection?.googleAccountEmail ?? null;
    const { subject, text } = guideMessage({ businessName: client.name, agencyEmail });
    return { subject, text, agencyEmail, whatsappUrl: whatsappLink(client.contactPhone, text), channels: deps.messenger.available() };
  }

  async function scopedInvitation(request: FastifyRequest, id: string) {
    const invitation = await db.gbpInvitation.findFirst({ where: { id, workspaceId: request.auth.workspaceId } });
    if (!invitation) throw new ApiError(404, "invitation_not_found", "Invitation not found");
    return invitation;
  }

  return async (base: FastifyInstance) => {
    const app = base.withTypeProvider<ZodTypeProvider>();

    app.get("/clients", async (request) => {
      return db.client.findMany({
        where: { workspaceId: request.auth.workspaceId, status: { not: "removed" } },
        include: { stats: { select: { strengthScore: true, rating: true } } },
        orderBy: { name: "asc" },
      });
    });

    app.post("/clients", { schema: { body: addClientSchema } }, async (request, reply) => {
      const { businessName, ...contact } = request.body;
      const client = await db.client.create({
        data: { workspaceId: request.auth.workspaceId, name: businessName, status: "invited", invitedAt: new Date(), ...contact },
      });
      await ensureFolders(deps, client);
      await db.auditLog.create({
        data: { workspaceId: client.workspaceId, clientId: client.id, actorId: request.auth.userId, action: "client.added", entity: "client", entityId: client.id },
      });
      return reply.status(201).send({ client, guide: await guideFor(client) });
    });

    app.post("/clients/import", { schema: { body: importClientsSchema } }, async (request) => {
      return importLocations(deps, request.auth.workspaceId, request.body.locations);
    });

    app.post("/clients/check-invitations", { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } }, async (request) => {
      return pollInvitations(deps, request.auth.workspaceId);
    });

    app.get("/clients/:id", { schema: { params: idParams } }, async (request) => {
      return scopedClient(ctx, request, request.params.id);
    });

    app.patch("/clients/:id", { schema: { params: idParams, body: updateClientSchema } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      const { paused, ...fields } = request.body;
      let status = client.status;
      if (paused === true && client.status === "connected") status = "paused";
      if (paused === false && client.status === "paused") status = "connected";
      return db.client.update({ where: { id: client.id }, data: { ...fields, status } });
    });

    app.delete("/clients/:id", { schema: { params: idParams } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      await db.client.update({ where: { id: client.id }, data: { status: "removed" } });
      await db.auditLog.create({
        data: { workspaceId: client.workspaceId, clientId: client.id, actorId: request.auth.userId, action: "client.removed", entity: "client", entityId: client.id },
      });
      return { ok: true };
    });

    app.get("/clients/:id/guide", { schema: { params: idParams } }, async (request) => {
      return guideFor(await scopedClient(ctx, request, request.params.id));
    });

    app.post("/clients/:id/guide/send", { schema: { params: idParams, body: sendGuideSchema } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      const { channel } = request.body;
      if (channel !== "copy") {
        const to = client.contactPhone;
        if (!to) throw new ApiError(400, "missing_contact", `This client has no contact for ${channel}`);
        if (!deps.messenger.available().includes(channel)) {
          throw new ApiError(400, "channel_unavailable", `${channel} is not set up`);
        }
        const { subject, text } = await guideFor(client);
        await deps.messenger.send(channel, { to, subject, text });
      }
      return db.client.update({
        where: { id: client.id },
        data: {
          guideSentAt: new Date(),
          status: client.status === "invited" ? "waiting_for_access" : client.status,
        },
      });
    });

    app.post("/clients/:id/invite-email", { schema: { params: idParams }, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      if (!client.contactEmail) throw new ApiError(400, "missing_contact", "This client has no email address");
      const connection = await agencyConnection(deps, client.workspaceId);
      if (!connection) throw new ApiError(409, "no_connection", "Connect the agency Google account first");
      const queued = await queueEmail(deps, {
        template: "client_invite",
        to: client.contactEmail,
        workspaceId: client.workspaceId,
        clientId: client.id,
        data: { businessName: client.name, agencyEmail: connection.googleAccountEmail },
      });
      if (!queued) throw new ApiError(429, "mail_cap_reached", "Today's email limit is reached. Copy the message instead.");
      const now = new Date();
      return db.client.update({
        where: { id: client.id },
        data: { inviteEmailSentAt: now, guideSentAt: now, status: client.status === "invited" ? "waiting_for_access" : client.status },
      });
    });

    app.post("/clients/:id/match-location", { schema: { params: idParams, body: locationRefSchema } }, async (request) => {
      return matchLocationManually(deps, await scopedClient(ctx, request, request.params.id), request.body);
    });

    app.get("/locations/unattached", async (request) => {
      return listUnattachedLocations(deps, request.auth.workspaceId);
    });

    app.get("/invitations", async (request) => {
      return db.gbpInvitation.findMany({
        where: { workspaceId: request.auth.workspaceId, status: { in: ["pending", "needs_review"] } },
        orderBy: { firstSeenAt: "desc" },
      });
    });

    app.post("/invitations/:id/match", { schema: { params: idParams, body: matchInvitationSchema } }, async (request) => {
      const invitation = await scopedInvitation(request, request.params.id);
      const client = await scopedClient(ctx, request, request.body.clientId);
      return matchInvitationManually(deps, invitation, client);
    });

    app.post("/invitations/:id/decline", { schema: { params: idParams } }, async (request) => {
      await declineInvitation(deps, await scopedInvitation(request, request.params.id));
      return { ok: true };
    });
  };
}
