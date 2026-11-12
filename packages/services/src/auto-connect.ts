import { normalizeName, normalizePhone, similarity } from "@localpilot/core";
import type { Client, GoogleConnection, MatchMethod } from "@localpilot/db";
import { GbpError, type GbpLocation } from "@localpilot/gbp";
import { bindClient, ConnectError, listAccessibleLocations } from "./connect";
import { agencyConnection, PENDING_STATUSES, type Deps } from "./context";
import { pollInvitations } from "./invitations";

/** Close enough to offer as a one-click choice, never enough to connect alone. */
const SUGGEST_THRESHOLD = 0.6;
const MAX_CANDIDATES = 5;

export interface ReachableLocation {
  connection: GoogleConnection;
  location: GbpLocation;
}

export interface LocationCandidate extends GbpLocation {
  googleAccountEmail: string;
}

export type AutoConnectResult =
  | { status: "connected"; client: Client; locationTitle: string | null; googleAccountEmail: string | null }
  | { status: "choose"; client: Client; candidates: LocationCandidate[] }
  | {
      status: "waiting";
      client: Client;
      reason: "no_agency" | "not_found" | "google_error";
      message: string | null;
      agencyEmail: string | null;
      /** The client's Gmail is not one we can see yet, so signing in with it may connect. */
      canSignInAs: string | null;
    };

/**
 * Every business the workspace can reach right now: through the agency account
 * and through any Manager account someone signed in with. Locations already
 * attached to a client are left out, and the agency account wins a tie.
 */
export async function reachableLocations(deps: Deps, workspaceId: string): Promise<ReachableLocation[]> {
  const agency = await agencyConnection(deps, workspaceId);
  const others = await deps.db.googleConnection.findMany({
    where: { workspaceId, source: "invite", status: "active" },
    orderBy: { createdAt: "asc" },
  });
  const connections = [...(agency ? [agency] : []), ...others];

  const attached = await deps.db.client.findMany({
    where: { workspaceId, gbpLocationId: { not: null }, status: { notIn: ["removed", "access_removed"] } },
    select: { gbpLocationId: true },
  });
  const taken = new Set(attached.map((client) => client.gbpLocationId));

  const reachable: ReachableLocation[] = [];
  for (const connection of connections) {
    let locations: GbpLocation[];
    try {
      locations = await listAccessibleLocations(deps, connection);
    } catch (error) {
      // The agency account failing is the caller's problem; a side account failing is not.
      if (connection.id === agency?.id) throw error;
      deps.logger.warn({ connectionId: connection.id, err: error instanceof Error ? error.message : "unknown" }, "manager account scan failed");
      continue;
    }
    for (const location of locations) {
      if (taken.has(location.locationId)) continue;
      taken.add(location.locationId);
      reachable.push({ connection, location });
    }
  }
  return reachable;
}

type LocationPick = { kind: "bind"; target: ReachableLocation; method: MatchMethod } | { kind: "choose"; targets: ReachableLocation[] } | { kind: "none" };

/** An equal phone or an equal business name is certain. A similar name is only a suggestion. */
export function pickLocation(client: Pick<Client, "name" | "contactPhone">, reachable: ReachableLocation[]): LocationPick {
  const phone = client.contactPhone ? normalizePhone(client.contactPhone) : "";
  if (phone.length >= 6) {
    const byPhone = reachable.filter(({ location }) => location.phone && normalizePhone(location.phone) === phone);
    if (byPhone.length === 1) return { kind: "bind", target: byPhone[0]!, method: "auto_phone" };
    if (byPhone.length > 1) return { kind: "choose", targets: byPhone };
  }

  const name = normalizeName(client.name);
  const exact = reachable.filter(({ location }) => normalizeName(location.title) === name);
  if (exact.length === 1) return { kind: "bind", target: exact[0]!, method: "auto_name" };
  if (exact.length > 1) return { kind: "choose", targets: exact };

  const close = reachable
    .map((item) => ({ item, score: similarity(normalizeName(item.location.title), name) }))
    .filter(({ score }) => score >= SUGGEST_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)
    .map(({ item }) => item);
  return close.length > 0 ? { kind: "choose", targets: close } : { kind: "none" };
}

/**
 * Connects every waiting client whose business is now reachable by an equal phone or name.
 * Runs after a Google account is connected and on each invitation poll. Close names are left
 * for the admin to pick, so nothing uncertain connects by itself.
 */
export async function autoConnectPending(deps: Deps, workspaceId: string): Promise<number> {
  const waiting = await deps.db.client.findMany({ where: { workspaceId, status: { in: [...PENDING_STATUSES] } }, orderBy: { createdAt: "asc" } });
  if (waiting.length === 0) return 0;
  let reachable = await reachableLocations(deps, workspaceId);
  let connected = 0;
  for (const client of waiting) {
    const pick = pickLocation(client, reachable);
    if (pick.kind !== "bind") continue;
    await bindClient(deps, { client, connection: pick.target.connection, location: pick.target.location, method: pick.method });
    reachable = reachable.filter((item) => item.location.locationId !== pick.target.location.locationId);
    connected++;
  }
  return connected;
}

export async function autoConnectAllWorkspaces(deps: Deps): Promise<void> {
  const workspaces = await deps.db.googleConnection.findMany({ where: { status: "active" }, select: { workspaceId: true }, distinct: ["workspaceId"] });
  for (const { workspaceId } of workspaces) {
    try {
      await syncManagedLocations(deps, workspaceId);
    } catch (error) {
      deps.logger.error({ workspaceId, err: error instanceof Error ? error.message : "unknown" }, "auto connect failed");
    }
  }
}

