"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, FlaskConical, ImagePlus, Pencil, SkipForward } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { JobStatusBadge } from "@/components/job-status-badge";
import { QueueSkeleton, useMockEnabled } from "@/components/schedule/page-parts";
import { ScheduleQueue, type QueueItem } from "@/components/schedule/schedule-queue";
import { formatDayTime } from "@/components/schedule/utils";
import { EmptyState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { toast, toastError } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { CATEGORY_LABELS, PHOTO_CATEGORIES, type PhotoJob } from "@/lib/types";

const toLocalInput = (iso: string) => {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function usePhotoQueue(clientId: string) {
  return useQuery({ queryKey: ["photo-queue", clientId], queryFn: () => api<PhotoJob[]>(`/clients/${clientId}/photos/queue`) });
}

export function PhotoQueue({ clientId, timezone, hasSchedule }: { clientId: string; timezone: string; hasSchedule: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<PhotoJob | null>(null);
  const [skipping, setSkipping] = useState<PhotoJob | null>(null);
  const [runAt, setRunAt] = useState("");
  const [category, setCategory] = useState("ADDITIONAL");
  const base = `/clients/${clientId}/photos`;

  const queue = usePhotoQueue(clientId);
  const mock = useMockEnabled();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["photo-queue", clientId] });
    queryClient.invalidateQueries({ queryKey: ["photo-history", clientId] });
    queryClient.invalidateQueries({ queryKey: ["library", clientId] });
  };

  const skip = useMutation({
    mutationFn: (id: string) => api(`${base}/jobs/${id}/skip`, { method: "POST" }),
    onSuccess: () => {
      setSkipping(null);
      toast.success("Upload skipped");
      refresh();
    },
    onError: (error) => toastError(error),
  });
  const publishNext = useMutation({
    mutationFn: () => api(`/dev/mock/clients/${clientId}/photos/publish-next`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Published the next upload (mock)");
      refresh();
    },
    onError: (error) => toastError(error),
  });
  const update = useMutation({
    mutationFn: () => api(`${base}/jobs/${editing!.id}`, { method: "PATCH", body: { runAt: new Date(runAt).toISOString(), category } }),
    onSuccess: () => {
      setEditing(null);
      toast.success("Upload updated");
      refresh();
    },
    onError: (error) => toastError(error),
  });

  if (queue.isPending) return <QueueSkeleton />;
  if (queue.isError) return <ErrorState error={queue.error} onRetry={() => queue.refetch()} />;
  if (queue.data.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Nothing is queued"
        body={
          hasSchedule
            ? "Uploads for the next 14 days appear here. Turn the schedule on and make sure the Photos folder has images."
            : "Save a schedule above and the next 14 days of uploads appear here, each with its time and photo."
        }
        action={
          <Button asChild variant="secondary">
            <Link href={`/${clientId}/library`}>
              <ImagePlus aria-hidden />
              Add photos to the library
            </Link>
          </Button>
        }
      />
    );
  }

  const openEdit = (job: PhotoJob) => {
    setEditing(job);
    setRunAt(toLocalInput(job.runAt));
    setCategory(job.category ?? "ADDITIONAL");
  };

  const items: QueueItem[] = queue.data.map((job) => {
    const name = job.image?.seoName ?? job.image?.originalName;
    return {
      id: job.id,
      runAt: job.runAt,
      thumb: job.image?.publicUrl,
      thumbAlt: job.image?.originalName,
      title: name ?? <span className="text-muted">Next photo from the folder</span>,
      subtitle: job.image ? (job.image.seoName && job.image.seoName !== job.image.originalName ? `Original: ${job.image.originalName}` : null) : "Picks the next unused image when it runs",
      label: CATEGORY_LABELS[job.category ?? "ADDITIONAL"] ?? "Photo",
      onOpen: () => openEdit(job),
      badges: (
        <>
          <JobStatusBadge status={job.status} />
          <Badge>{CATEGORY_LABELS[job.category ?? "ADDITIONAL"]}</Badge>
          {job.attempts > 0 && <Badge tone="warn">Retry {job.attempts} of 3</Badge>}
        </>
      ),
      actions: (
        <>
          <Button size="sm" variant="ghost" onClick={() => openEdit(job)} aria-label={`Edit upload on ${formatDayTime(job.runAt, timezone)}`}>
            <Pencil aria-hidden />
            <span className="hidden sm:inline">Edit</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSkipping(job)} aria-label={`Skip upload on ${formatDayTime(job.runAt, timezone)}`}>
            <SkipForward aria-hidden />
            <span className="hidden sm:inline">Skip</span>
          </Button>
        </>
      ),
    };
  });

  return (
    <>
      <ScheduleQueue
        items={items}
        timezone={timezone}
        toolbar={
          mock && (
            <Button size="sm" variant="secondary" loading={publishNext.isPending} onClick={() => publishNext.mutate()}>
              {!publishNext.isPending && <FlaskConical aria-hidden />}
              Publish next (mock)
            </Button>
          )
        }
      />

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit upload"
        description="Change when this photo goes up, or its Google category."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button loading={update.isPending} disabled={!runAt} onClick={() => update.mutate()}>
              Save changes
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (runAt && !update.isPending) update.mutate();
          }}
        >
          {editing?.image && (
            <div className="flex items-center gap-3 rounded-xl bg-lavender p-3">
              <img src={editing.image.publicUrl} alt={editing.image.originalName} className="size-14 shrink-0 rounded-lg object-cover" />
              <p className="min-w-0 truncate text-sm font-medium">{editing.image.seoName ?? editing.image.originalName}</p>
            </div>
          )}
          <Field label="When" hint="Uses your computer's timezone." error={runAt ? null : "Pick a date and time."}>
            {(props) => <Input {...props} type="datetime-local" value={runAt} onChange={(event) => setRunAt(event.target.value)} />}
          </Field>
          <Field label="Category">
            {(props) => (
              <Select {...props} value={category} onChange={(event) => setCategory(event.target.value)}>
                {PHOTO_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {CATEGORY_LABELS[item]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <button type="submit" hidden />
        </form>
      </Dialog>

      <ConfirmDialog
        open={skipping !== null}
        onOpenChange={(open) => !open && setSkipping(null)}
        title="Skip this upload?"
        description={skipping ? `The upload on ${formatDayTime(skipping.runAt, timezone)} won't run. You can't undo this.` : ""}
        confirmLabel="Skip upload"
        loading={skip.isPending}
        onConfirm={() => skipping && skip.mutate(skipping.id)}
      />
    </>
  );
}
