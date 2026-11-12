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

/** Google subjects the mock adapter hands out. A real Google subject is a long number. */
const MOCK_SUBJECT = /^mock-(agency-subject|client-\d+)$/;
const MOCK_LOCATION_PREFIX = "mock-loc-";
/** A sentence only the mock AI writes, so its drafts can be found without a flag. */
const MOCK_POST_SENTENCE = "because every visit is handled with care, clear advice and attention to detail";

export interface MockRemoval extends DemoRemoval {
  connections: number;
  clientsReset: number;
  simulatedJobs: number;
  mockPosts: number;
}

/**
 * Runs on every start with the real Google adapter, so nothing simulated survives the switch
 * away from mock mode. It removes the sample businesses, the fake Google connections, what the
 * mock "published", drafts the mock AI wrote, and reviews and metrics the mock invented.
 *
 * Clients someone typed in are kept, with their contact details, notes, library, knowledge base
 * and schedules. Ones the mock had connected go back to waiting, so they can be connected to the
 * real Business Profile. Safe to repeat: with nothing to remove it does nothing.
 */
export async function removeMockData(deps: Pick<Deps, "db" | "storage" | "logger">): Promise<MockRemoval> {
  const { db } = deps;
  const demo = await removeAllDemoData(deps);

  const connectionIds = (await db.googleConnection.findMany({ where: { googleSubject: { startsWith: "mock-" } }, select: { id: true, googleSubject: true } }))
    .filter((connection) => MOCK_SUBJECT.test(connection.googleSubject))
    .map((connection) => connection.id);
  const clientIds = (
    await db.client.findMany({
      where: { OR: [{ connectionId: { in: connectionIds } }, { gbpLocationId: { startsWith: MOCK_LOCATION_PREFIX } }] },
      select: { id: true },
    })
  ).map((client) => client.id);

  // Drafts the mock AI wrote that never went out: drop them, and their jobs get a real draft later.
  const mockDrafts = await db.post.findMany({ where: { gbpPostName: null, summary: { contains: MOCK_POST_SENTENCE } }, select: { id: true, jobId: true } });

  const [simulatedJobs, mockPosts] = await db.$transaction([
    // Jobs the mock adapter "published": nothing reached Google. Their posts and logs cascade.
    db.scheduledJob.deleteMany({ where: { simulated: true } }),
    db.post.deleteMany({ where: { id: { in: mockDrafts.map((post) => post.id) } } }),
    db.scheduledJob.updateMany({
      where: { id: { in: mockDrafts.map((post) => post.jobId) }, status: { in: ["scheduled", "awaiting_approval"] } },
      data: { status: "scheduled", attempts: 0, error: null },
    }),
    db.aiUsage.deleteMany({ where: { model: "mock" } }),
    // Data the mock invented for clients it had connected.
    db.review.deleteMany({ where: { clientId: { in: clientIds } } }),
    db.metricSnapshot.deleteMany({ where: { clientId: { in: clientIds } } }),
    db.locationStats.deleteMany({ where: { clientId: { in: clientIds } } }),
    db.notification.deleteMany({ where: { clientId: { in: clientIds } } }),
    db.gbpInvitation.deleteMany({ where: { OR: [{ matchedClientId: { in: clientIds } }, { connectionId: { in: connectionIds } }] } }),
    db.clientProfile.updateMany({ where: { clientId: { in: clientIds } }, data: { gbpSnapshot: {} } }),
    db.client.updateMany({
      where: { id: { in: clientIds } },
      data: { status: "invited", connectionId: null, gbpAccountId: null, gbpLocationId: null, matchMethod: null, connectedAt: null, accessLostAt: null },
    }),
    db.clientInvite.deleteMany({ where: { connectionId: { in: connectionIds } } }),
    db.googleConnection.deleteMany({ where: { id: { in: connectionIds } } }),
    db.mockGbpState.deleteMany({}),
  ]);

  return { ...demo, connections: connectionIds.length, clientsReset: clientIds.length, simulatedJobs: simulatedJobs.count, mockPosts: mockPosts.count };
}
