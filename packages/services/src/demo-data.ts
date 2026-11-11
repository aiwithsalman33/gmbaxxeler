import { isSampleLocationId, removeSampleFromMockState, sampleLocationIds } from "@localpilot/gbp";
import type { Deps } from "./context";

export interface DemoSummary {
  clients: { id: string; name: string }[];
}

export interface DemoRemoval {
  clients: number;
  images: number;
  mockLocations: number;
}

export const isDemoClient = (client: { gbpLocationId: string | null }): boolean => isSampleLocationId(client.gbpLocationId);

export async function findDemoClients(deps: Pick<Deps, "db">, workspaceId: string): Promise<DemoSummary> {
  const clients = await deps.db.client.findMany({
    where: { workspaceId, gbpLocationId: { in: sampleLocationIds() } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return { clients };
}

/**
 * Deletes the built-in demo businesses and everything that hangs off them. Clients cascade to
 * their jobs, logs, images, posts, reviews and metrics; notifications, audit rows and invitations
 * only reference a client loosely, so they are removed explicitly. Real clients are never touched,
 * because demo clients are identified by their fixed mock location IDs, not by name.
 */
export async function removeDemoData(deps: Pick<Deps, "db" | "storage" | "logger">, workspaceId: string): Promise<DemoRemoval> {
  const { db } = deps;
  const { clients } = await findDemoClients(deps, workspaceId);
  const ids = clients.map((c) => c.id);
  let keys: string[] = [];

  if (ids.length) {
    keys = (await db.libraryImage.findMany({ where: { clientId: { in: ids } }, select: { storageKey: true } })).map((i) => i.storageKey);
    await db.$transaction([
      db.notification.deleteMany({ where: { workspaceId, clientId: { in: ids } } }),
      db.auditLog.deleteMany({ where: { workspaceId, clientId: { in: ids } } }),
      db.gbpInvitation.deleteMany({ where: { workspaceId, matchedClientId: { in: ids } } }),
      db.client.deleteMany({ where: { workspaceId, id: { in: ids } } }),
    ]);
  }

  // Files go after the rows commit; a leftover object is harmless, a row pointing at nothing is not.
  for (const key of keys) {
    await deps.storage.remove(key).catch(() => deps.logger.warn({ workspaceId }, "demo image file could not be removed"));
  }
  const mockLocations = await removeSampleFromMockState(db, workspaceId);
  return { clients: ids.length, images: keys.length, mockLocations };
}

/** Runs on every production start. Safe to repeat: with nothing to remove it does nothing. */
export async function removeAllDemoData(deps: Pick<Deps, "db" | "storage" | "logger">): Promise<DemoRemoval> {
  const total: DemoRemoval = { clients: 0, images: 0, mockLocations: 0 };
  const workspaces = await deps.db.workspace.findMany({ select: { id: true } });
  for (const { id } of workspaces) {
    const result = await removeDemoData(deps, id);
    total.clients += result.clients;
    total.images += result.images;
    total.mockLocations += result.mockLocations;
  }
  return total;
}
