import { addClientSchema, importClientsSchema, locationRefSchema, matchInvitationSchema, sendGuideSchema, updateClientSchema } from "@localpilot/contracts";
import { randomToken, sha256 } from "@localpilot/crypto";
import type { Client } from "@localpilot/db";
import {
  acceptInvitationAsNew,
  agencyConnection,
  autoConnectClient,
  connectToLocation,
  declineInvitation,
  ensureFolders,
  guideMessage,
  importLocations,
  listAccessibleLocations,
  listUnattachedLocations,
  matchInvitationManually,
  pollInvitations,
  syncManagedLocations,
  queueEmail,
  whatsappLink,
  isDemoClient,
} from "@localpilot/services";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ApiError, type AppContext } from "../context";
import { scopedClient } from "../guards";
import { createState } from "../oauth-state";
import { redirectUri } from "./google";

const idParams = z.object({ id: z.string().uuid() });
const SIGN_IN_TTL_MS = 15 * 60_000;

/** A per-route limit. Test runs call routes far faster than people, so they use the global (raised) limit. */
const perMinute = (ctx: AppContext, max: number) => ({ rateLimit: { max: ctx.env.APP_ENV === "test" ? ctx.env.RATE_LIMIT_MAX : max, timeWindow: "1 minute" } });

export function clientRoutes(ctx: AppContext) {
  const { db, deps } = ctx;

  async function guideFor(client: Client) {
    const connection = await agencyConnection(deps, client.workspaceId);
    const agencyEmail = connection?.googleAccountEmail ?? null;
    const { subject, text } = guideMessage({ businessName: client.name, agencyEmail });
    return { subject, text, agencyEmail, whatsappUrl: whatsappLink(client.contactPhone, text), channels: deps.messenger.available() };
  }

  /**
   * The agency account, or a clear reason there isn't one. An account that doesn't match
   * AGENCY_GOOGLE_EMAIL is inactive until confirmed; answering with an empty list hid that.
   */
  async function requireAgency(workspaceId: string) {
    const connection = await agencyConnection(deps, workspaceId);
    if (connection) return connection;
    const unconfirmed = await db.googleConnection.findFirst({ where: { workspaceId, source: "agency", status: "active" } });
    if (unconfirmed) {
      throw new ApiError(409, "agency_unconfirmed", `Confirm ${unconfirmed.googleAccountEmail} as your agency account first. It differs from AGENCY_GOOGLE_EMAIL, so it stays inactive until confirmed.`);
    }
    throw new ApiError(409, "no_connection", "Connect the agency Google account first");
  }

  async function scopedInvitation(request: FastifyRequest, id: string) {
    const invitation = await db.gbpInvitation.findFirst({ where: { id, workspaceId: request.auth.workspaceId } });
    if (!invitation) throw new ApiError(404, "invitation_not_found", "Invitation not found");
    return invitation;
  }

  return async (base: FastifyInstance) => {
    const app = base.withTypeProvider<ZodTypeProvider>();

    app.get("/clients", async (request) => {
      const clients = await db.client.findMany({
        where: { workspaceId: request.auth.workspaceId, status: { not: "removed" } },
        include: { stats: { select: { strengthScore: true, rating: true } } },
        orderBy: { name: "asc" },
      });
      return clients.map((client) => ({ ...client, demo: isDemoClient(client) }));
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
      return importLocations(deps, request.auth.workspaceId, { refs: request.body.locations, all: request.body.all });
    });

    // "Check now": invitations, waiting clients, and any business the agency account manages that isn't a client yet.
    app.post("/clients/check-invitations", { config: perMinute(ctx, 12) }, async (request) => {
      await requireAgency(request.auth.workspaceId);
      const summary = await pollInvitations(deps, request.auth.workspaceId);
      const { connected, imported } = await syncManagedLocations(deps, request.auth.workspaceId);
      return { ...summary, connected: summary.connected + connected, imported };
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
      return connectToLocation(deps, await scopedClient(ctx, request, request.params.id), request.body);
    });

    // Looks for the business in every connected Google account and in pending Manager invitations.
    app.post("/clients/:id/auto-connect", { schema: { params: idParams }, config: perMinute(ctx, 30) }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      return autoConnectClient(deps, client.id);
    });

    // Signs in with a Google account that already has Manager or Owner access to this business.
    app.post("/clients/:id/google-connect", { schema: { params: idParams }, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      const invite = await db.clientInvite.create({
        data: {
          workspaceId: client.workspaceId,
          clientId: client.id,
          contactEmail: client.contactEmail,
          tokenHash: sha256(randomToken()),
          expiresAt: new Date(Date.now() + SIGN_IN_TTL_MS),
        },
      });
      const { state, codeChallenge } = await createState(ctx, { purpose: "invite", workspaceId: client.workspaceId, userId: request.auth.userId, inviteId: invite.id });
      const url = await deps.gbp.authUrl({ state, redirectUri: redirectUri(ctx), codeChallenge, loginHint: client.contactEmail });
      return { url };
    });

    app.get("/locations", async (request) => {
      const connection = await requireAgency(request.auth.workspaceId);
      const [locations, clients] = await Promise.all([
        listAccessibleLocations(deps, connection),
        db.client.findMany({ where: { workspaceId: request.auth.workspaceId, gbpLocationId: { not: null }, status: { not: "removed" } }, select: { id: true, gbpLocationId: true } }),
      ]);
      const imported = new Map(clients.map((client) => [client.gbpLocationId, client.id]));
      return locations.map((location) => ({ ...location, clientId: imported.get(location.locationId) ?? null }));
    });

    app.get("/locations/unattached", async (request) => {
      await requireAgency(request.auth.workspaceId);
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

    app.post("/invitations/:id/accept-new", { schema: { params: idParams } }, async (request) => {
      const invitation = await scopedInvitation(request, request.params.id);
      await acceptInvitationAsNew(deps, invitation);
      return syncManagedLocations(deps, invitation.workspaceId);
    });

    app.post("/invitations/:id/decline", { schema: { params: idParams } }, async (request) => {
      await declineInvitation(deps, await scopedInvitation(request, request.params.id));
      return { ok: true };
    });
  };
}
