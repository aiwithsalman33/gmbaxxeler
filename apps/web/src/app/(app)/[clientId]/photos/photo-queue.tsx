"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ImageOff } from "lucide-react";
import { useState } from "react";
import { EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { CATEGORY_LABELS, PHOTO_CATEGORIES, type PhotoJob } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

const toLocalInput = (iso: string) => {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function PhotoQueue({ clientId, timezone }: { clientId: string; timezone: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<PhotoJob | null>(null);
  const [runAt, setRunAt] = useState("");
  const [category, setCategory] = useState("ADDITIONAL");
  const base = `/clients/${clientId}/photos`;

  const queue = useQuery({ queryKey: ["photo-queue", clientId], queryFn: () => api<PhotoJob[]>(`${base}/queue`) });
  const mock = useQuery({
    queryKey: ["mock"],
    queryFn: () => api<{ enabled: boolean }>("/dev/mock/enabled").catch(() => ({ enabled: false })),
    staleTime: Infinity,
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["photo-queue", clientId] });
    queryClient.invalidateQueries({ queryKey: ["photo-history", clientId] });
    queryClient.invalidateQueries({ queryKey: ["library", clientId] });
  };

  const skip = useMutation({ mutationFn: (id: string) => api(`${base}/jobs/${id}/skip`, { method: "POST" }), onSuccess: refresh });
  const publishNext = useMutation({ mutationFn: () => api(`/dev/mock/clients/${clientId}/photos/publish-next`, { method: "POST" }), onSuccess: refresh });
  const update = useMutation({
    mutationFn: () => api(`${base}/jobs/${editing!.id}`, { method: "PATCH", body: { runAt: new Date(runAt).toISOString(), category } }),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
  });

  if (queue.isPending) return <Skeleton className="h-48" />;
  if (queue.isError) return <ErrorState error={queue.error} onRetry={() => queue.refetch()} />;
  if (queue.data.length === 0) {
    return <EmptyState icon={CalendarClock} title="Nothing is queued" body="Save a schedule and the next 14 days of uploads appear here." />;
  }
  const error = skip.error ?? publishNext.error;

  return (
    <>
      {mock.data?.enabled && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" variant="secondary" disabled={publishNext.isPending} onClick={() => publishNext.mutate()}>
            Publish next (mock)
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mb-3 text-sm text-bad">
          {error.message}
        </p>
      )}
      <Card className="p-0">
        <ul className="divide-y divide-line">
          {queue.data.map((job) => (
            <li key={job.id} className="flex flex-wrap items-center gap-3 p-3 sm:px-5">
              {job.image ? (
                <img src={job.image.publicUrl} alt={job.image.originalName} loading="lazy" className="size-12 rounded-lg object-cover" />
              ) : (
                <div className="flex size-12 items-center justify-center rounded-lg bg-lavender text-muted">
                  <ImageOff className="size-5" />
                </div>
              )}
              <div className="min-w-40 flex-1">
                <p className="text-sm font-medium">{formatDateTime(job.runAt, timezone)}</p>
                <p className="truncate text-xs text-muted">{job.image?.seoName ?? job.image?.originalName ?? "Picks the next image when it runs"}</p>
              </div>
              <span className="text-xs text-muted">{CATEGORY_LABELS[job.category ?? "ADDITIONAL"]}</span>
              {job.attempts > 0 && <span className="text-xs text-warn">Retry {job.attempts} of 3</span>}
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(job);
                    setRunAt(toLocalInput(job.runAt));
                    setCategory(job.category ?? "ADDITIONAL");
                  }}
                >
                  Edit
                </Button>
                <Button size="sm" variant="ghost" disabled={skip.isPending} onClick={() => skip.mutate(job.id)}>
                  Skip
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} title="Edit upload" description="Times here use your computer's timezone.">
        <div className="space-y-3">
          <div>
            <Label htmlFor="runAt">When</Label>
            <Input id="runAt" type="datetime-local" value={runAt} onChange={(event) => setRunAt(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="jobCategory">Category</Label>
            <select id="jobCategory" className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm" value={category} onChange={(event) => setCategory(event.target.value)}>
              {PHOTO_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {CATEGORY_LABELS[item]}
                </option>
              ))}
            </select>
          </div>
          {update.isError && (
            <p role="alert" className="text-sm text-bad">
              {update.error.message}
            </p>
          )}
          <Button className="w-full" disabled={update.isPending || !runAt} onClick={() => update.mutate()}>
            Save changes
          </Button>
        </div>
      </Dialog>
    </>
  );
}
