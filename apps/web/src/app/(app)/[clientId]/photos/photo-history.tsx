"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, History, RotateCcw } from "lucide-react";
import { SimulatedBadge } from "@/components/schedule/publishing";
import { ScheduleHistory, type HistoryRow } from "@/components/schedule/schedule-history";
import { EmptyState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { CATEGORY_LABELS, type PhotoJob } from "@/lib/types";

const RETRYABLE = ["failed", "dead", "needs_images"];

export function usePhotoHistory(clientId: string) {
  return useQuery({ queryKey: ["photo-history", clientId], queryFn: () => api<PhotoJob[]>(`/clients/${clientId}/photos/history`) });
}

export function PhotoHistory({ clientId, timezone }: { clientId: string; timezone: string }) {
  const queryClient = useQueryClient();
  const base = `/clients/${clientId}/photos`;
  const history = usePhotoHistory(clientId);
  const retry = useMutation({
    mutationFn: (id: string) => api(`${base}/jobs/${id}/retry`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Upload queued to try again");
      queryClient.invalidateQueries({ queryKey: ["photo-history", clientId] });
      queryClient.invalidateQueries({ queryKey: ["photo-queue", clientId] });
    },
    onError: (error) => toastError(error),
  });

  if (history.isPending) return <SkeletonRows count={6} />;
  if (history.isError) return <ErrorState error={history.error} onRetry={() => history.refetch()} />;
  if (history.data.length === 0) {
    return <EmptyState icon={History} title="No uploads yet" body="Published, skipped and failed uploads appear here, with the original file name and the new AI name." />;
  }

  const rows: HistoryRow[] = history.data.map((job) => {
    const entry = job.logs?.[0];
    const note = (entry?.meta as { note?: string } | undefined)?.note;
    const original = entry?.originalName ?? job.image?.originalName;
    return {
      id: job.id,
      runAt: job.runAt,
      status: job.status,
      thumb: job.image?.publicUrl,
      thumbAlt: original ?? undefined,
      title: entry?.newName ?? job.image?.seoName ?? original ?? <span className="text-muted">No photo</span>,
      detail: (
        <>
          {entry?.newName && original && entry.newName !== original && (
            <span className="block">
              Renamed from <span className="break-all text-ink-soft">{original}</span>
            </span>
          )}
          {note && <span className="block">{note}</span>}
        </>
      ),
      error: job.error,
      labels:
        job.category || job.simulated ? (
          <>
            {job.simulated && <SimulatedBadge />}
            {job.category && <Badge>{CATEGORY_LABELS[job.category]}</Badge>}
          </>
        ) : undefined,
      actions: (
        <>
          {job.image && (
            <Button asChild size="sm" variant="ghost">
              <a href={job.image.publicUrl} target="_blank" rel="noreferrer" aria-label={`Open ${original ?? "photo"} in a new tab`}>
                <ExternalLink aria-hidden />
                <span className="hidden lg:inline">Image</span>
              </a>
            </Button>
          )}
          {RETRYABLE.includes(job.status) && (
            <Button size="sm" variant="secondary" loading={retry.isPending && retry.variables === job.id} disabled={retry.isPending} onClick={() => retry.mutate(job.id)}>
              {!(retry.isPending && retry.variables === job.id) && <RotateCcw aria-hidden />}
              Retry
            </Button>
          )}
        </>
      ),
    };
  });

  return <ScheduleHistory rows={rows} timezone={timezone} itemHeading="Photo" />;
}
