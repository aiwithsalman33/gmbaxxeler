import { matchInvitation, matchLocation, normalizeName, type PendingClient } from "@localpilot/core";
import type { Client, GbpInvitation, GoogleConnection, MatchMethod } from "@localpilot/db";
import { GbpError, type GbpInvitationItem, type GbpLocation } from "@localpilot/gbp";
import { bindClient, ConnectError, listAccessibleLocations } from "./connect";
import { agencyConnection, notify, PENDING_STATUSES, sessionFor, type Deps } from "./context";
import { markConnectionRevoked } from "./sync";

const ACCEPTABLE_ROLES = new Set(["MANAGER", "OWNER"]);

export interface PollSummary {
  skipped: boolean;
  seen: number;
  accepted: number;
  needsReview: number;
  connected: number;
}

function reviewReason(invitation: GbpInvitationItem): string | null {
  if (invitation.targetType !== "LOCATIONS_ONLY") return "Account-level invitation: review before accepting";
  if (!ACCEPTABLE_ROLES.has(invitation.role)) return `Role ${invitation.role} is not Manager or Owner`;
  return null;
}

function pendingClients(deps: Deps, workspaceId: string): Promise<Client[]> {
  return deps.db.client.findMany({ where: { workspaceId, status: { in: [...PENDING_STATUSES] } } });
}

async function storeInvitation(
  deps: Deps,
  connection: GoogleConnection,
  item: GbpInvitationItem,
): Promise<{ record: GbpInvitation; isNew: boolean }> {
  const where = { workspaceId_invitationName: { workspaceId: connection.workspaceId, invitationName: item.name } };
  const existing = await deps.db.gbpInvitation.findUnique({ where });
  if (existing) return { record: existing, isNew: false };
  const record = await deps.db.gbpInvitation.create({
    data: {
      workspaceId: connection.workspaceId,
      connectionId: connection.id,
      invitationName: item.name,
      accountId: item.accountId,
      targetType: item.targetType,
      role: item.role,
      locationName: item.locationName,
      address: item.address,
      placeId: item.placeId,
    },
  });
  return { record, isNew: true };
}

async function acceptAndRecord(
  deps: Deps,
  connection: GoogleConnection,
  invitation: GbpInvitation,
  clientId: string,
  score: number | null,
  reason: string,
): Promise<void> {
  await sessionFor(deps, connection).acceptInvitation(invitation.invitationName);
  await deps.db.gbpInvitation.update({
    where: { id: invitation.id },
    data: { status: "accepted", matchedClientId: clientId, matchScore: score, matchReason: reason, resolvedAt: new Date() },
  });
}

async function flagForReview(deps: Deps, invitation: GbpInvitation, reason: string, isNew: boolean, suggestedClientId: string | null = null): Promise<void> {
  await deps.db.gbpInvitation.update({ where: { id: invitation.id }, data: { status: "needs_review", matchReason: reason, suggestedClientId } });
  if (!isNew) return;
  await notify(deps, {
    workspaceId: invitation.workspaceId,
    type: "invitation.needs_review",
    severity: "warning",
    title: `Invitation needs review: ${invitation.locationName ?? "unknown location"}`,
    body: `${reason}. Match it to a client or decline it on the Clients page.`,
  });
}

function findInvitedLocation(invitation: GbpInvitation, locations: GbpLocation[]): GbpLocation | undefined {
  const byPlace = invitation.placeId ? locations.find((l) => l.placeId === invitation.placeId) : undefined;
  if (byPlace) return byPlace;
  const name = normalizeName(invitation.locationName ?? "");
  const byName = locations.filter((l) => normalizeName(l.title) === name);
  return byName.length === 1 ? byName[0] : undefined;
}

async function handleInvitations(
  deps: Deps,
  connection: GoogleConnection,
  summary: PollSummary,
): Promise<void> {
  const session = sessionFor(deps, connection);
  const pool: PendingClient[] = await pendingClients(deps, connection.workspaceId);
  const seen = new Set<string>();

  for (const account of await session.listAccounts()) {
    for (const item of await session.listInvitations(account.accountId)) {
      seen.add(item.name);
      summary.seen++;
      const { record, isNew } = await storeInvitation(deps, connection, item);
      if (record.status === "accepted" || record.status === "declined") continue;

      const blocked = reviewReason(item);
      if (blocked) {
        await flagForReview(deps, record, blocked, isNew);
        summary.needsReview++;
        continue;
      }
      const match = matchInvitation(item, pool);
      if (match.kind !== "match") {
        await flagForReview(deps, record, match.reason, isNew, match.kind === "suggest" ? match.clientId : null);
        summary.needsReview++;
        continue;
      }
      await acceptAndRecord(deps, connection, record, match.clientId, match.score, match.reason);
      // A client takes one location. A second invitation for it goes to review.
      pool.splice(pool.findIndex((client) => client.id === match.clientId), 1);
      summary.accepted++;
    }
  }

  // Invitations the client withdrew on Google's side.
  await deps.db.gbpInvitation.updateMany({
    where: {
      workspaceId: connection.workspaceId,
      status: { in: ["pending", "needs_review"] },
      invitationName: { notIn: [...seen] },
    },
    data: { status: "declined", matchReason: "Withdrawn on Google", resolvedAt: new Date() },
  });
}

