"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, History } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { JobStatusBadge } from "@/components/job-status-badge";
import { api } from "@/lib/api";
import type { PhotoJob } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

const RETRYABLE = ["failed", "dead", "needs_images"];

export function PhotoHistory({ clientId, timezone }: { clientId: string; timezone: string }) {
  const queryClient = useQueryClient();
  const base = `/clients/${clientId}/photos`;
  const history = useQuery({ queryKey: ["photo-history", clientId], queryFn: () => api<PhotoJob[]>(`${base}/history`) });
  const retry = useMutation({
    mutationFn: (id: string) => api(`${base}/jobs/${id}/retry`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["photo-history", clientId] });
      queryClient.invalidateQueries({ queryKey: ["photo-queue", clientId] });
    },
  });

  if (history.isPending) return <Skeleton className="h-48" />;
  if (history.isError) return <ErrorState error={history.error} onRetry={() => history.refetch()} />;
  if (history.data.length === 0) {
    return <EmptyState icon={History} title="No uploads yet" body="Published and failed uploads appear here, with the original and new file names." />;
  }

  return (
    <>
      {retry.isError && (
        <p role="alert" className="mb-3 text-sm text-bad">
          {retry.error.message}
        </p>
      )}
      <Card className="p-0">
        <ul className="divide-y divide-line">
          {history.data.map((job) => {
            const entry = job.logs?.[0];
            const note = (entry?.meta as { note?: string } | undefined)?.note;
            return (
              <li key={job.id} className="flex flex-wrap items-center gap-3 p-3 sm:px-5">
                <div className="min-w-48 flex-1">
                  <p className="text-sm font-medium">{formatDateTime(job.runAt, timezone)}</p>
                  {entry?.originalName && (
                    <p className="flex flex-wrap items-center gap-1 text-xs text-muted">
                      <span className="break-all">{entry.originalName}</span>
                      {entry.newName && (
                        <>
                          <ArrowRight aria-label="renamed to" className="size-3 shrink-0" />
                          <span className="break-all text-ink">{entry.newName}</span>
                        </>
                      )}
                    </p>
                  )}
                  {note && <p className="text-xs text-muted">{note}</p>}
                  {job.error && <p className="text-xs text-bad">{job.error}</p>}
                </div>
                <JobStatusBadge status={job.status} />
                {RETRYABLE.includes(job.status) && (
                  <Button size="sm" variant="secondary" disabled={retry.isPending} onClick={() => retry.mutate(job.id)}>
                    Retry
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
