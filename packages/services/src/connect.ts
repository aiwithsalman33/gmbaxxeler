import type { Client, FolderKind, GoogleConnection, MatchMethod } from "@localpilot/db";
import { normalizeName } from "@localpilot/core";
import { GbpError, type GbpLocation } from "@localpilot/gbp";
import { notify, PENDING_STATUSES, sessionFor, agencyConnection, type Deps } from "./context";
import { syncClient } from "./sync";

const FOLDER_KINDS: FolderKind[] = ["photos", "seo_images"];

export async function ensureFolders(deps: Deps, client: Pick<Client, "id" | "workspaceId">): Promise<void> {
  await deps.db.libraryFolder.createMany({
    data: FOLDER_KINDS.map((kind) => ({ workspaceId: client.workspaceId, clientId: client.id, kind })),
    skipDuplicates: true,
  });
}

/** Pulls first data and tells the admin. Runs in the background for bulk imports. */
export async function finishConnect(deps: Deps, clientId: string): Promise<void> {
  const client = await deps.db.client.findUniqueOrThrow({ where: { id: clientId } });
  await ensureFolders(deps, client);
  await syncClient(deps, client.id);
  await deps.db.auditLog.create({
    data: { workspaceId: client.workspaceId, clientId: client.id, action: "client.connected", entity: "client", entityId: client.id, meta: { method: client.matchMethod } },
  });
  await notify(deps, {
    workspaceId: client.workspaceId,
    clientId: client.id,
    type: "client.connected",
    title: `${client.name} is connected`,
    body: `Connected through ${(client.matchMethod ?? "manual").replace("_", " ")}. Next, fill in the knowledge base.`,
  });
}

function attachData(connection: GoogleConnection, location: GbpLocation, method: MatchMethod) {
  return {
    status: "connected" as const,
    connectionId: connection.id,
    gbpAccountId: location.accountId,
    gbpLocationId: location.locationId,
    matchMethod: method,
    connectedAt: new Date(),
    accessLostAt: null,
  };
}

/** Attaches a Google location to a client and pulls its first data. */
export async function bindClient(
  deps: Deps,
  input: { client: Client; connection: GoogleConnection; location: GbpLocation; method: MatchMethod },
): Promise<Client> {
  const { client, connection, location, method } = input;
  await deps.db.client.update({ where: { id: client.id }, data: attachData(connection, location, method) });
  await finishConnect(deps, client.id);
  return deps.db.client.findUniqueOrThrow({ where: { id: client.id } });
}

export async function scanLocations(deps: Deps, connection: GoogleConnection): Promise<{ accounts: number; locations: GbpLocation[] }> {
  const session = sessionFor(deps, connection);
  try {
    const accounts = await session.listAccounts();
    const lists = await Promise.all(
      accounts.map(async (account) => (await session.listLocations(account.accountId)).map((location) => ({ ...location, accountName: account.name }))),
    );
    const locations = lists.flat();
    deps.logger.info({ accounts: accounts.length, locations: locations.length }, "google locations listed");
    await deps.db.googleConnection.update({ where: { id: connection.id }, data: { accountsCount: accounts.length, locationsCount: locations.length, lastSyncedAt: new Date(), lastError: null } });
    await recordApiAccess(deps, "approved");
    return { accounts: accounts.length, locations };
  } catch (error) {
    if (error instanceof GbpError && error.kind === "quota_zero") {
      deps.logger.warn({ connectionId: connection.id }, "business profile api quota is zero");
      await recordApiAccess(deps, "not_approved");
    }
    // Shown on the Clients page and in Settings > Google, so a failed scan is never silent.
    if (error instanceof GbpError) {
      await deps.db.googleConnection.update({ where: { id: connection.id }, data: { lastError: error.message } }).catch(() => undefined);
    }
    throw error;
  }
}

export async function recordApiAccess(deps: Deps, apiAccess: string): Promise<void> {
  if (deps.gbp.name === "mock") return;
  await deps.db.appSettings.upsert({ where: { id: 1 }, create: { id: 1, apiAccess }, update: { apiAccess } });
}

export async function listAccessibleLocations(deps: Deps, connection: GoogleConnection): Promise<GbpLocation[]> {
  return (await scanLocations(deps, connection)).locations;
}

export async function listUnattachedLocations(deps: Deps, workspaceId: string): Promise<GbpLocation[]> {
  const connection = await agencyConnection(deps, workspaceId);
  if (!connection) return [];
  const [locations, attached] = await Promise.all([
    listAccessibleLocations(deps, connection),
    deps.db.client.findMany({
      where: { workspaceId, gbpLocationId: { not: null }, status: { not: "removed" } },
      select: { gbpLocationId: true },
    }),
  ]);
  const taken = new Set(attached.map((client) => client.gbpLocationId));
  return locations.filter((location) => !taken.has(location.locationId));
}