/** The admin picked one of the offered businesses. */
export async function connectToLocation(deps: Deps, client: Client, ref: { accountId: string; locationId: string }): Promise<Client> {
  if (!isPending(client)) throw new ConnectError("not_pending", "This client is already connected");
  const reachable = await reachableLocations(deps, client.workspaceId);
  const target = reachable.find(({ location }) => location.accountId === ref.accountId && location.locationId === ref.locationId);
  if (!target) throw new ConnectError("location_not_found", "That location is not available to attach");
  return bindClient(deps, { client, connection: target.connection, location: target.location, method: "manual" });
}

function isPending(client: Client): boolean {
  return (PENDING_STATUSES as readonly string[]).includes(client.status) || client.status === "access_removed";
}

function candidate({ connection, location }: ReachableLocation): LocationCandidate {
  return { ...location, googleAccountEmail: connection.googleAccountEmail };
}

/**
 * Runs right after a client is added, from Check & connect, and after someone
 * signs in with a Manager account. Connects the client when the business is
 * already reachable, accepts a matching Manager invitation, and otherwise says
 * what is still needed.
 */
export async function autoConnectClient(deps: Deps, clientId: string): Promise<AutoConnectResult> {
  let client = await deps.db.client.findUniqueOrThrow({ where: { id: clientId } });
  const agency = await agencyConnection(deps, client.workspaceId);
  const agencyEmail = agency?.googleAccountEmail ?? null;

  const connectedResult = async (current: Client, locationTitle: string | null = null): Promise<AutoConnectResult> => {
    const connection = current.connectionId ? await deps.db.googleConnection.findUnique({ where: { id: current.connectionId } }) : null;
    return { status: "connected", client: current, locationTitle, googleAccountEmail: connection?.googleAccountEmail ?? null };
  };

  if (!isPending(client)) return connectedResult(client);

  const knownEmails = new Set(
    (await deps.db.googleConnection.findMany({ where: { workspaceId: client.workspaceId, status: "active" }, select: { googleAccountEmail: true } })).map((c) =>
      c.googleAccountEmail.toLowerCase(),
    ),
  );
  const email = client.contactEmail?.toLowerCase() ?? null;
  const canSignInAs = email && !knownEmails.has(email) ? client.contactEmail : null;
  const waiting = (reason: "no_agency" | "not_found" | "google_error", message: string | null = null): AutoConnectResult => ({
    status: "waiting",
    client,
    reason,
    message,
    agencyEmail,
    canSignInAs,
  });

  try {
    const pick = pickLocation(client, await reachableLocations(deps, client.workspaceId));
    if (pick.kind === "bind") {
      const bound = await bindClient(deps, { client, connection: pick.target.connection, location: pick.target.location, method: pick.method });
      return connectedResult(bound, pick.target.location.title);
    }

    // The client may have sent a Manager invitation already.
    if (agency && client.status !== "access_removed") {
      await pollInvitations(deps, client.workspaceId);
      client = await deps.db.client.findUniqueOrThrow({ where: { id: clientId } });
      if (client.status === "connected") return connectedResult(client);
    }

    if (pick.kind === "choose") return { status: "choose", client, candidates: pick.targets.map(candidate) };
    return waiting(agency || knownEmails.size > 0 ? "not_found" : "no_agency");
  } catch (error) {
    if (error instanceof GbpError) {
      deps.logger.warn({ clientId, kind: error.kind }, "auto connect could not reach google");
      return waiting("google_error", error.message);
    }
    throw error;
  }
}

/**
 * Brings in every business the agency account manages that has never been a client, so the
 * Clients page shows them without picking each one. Skipped: locations someone removed (they
 * keep their client row), and ones a waiting client could still be matched to by name.
 * The first sync of each runs in the background, filling address, phone, stats and metrics.
 */
export async function autoImportLocations(deps: Deps, workspaceId: string): Promise<Client[]> {
  if (!deps.autoImport) return [];
  const connection = await agencyConnection(deps, workspaceId);
  if (!connection) return [];
  const locations = await listAccessibleLocations(deps, connection);
  const known = new Set(
    (await deps.db.client.findMany({ where: { workspaceId, gbpLocationId: { not: null } }, select: { gbpLocationId: true } })).map((client) => client.gbpLocationId),
  );
  const fresh = locations.filter((location) => !known.has(location.locationId));
  if (fresh.length === 0) return [];

  const waiting = await deps.db.client.findMany({ where: { workspaceId, status: { in: [...PENDING_STATUSES] } } });
  const reserved = new Set<string>();
  const candidates = fresh.map((location) => ({ connection, location }));
  for (const client of waiting) {
    const pick = pickLocation(client, candidates);
    if (pick.kind === "choose") pick.targets.forEach((target) => reserved.add(target.location.locationId));
  }

  const imported: Client[] = [];
  for (const location of fresh) {
    if (reserved.has(location.locationId)) continue;
    const client = await deps.db.client.create({
      data: {
        workspaceId,
        name: location.title,
        address: location.address,
        contactPhone: location.phone,
        status: "connected",
        connectionId: connection.id,
        gbpAccountId: location.accountId,
        gbpLocationId: location.locationId,
        matchMethod: "import",
        connectedAt: new Date(),
      },
    });
    await deps.enqueueConnect(client.id);
    imported.push(client);
  }
  if (imported.length) deps.logger.info({ workspaceId, imported: imported.length }, "imported managed locations");
  return imported;
}

/** Waiting clients first (they may own a location), then everything else the account manages. */
export async function syncManagedLocations(deps: Deps, workspaceId: string): Promise<{ connected: number; imported: number }> {
  const connected = await autoConnectPending(deps, workspaceId);
  const imported = (await autoImportLocations(deps, workspaceId)).length;
  return { connected, imported };
}
