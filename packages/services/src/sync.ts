import { addDays, computeProfileStrength, isoDate } from "@localpilot/core";
import type { Client, GoogleConnection, Prisma } from "@localpilot/db";
import { GbpError, type GbpLocation, type GbpSession } from "@localpilot/gbp";
import { notify, sessionFor, type Deps } from "./context";

const INITIAL_METRIC_DAYS = 180;
const NIGHTLY_METRIC_DAYS = 14;

/** Records what a Google failure means for the client. Other errors are left to retry. */
export async function applyGbpFailure(deps: Deps, client: Client, error: unknown): Promise<boolean> {
  if (!(error instanceof GbpError)) return false;
  if (error.kind === "access_denied" || error.kind === "not_found") {
    if (client.status === "access_removed") return true;
    await deps.db.client.update({
      where: { id: client.id },
      data: { status: "access_removed", accessLostAt: new Date() },
    });
    await notify(deps, {
      workspaceId: client.workspaceId,
      clientId: client.id,
      type: "client.access_removed",
      severity: "critical",
      title: `Lost access to ${client.name}`,
      body: "Google denied access to this location. Ask the client to add the agency as Manager again.",
    });
    return true;
  }
  if (error.kind === "auth_revoked" && client.connectionId) {
    await markConnectionRevoked(deps, client.connectionId);
    return true;
  }
  return false;
}

export async function markConnectionRevoked(deps: Deps, connectionId: string): Promise<void> {
  const connection = await deps.db.googleConnection.findUnique({ where: { id: connectionId } });
  if (!connection || connection.status !== "active") return;
  await deps.db.googleConnection.update({
    where: { id: connectionId },
    data: { status: "error", lastError: "Google access was revoked or expired", accessTokenEnc: null, accessTokenExpiresAt: null },
  });
  await deps.db.client.updateMany({ where: { connectionId, status: "connected" }, data: { status: "reconnect_required" } });
  await notify(deps, {
    workspaceId: connection.workspaceId,
    type: "google.reconnect_required",
    severity: "critical",
    title: "Reconnect your Google account",
    body: `Access for ${connection.googleAccountEmail} was revoked or expired. Reconnect it in Settings > Google.`,
  });
}

/** Catches revoked access even on days nothing else calls Google. */
export async function checkConnections(deps: Deps): Promise<void> {
  const connections = await deps.db.googleConnection.findMany({ where: { status: "active", refreshTokenEnc: { not: null } } });
  for (const connection of connections) {
    try {
      await sessionFor(deps, connection).listAccounts();
    } catch (error) {
      if (error instanceof GbpError && error.kind === "auth_revoked") await markConnectionRevoked(deps, connection.id);
      else deps.logger.warn({ connectionId: connection.id, err: error instanceof Error ? error.message : "unknown" }, "connection check failed");
    }
  }
}

async function storeLocation(deps: Deps, client: Client, session: GbpSession, location: GbpLocation): Promise<void> {
  const stats = await session.getStats(location.accountId, location.locationId);
  const { score, checklist } = computeProfileStrength({
    categories: location.categories.length,
    description: location.description,
    hasHours: location.hasHours,
    services: location.services.length,
    photoCount: stats.photoCount,
    lastPostAt: stats.lastPostAt,
    reviewReplyRate: stats.reviewReplyRate,
    website: location.website,
    attributes: location.attributes,
  });
  const snapshot = location as unknown as Prisma.InputJsonValue;
  const statsData = {
    rating: stats.rating,
    reviewCount: stats.reviewCount,
    photoCount: stats.photoCount,
    lastPostAt: stats.lastPostAt,
    strengthScore: score,
    checklist: checklist as unknown as Prisma.InputJsonValue,
    syncedAt: new Date(),
  };
  await deps.db.$transaction([
    deps.db.clientProfile.upsert({
      where: { clientId: client.id },
      create: { clientId: client.id, gbpSnapshot: snapshot },
      update: { gbpSnapshot: snapshot },
    }),
    deps.db.locationStats.upsert({
      where: { clientId: client.id },
      create: { clientId: client.id, ...statsData },
      update: statsData,
    }),
  ]);
}

async function storeMetrics(deps: Deps, client: Client, session: GbpSession, days: number, now: Date): Promise<void> {
  const end = isoDate(new Date(now.getTime() - 86_400_000));
  const start = addDays(end, -(days - 1));
  const rows = await session.getDailyMetrics(client.gbpLocationId!, start, end);
  if (rows.length === 0) return;
  await deps.db.$transaction([
    deps.db.metricSnapshot.deleteMany({
      where: { clientId: client.id, date: { gte: new Date(start), lte: new Date(end) } },
    }),
    deps.db.metricSnapshot.createMany({
      data: rows.map((row) => ({
        workspaceId: client.workspaceId,
        clientId: client.id,
        date: new Date(row.date),
        metric: row.metric,
        value: row.value,
      })),
    }),
  ]);
}

async function findLocation(session: GbpSession, client: Client): Promise<GbpLocation> {
  const locations = await session.listLocations(client.gbpAccountId!);
  const location = locations.find((l) => l.locationId === client.gbpLocationId);
  if (!location) throw new GbpError("access_denied", "Location is no longer accessible");
  return location;
}

export async function syncClient(deps: Deps, clientId: string, now = new Date()): Promise<"synced" | "skipped" | "failed"> {
  const client = await deps.db.client.findUnique({ where: { id: clientId }, include: { connection: true } });
  if (!client?.connection || !client.gbpLocationId || client.status !== "connected") return "skipped";
  const session = sessionFor(deps, client.connection);
  try {
    await syncLocation(deps, client, client.connection, session, now);
    return "synced";
  } catch (error) {
    if (await applyGbpFailure(deps, client, error)) return "failed";
    throw error;
  }
}

async function syncLocation(deps: Deps, client: Client, _connection: GoogleConnection, session: GbpSession, now: Date): Promise<void> {
  const location = await findLocation(session, client);
  const hasMetrics = await deps.db.metricSnapshot.findFirst({ where: { clientId: client.id }, select: { id: true } });
  await storeLocation(deps, client, session, location);
  await storeMetrics(deps, client, session, hasMetrics ? NIGHTLY_METRIC_DAYS : INITIAL_METRIC_DAYS, now);
}

/** Nightly sweep. One client's failure never stops the others. */
export async function syncAllClients(deps: Deps): Promise<{ synced: number; failed: number }> {
  const clients = await deps.db.client.findMany({ where: { status: "connected" }, select: { id: true } });
  let synced = 0;
  let failed = 0;
  for (const { id } of clients) {
    try {
      if ((await syncClient(deps, id)) === "failed") failed++;
      else synced++;
    } catch (error) {
      failed++;
      deps.logger.error({ clientId: id, err: error instanceof Error ? error.message : "unknown" }, "client sync failed");
    }
  }
  return { synced, failed };
}