async function bindLocations(deps: Deps, connection: GoogleConnection, summary: PollSummary): Promise<void> {
  const { workspaceId } = connection;
  const pending = await pendingClients(deps, workspaceId);
  const lost = await deps.db.client.findMany({ where: { workspaceId, status: "access_removed" } });
  if (pending.length === 0 && lost.length === 0) return;

  const locations = await listAccessibleLocations(deps, connection);
  const attached = await deps.db.client.findMany({
    where: { workspaceId, status: { notIn: ["removed", "access_removed"] }, gbpLocationId: { not: null } },
    select: { gbpLocationId: true },
  });
  const taken = new Set(attached.map((client) => client.gbpLocationId));
  const free = () => locations.filter((location) => !taken.has(location.locationId));

  const bind = async (client: Client, location: GbpLocation, method: MatchMethod) => {
    await bindClient(deps, { client, connection, location, method });
    taken.add(location.locationId);
    summary.connected++;
  };

  for (const client of lost) {
    const restored = free().find((location) => location.locationId === client.gbpLocationId);
    if (restored) await bind(client, restored, client.matchMethod ?? "manual");
  }

  // Google can take a while to list a location after accept, so unbound
  // invitations are finished here on whichever poll first sees the location.
  const accepted = await deps.db.gbpInvitation.findMany({
    where: { workspaceId, status: "accepted", client: { status: { in: [...PENDING_STATUSES] } } },
    include: { client: true },
  });
  for (const invitation of accepted) {
    const location = findInvitedLocation(invitation, free());
    if (location && invitation.client) await bind(invitation.client, location, "auto_name");
  }

  const reserved = new Set(accepted.map((invitation) => invitation.matchedClientId));
  const remaining = (await pendingClients(deps, workspaceId)).filter((client) => !reserved.has(client.id));
  for (const location of free()) {
    const pool = remaining.filter((client) => client.status !== "connected");
    const match = matchLocation(location, pool);
    if (match.kind !== "match") continue;
    const client = pool.find((candidate) => candidate.id === match.clientId)!;
    await bind(client, location, match.method);
    client.status = "connected";
  }
}

/** One poll for one workspace. Safe to run repeatedly. */
export async function pollInvitations(deps: Deps, workspaceId: string): Promise<PollSummary> {
  const summary: PollSummary = { skipped: false, seen: 0, accepted: 0, needsReview: 0, connected: 0 };
  const connection = await agencyConnection(deps, workspaceId);
  if (!connection) return { ...summary, skipped: true };
  try {
    await handleInvitations(deps, connection, summary);
    await bindLocations(deps, connection, summary);
  } catch (error) {
    if (error instanceof GbpError && error.kind === "auth_revoked") {
      await markConnectionRevoked(deps, connection.id);
      return summary;
    }
    throw error;
  }
  return summary;
}

export async function pollAllWorkspaces(deps: Deps): Promise<void> {
  const connections = await deps.db.googleConnection.findMany({
    where: { source: "agency", status: "active" },
    select: { workspaceId: true },
  });
  for (const { workspaceId } of connections) {
    try {
      await pollInvitations(deps, workspaceId);
    } catch (error) {
      deps.logger.error({ workspaceId, err: error instanceof Error ? error.message : "unknown" }, "invitation poll failed");
    }
  }
}

/** Manual match: phone can't be checked before accept, so the admin decides. */
export async function matchInvitationManually(deps: Deps, invitation: GbpInvitation, client: Client): Promise<PollSummary> {
  if (!(PENDING_STATUSES as readonly string[]).includes(client.status)) {
    throw new ConnectError("not_pending", "This client is not waiting for access");
  }
  const connection = await agencyConnection(deps, invitation.workspaceId);
  if (!connection) throw new ConnectError("no_connection", "Connect the agency Google account first");
  await acceptAndRecord(deps, connection, invitation, client.id, null, "Matched manually");
  return pollInvitations(deps, invitation.workspaceId);
}

export async function declineInvitation(deps: Deps, invitation: GbpInvitation): Promise<void> {
  const connection = await agencyConnection(deps, invitation.workspaceId);
  if (!connection) throw new ConnectError("no_connection", "Connect the agency Google account first");
  await sessionFor(deps, connection).declineInvitation(invitation.invitationName);
  await deps.db.gbpInvitation.update({
    where: { id: invitation.id },
    data: { status: "declined", resolvedAt: new Date() },
  });
}

/**
 * Accepts an invitation that matches no waiting client, such as a business inviting the agency
 * directly. The location, or every location of an account-level invite, then becomes reachable
 * and is added as a client by the next import.
 */
export async function acceptInvitationAsNew(deps: Deps, invitation: GbpInvitation): Promise<void> {
  const connection = await agencyConnection(deps, invitation.workspaceId);
  if (!connection) throw new ConnectError("no_connection", "Connect the agency Google account first");
  await sessionFor(deps, connection).acceptInvitation(invitation.invitationName);
  await deps.db.gbpInvitation.update({
    where: { id: invitation.id },
    data: { status: "accepted", matchReason: "Accepted as a new client", resolvedAt: new Date() },
  });
}