/** After a reconnect: clients come back if the account can still see their location. */
export async function reattachClients(deps: Deps, connection: GoogleConnection): Promise<void> {
  const stranded = await deps.db.client.findMany({
    where: { workspaceId: connection.workspaceId, status: "reconnect_required" },
  });
  if (stranded.length === 0) return;
  const visible = new Set((await listAccessibleLocations(deps, connection)).map((l) => l.locationId));
  for (const client of stranded) {
    const reachable = client.gbpLocationId !== null && visible.has(client.gbpLocationId);
    await deps.db.client.update({
      where: { id: client.id },
      data: reachable
        ? { status: "connected", connectionId: connection.id }
        : { status: "access_removed", accessLostAt: new Date() },
    });
  }
}

/** Fallback flow. Without a target client, every location becomes a new client. */
export async function attachInviteLocations(deps: Deps, connection: GoogleConnection, clientId: string | null): Promise<void> {
  const locations = await listAccessibleLocations(deps, connection);
  const attached = await deps.db.client.findMany({
    where: { workspaceId: connection.workspaceId, gbpLocationId: { in: locations.map((l) => l.locationId) } },
    select: { gbpLocationId: true },
  });
  const taken = new Set(attached.map((client) => client.gbpLocationId));
  const free = locations.filter((location) => !taken.has(location.locationId));

  const target = clientId ? await deps.db.client.findUnique({ where: { id: clientId } }) : null;
  if (target) {
    // The client signed in themselves, so the business name is enough here.
    const named = free.find((location) => normalizeName(location.title) === normalizeName(target.name));
    const location = named ?? (free.length === 1 ? free[0] : undefined);
    if (location) await bindClient(deps, { client: target, connection, location, method: "oauth" });
    return;
  }
  for (const location of free) {
    const client = await deps.db.client.create({
      data: { workspaceId: connection.workspaceId, name: location.title, status: "connected", connectionId: connection.id, address: location.address },
    });
    await bindClient(deps, { client, connection, location, method: "oauth" });
  }
}

export class ConnectError extends Error {
  constructor(
    public readonly code: "no_connection" | "location_not_found" | "not_pending",
    message: string,
  ) {
    super(message);
  }
}

async function requireLocation(deps: Deps, workspaceId: string, ref: { accountId: string; locationId: string }) {
  const connection = await agencyConnection(deps, workspaceId);
  if (!connection) throw new ConnectError("no_connection", "Connect the agency Google account first");
  const location = (await listUnattachedLocations(deps, workspaceId)).find(
    (l) => l.accountId === ref.accountId && l.locationId === ref.locationId,
  );
  if (!location) throw new ConnectError("location_not_found", "That location is not available to attach");
  return { connection, location };
}

/** Creates clients at once. Their first sync runs in the background. */
export async function importLocations(
  deps: Deps,
  workspaceId: string,
  selection: { refs?: { accountId: string; locationId: string }[]; all?: boolean },
): Promise<Client[]> {
  const connection = await agencyConnection(deps, workspaceId);
  if (!connection) throw new ConnectError("no_connection", "Connect the agency Google account first");
  const available = await listUnattachedLocations(deps, workspaceId);
  const wanted = selection.all
    ? available
    : (selection.refs ?? []).map((ref) => {
        const found = available.find((l) => l.accountId === ref.accountId && l.locationId === ref.locationId);
        if (!found) throw new ConnectError("location_not_found", "That location is not available to attach");
        return found;
      });

  const imported: Client[] = [];
  for (const location of wanted) {
    const previous = await deps.db.client.findFirst({ where: { workspaceId, gbpLocationId: location.locationId } });
    const data = attachData(connection, location, "import");
    const client = previous
      ? await deps.db.client.update({ where: { id: previous.id }, data })
      : await deps.db.client.create({ data: { workspaceId, name: location.title, address: location.address, contactPhone: location.phone, ...data } });
    await deps.enqueueConnect(client.id);
    imported.push(client);
  }
  return imported;
}

export async function matchLocationManually(
  deps: Deps,
  client: Client,
  ref: { accountId: string; locationId: string },
): Promise<Client> {
  if (!(PENDING_STATUSES as readonly string[]).includes(client.status) && client.status !== "access_removed") {
    throw new ConnectError("not_pending", "This client is already connected");
  }
  const { connection, location } = await requireLocation(deps, client.workspaceId, ref);
  return bindClient(deps, { client, connection, location, method: "manual" });
}
