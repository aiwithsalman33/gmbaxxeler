"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, FlaskConical, RefreshCw } from "lucide-react";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Notice } from "@/components/states";
import { api } from "@/lib/api";
import type { WorkerHealth } from "@/lib/types";
import { cn } from "@/lib/utils";

const REFRESH_MS = 30_000;

const JOB_LABELS: Record<string, string> = {
  "publish-due-jobs": "Publish due photos and posts",
  "materialize-jobs": "Create upcoming jobs",
  "generate-posts": "Write post drafts",
  "sync-reviews": "Sync reviews",
  "publish-replies": "Publish review replies",
  "sync-metrics": "Sync metrics",
  "poll-invitations": "Check Google invitations",
  "send-client-reminders": "Client reminders",
  "check-connections": "Check Google connections",
};

export function useWorkerHealth() {
  return useQuery({ queryKey: ["worker-health"], queryFn: () => api<WorkerHealth>("/admin/worker"), refetchInterval: REFRESH_MS });
}

function ago(value: string | null): string {
  if (!value) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : new Date(value).toLocaleDateString("en", { day: "numeric", month: "short" });
}

function StatusLine({ health }: { health: WorkerHealth }) {
  const online = health.status === "online";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="inline-flex items-center gap-2 text-sm font-semibold">
        <StatusDot tone={online ? "good" : "bad"} className={cn(online && "animate-pulse")} />
        Worker: {online ? "online" : health.status === "never_started" ? "never started" : "offline"}
      </span>
      <span className="text-sm text-muted">Last heartbeat {ago(health.lastBeatAt)}</span>
      <span className="text-sm text-muted">· Last run {ago(health.lastRunAt)}</span>
      {health.adapterInUse === "mock" && (
        <Badge tone="info">
          <FlaskConical className="size-3" aria-hidden />
          Mock adapter
        </Badge>
      )}
    </div>
  );
}

/** One-line status for the failed-jobs page. */
export function WorkerStatusStrip({ className }: { className?: string }) {
  const health = useWorkerHealth();
  if (health.isPending) return <Skeleton className={cn("h-12", className)} />;
  if (health.isError) return null;
  return (
    <div className={cn("rounded-xl border border-line bg-surface px-4 py-3 shadow-card", className)}>
      <StatusLine health={health.data} />
    </div>
  );
}

/** Full card for Settings: overall status plus every recurring job's last run. */
export function WorkerStatusCard() {
  const health = useWorkerHealth();
  return (
    <Card>
      <CardHeader
        icon={Activity}
        title="Background worker"
        description="Publishes scheduled photos and posts, syncs reviews and metrics. Checks in every 30 seconds."
        actions={
          <Button size="sm" variant="secondary" loading={health.isFetching} onClick={() => health.refetch()}>
            {!health.isFetching && <RefreshCw aria-hidden />}
            Refresh
          </Button>
        }
      />
      {health.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-6 w-80 max-w-full" />
          <Skeleton className="h-40" />
        </div>
      ) : health.isError ? (
        <Notice tone="bad">{health.error.message}</Notice>
      ) : (
        <>
          <StatusLine health={health.data} />
          {health.data.status !== "online" && (
            <Notice tone="bad" className="mt-4" title="Scheduled items won't publish while the worker is down">
              {health.data.status === "never_started"
                ? "The worker has never checked in. In Dokploy, check that the worker service is deployed and running, then look at its logs."
                : "The worker stopped checking in. In Dokploy, open the worker service, check its logs, and redeploy it if it has stopped."}
            </Notice>
          )}
          {health.data.jobs.length > 0 && (
            <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
              {health.data.jobs.map((job) => (
                <li key={job.name} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 font-medium">{JOB_LABELS[job.name] ?? job.name}</span>
                  <span className="text-muted">Ran {ago(job.lastFinishedAt)}</span>
                  {job.lastError ? (
                    <Badge tone="bad" title={job.lastError} className="max-w-full truncate">
                      Last run failed: {job.lastError}
                    </Badge>
                  ) : (
                    <Badge tone="good" dot>
                      OK
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
