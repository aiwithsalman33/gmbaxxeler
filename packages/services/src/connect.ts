import type { Client, FolderKind, GoogleConnection, MatchMethod } from "@localpilot/db";
import { matchLocation } from "@localpilot/core";
import type { GbpLocation } from "@localpilot/gbp";
import { notify, PENDING_STATUSES, sessionFor, agencyConnection, type Deps } from "./context";
import { syncClient } from "./sync";

const FOLDER_KINDS: FolderKind[] = ["photos", "seo_images"];

export async function ensureFolders(deps: Deps, client: Pick<Client, "id" | "workspaceId">): Promise<void> {
  await deps.db.libraryFolder.createMany({
    data: FOLDER_KINDS.map((kind) => ({ workspaceId: client.workspaceId, clientId: client.id, kind })),
    skipDuplicates: true,
  });
}

/** Attaches a Google location to a client and pulls its first data. */
export async function bindClient(
  deps: Deps,
  input: { client: Client; connection: GoogleConnection; location: GbpLocation; method: MatchMethod },
): Promise<Client> {
  const { client, connection, location, method } = input;
  const bound = await deps.db.client.update({
    where: { id: client.id },
    data: {
      status: "connected",
      connectionId: connection.id,
      gbpAccountId: location.accountId,
      gbpLocationId: location.locationId,
      matchMethod: method,
      connectedAt: new Date(),
      accessLostAt: null,
    },
  });
  await ensureFolders(deps, bound);
  await syncClient(deps, bound.id);
  await deps.db.auditLog.create({
    data: {
      workspaceId: client.workspaceId,
      clientId: client.id,
      action: "client.connected",
      entity: "client",
      entityId: client.id,
      meta: { method },
    },
  });
  await notify(deps, {
    workspaceId: client.workspaceId,
    clientId: client.id,
    type: "client.connected",
    title: `${bound.name} is connected`,
    body: `Connected to "${location.title}" (${method.replace("_", " ")}).`,
  });
  return bound;
}

export async function listAccessibleLocations(deps: Deps, connection: GoogleConnection): Promise<GbpLocation[]> {
  const session = sessionFor(deps, connection);
  const accounts = await session.listAccounts();
  const lists = await Promise.all(accounts.map((account) => session.listLocations(account.accountId)));
  return lists.flat();
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
    const matched = free.find((location) => matchLocation(location, [target]).kind === "match");
    const location = matched ?? (free.length === 1 ? free[0] : undefined);
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

export async function importLocations(
  deps: Deps,
  workspaceId: string,
  refs: { accountId: string; locationId: string }[],
): Promise<Client[]> {
  const imported: Client[] = [];
  for (const ref of refs) {
    const { connection, location } = await requireLocation(deps, workspaceId, ref);
    const removed = await deps.db.client.findFirst({ where: { workspaceId, gbpLocationId: location.locationId } });
    const client =
      removed ??
      (await deps.db.client.create({
        data: { workspaceId, name: location.title, status: "connected", connectionId: connection.id, address: location.address },
      }));
    imported.push(await bindClient(deps, { client, connection, location, method: "import" }));
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
