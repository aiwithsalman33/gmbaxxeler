"use client";

import { useMutation } from "@tanstack/react-query";
import { BadgeCheck, CalendarClock, Check, ImageOff, PenLine, RotateCcw, SkipForward, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { JobStatusBadge } from "@/components/job-status-badge";
import { formatDayTime } from "@/components/schedule/utils";
import { Notice } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { toast, toastError } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { CTA_LABELS, type PostJob } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_CHARS = 1500;
const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const isUrl = (value: string) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

export function PostDialog({ clientId, job, timezone, onClose, onChanged }: { clientId: string; job: PostJob | null; timezone: string; onClose: () => void; onChanged: () => void }) {
  const [summary, setSummary] = useState("");
  const [ctaType, setCtaType] = useState("LEARN_MORE");
  const [ctaUrl, setCtaUrl] = useState("");
  const base = `/clients/${clientId}/posts/${job?.id}`;
  const post = job?.post;
  const editable = job ? ["scheduled", "awaiting_approval"].includes(job.status) : false;
  const awaiting = job?.status === "awaiting_approval";
  const failed = job ? ["failed", "dead", "needs_images"].includes(job.status) : false;

  useEffect(() => {
    setSummary(post?.summary ?? "");
    setCtaType(post?.ctaType ?? "LEARN_MORE");
    setCtaUrl(post?.ctaUrl ?? "");
  }, [post]);

  const done = (message: string) => () => {
    toast.success(message);
    onChanged();
    onClose();
  };
  const body = { summary, ctaType, ctaUrl: ctaType === "CALL" ? null : ctaUrl || null };
  const saveThenApprove = useMutation({
    mutationFn: async () => {
      await api(base, { method: "PATCH", body });
      await api(`${base}/approve`, { method: "POST" });
    },
    onSuccess: done("Post approved. It will go live on schedule."),
    onError: (error) => toastError(error),
  });
  const save = useMutation({ mutationFn: () => api(base, { method: "PATCH", body }), onSuccess: done("Post saved"), onError: (error) => toastError(error) });
  const rewrite = useMutation({
    mutationFn: () => api(`${base}/regenerate`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Post rewritten");
      onChanged();
    },
    onError: (error) => toastError(error),
  });
  const skip = useMutation({ mutationFn: () => api(`${base}/skip`, { method: "POST" }), onSuccess: done("Post skipped"), onError: (error) => toastError(error) });
  const retry = useMutation({ mutationFn: () => api(`${base}/retry`, { method: "POST" }), onSuccess: done("Post queued to try again"), onError: (error) => toastError(error) });
  const busy = saveThenApprove.isPending || save.isPending || rewrite.isPending || skip.isPending || retry.isPending;

  const words = wordCount(summary);
  const summaryError = post && editable && !summary.trim() ? "The post needs some text." : null;
  const urlError = ctaType === "CALL" || !editable ? null : !ctaUrl ? "Add the link for this button." : !isUrl(ctaUrl) ? "Use a full link starting with https://" : null;
  const valid = !summaryError && !urlError;
  const wordTone = words >= 150 && words <= 230 ? "text-good" : "text-warn";

  const title = awaiting ? "Review post" : post && editable ? "Edit post" : "Post";

  return (
    <Dialog
      open={job !== null}
      onOpenChange={(open) => !open && onClose()}
      title={title}
      description={job ? `${job.status === "published" ? "Went live" : "Goes live"} ${formatDayTime(job.runAt, timezone)}` : undefined}
      size="lg"
      footer={
        job && (
          <>
            {editable && (
              <Button variant="ghost" className="sm:mr-auto" loading={skip.isPending} disabled={busy} onClick={() => skip.mutate()}>
                {!skip.isPending && <SkipForward aria-hidden />}
                Skip post
              </Button>
            )}
            {post && editable && (
              <Button variant="secondary" loading={rewrite.isPending} disabled={busy} onClick={() => rewrite.mutate()}>
                {!rewrite.isPending && <Wand2 aria-hidden />}
                {rewrite.isPending ? "Rewriting" : "Rewrite with AI"}
              </Button>
            )}
            {post && job.status === "scheduled" && (
              <Button loading={save.isPending} disabled={busy || !valid} onClick={() => save.mutate()}>
                {!save.isPending && <Check aria-hidden />}
                Save
              </Button>
            )}
            {awaiting && (
              <Button loading={saveThenApprove.isPending} disabled={busy || !valid} onClick={() => saveThenApprove.mutate()}>
                {!saveThenApprove.isPending && <BadgeCheck aria-hidden />}
                Approve
              </Button>
            )}
            {failed && (
              <Button loading={retry.isPending} disabled={busy} onClick={() => retry.mutate()}>
                {!retry.isPending && <RotateCcw aria-hidden />}
                Retry
              </Button>
            )}
            {!editable && !failed && (
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            )}
          </>
        )
      }
    >
      {job && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <JobStatusBadge status={job.status} />
            {post?.aiGenerated && (
              <Badge tone="primary">
                <Sparkles className="size-3" aria-hidden />
                AI written
              </Badge>
            )}
            {post && !post.aiGenerated && (
              <Badge>
                <PenLine className="size-3" aria-hidden />
                Edited
              </Badge>
            )}
            {post?.approvedAt && <Badge tone="good">Approved</Badge>}
          </div>

          {awaiting && (
            <Notice tone="warn" icon={BadgeCheck}>
              Read it over, make any edits, then approve. It won&apos;t be published until you do.
            </Notice>
          )}
          {failed && job.error && (
            <Notice tone="bad" title="This post didn't go out">
              {job.error}
            </Notice>
          )}

          <div className="grid gap-5 sm:grid-cols-[13rem_1fr]">
            <figure className="space-y-1.5">
              {job.image ? (
                <img src={job.image.publicUrl} alt={job.image.originalName} className="h-40 w-full rounded-xl object-cover ring-1 ring-line sm:aspect-square sm:h-auto" />
              ) : (
                <div className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-xl bg-lavender text-center text-xs text-muted ring-1 ring-line sm:aspect-square sm:h-auto">
                  <ImageOff className="size-6 text-subtle" aria-hidden />
                  <span className="px-4">An image is picked when the post is written</span>
                </div>
              )}
              {job.image && <figcaption className="truncate text-2xs text-muted">{job.image.originalName}</figcaption>}
            </figure>

            <div className="min-w-0 space-y-4">
              {!post ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-10 text-center">
                  <CalendarClock className="size-6 text-primary" aria-hidden />
                  <p className="text-sm font-medium">Not written yet</p>
                  <p className="max-w-xs text-xs text-muted">{failed ? "Retry to have AI write and send it again." : "AI writes this post before its publish time. Check back then to review it."}</p>
                </div>
              ) : editable ? (
                <Field
                  label="Post text"
                  error={summaryError}
                  hint={
                    <>
                      <span className={wordTone}>{words} words</span> (aim for 150 to 230) · {summary.length} of {MAX_CHARS} characters
                    </>
                  }
                >
                  {(props) => <Textarea {...props} rows={10} maxLength={MAX_CHARS} value={summary} onChange={(event) => setSummary(event.target.value)} />}
                </Field>
              ) : (
                <div>
                  <p className="mb-1.5 text-sm font-medium text-ink">Post text</p>
                  <p className="rounded-xl bg-lavender px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-ink-soft">{post.summary}</p>
                </div>
              )}

              {post && (
                <div className={cn("grid gap-4", editable && "sm:grid-cols-2")}>
                  {editable ? (
                    <>
                      <Field label="Button">
                        {(props) => (
                          <Select {...props} value={ctaType} onChange={(event) => setCtaType(event.target.value)}>
                            {Object.entries(CTA_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                      {ctaType === "CALL" ? (
                        <p className="self-end rounded-xl bg-lavender px-3 py-2.5 text-xs text-muted">Calls use the phone number on the profile.</p>
                      ) : (
                        <Field label="Button link" error={urlError}>
                          {(props) => <Input {...props} type="url" inputMode="url" placeholder="https://" value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} />}
                        </Field>
                      )}
                    </>
                  ) : (
                    <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                      Button:
                      <span className="rounded-lg bg-primary-50 px-2.5 py-1 font-medium text-primary-800">{CTA_LABELS[post.ctaType] ?? post.ctaType}</span>
                      {post.ctaUrl && (
                        <a href={post.ctaUrl} target="_blank" rel="noreferrer" className="min-w-0 truncate text-primary hover:underline">
                          {post.ctaUrl}
                        </a>
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
