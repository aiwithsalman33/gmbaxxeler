import type { Db } from "@localpilot/db";

export const WORKER_ID = "worker";
/** The worker beats every 30 seconds; two missed beats plus slack means it's gone. */
export const WORKER_OFFLINE_AFTER_MS = 2 * 60_000;

export interface WorkerJobInfo {
  name: string;
  lastStartedAt: Date | null;
  lastFinishedAt: Date | null;
  lastDurationMs: number | null;
  lastError: string | null;
  runs: number;
  failures: number;
}

export interface WorkerHealth {
  status: "online" | "offline" | "never_started";
  lastBeatAt: Date | null;
  startedAt: Date | null;
  adapter: string | null;
  /** The most recent finish across all recurring jobs. */
  lastRunAt: Date | null;
  jobs: WorkerJobInfo[];
}

export async function recordHeartbeat(db: Db, info: { startedAt: Date; hostname?: string; adapter?: string }, now = new Date()): Promise<void> {
  await db.workerStatus.upsert({
    where: { id: WORKER_ID },
    create: { id: WORKER_ID, startedAt: info.startedAt, lastBeatAt: now, hostname: info.hostname, adapter: info.adapter },
    update: { startedAt: info.startedAt, lastBeatAt: now, hostname: info.hostname, adapter: info.adapter },
  });
}

/** Runs one recurring job and records how it went. The error is rethrown so pg-boss still sees it. */
export async function recordJobRun<T>(db: Db, name: string, run: () => Promise<T>): Promise<T> {
  const started = new Date();
  await db.workerJobRun.upsert({ where: { name }, create: { name, lastStartedAt: started }, update: { lastStartedAt: started } });
  try {
    const result = await run();
    const finished = new Date();
    await db.workerJobRun.update({
      where: { name },
      data: { lastFinishedAt: finished, lastDurationMs: finished.getTime() - started.getTime(), lastError: null, lastResult: toJson(result), runs: { increment: 1 } },
    });
    return result;
  } catch (error) {
    const finished = new Date();
    await db.workerJobRun
      .update({
        where: { name },
        data: {
          lastFinishedAt: finished,
          lastDurationMs: finished.getTime() - started.getTime(),
          lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
          runs: { increment: 1 },
          failures: { increment: 1 },
        },
      })
      .catch(() => undefined);
    throw error;
  }
}

function toJson(value: unknown): object | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return { value };
  try {
    return JSON.parse(JSON.stringify(value)) as object;
  } catch {
    return undefined;
  }
}

export async function workerHealth(db: Db, now = new Date()): Promise<WorkerHealth> {
  const [status, jobs] = await Promise.all([db.workerStatus.findUnique({ where: { id: WORKER_ID } }), db.workerJobRun.findMany({ orderBy: { name: "asc" } })]);
  const lastRunAt = jobs.reduce<Date | null>((latest, job) => (job.lastFinishedAt && (!latest || job.lastFinishedAt > latest) ? job.lastFinishedAt : latest), null);
  return {
    status: !status ? "never_started" : now.getTime() - status.lastBeatAt.getTime() <= WORKER_OFFLINE_AFTER_MS ? "online" : "offline",
    lastBeatAt: status?.lastBeatAt ?? null,
    startedAt: status?.startedAt ?? null,
    adapter: status?.adapter ?? null,
    lastRunAt,
    jobs: jobs.map(({ name, lastStartedAt, lastFinishedAt, lastDurationMs, lastError, runs, failures }) => ({ name, lastStartedAt, lastFinishedAt, lastDurationMs, lastError, runs, failures })),
  };
}
