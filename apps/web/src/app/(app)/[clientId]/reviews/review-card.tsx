"use client";

import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CornerDownRight, Info, PenLine, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import { isNegative, relativeDate, REPLY_STATUS, replyStatus } from "./review-status";
import { Notice } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { toast, toastError } from "@/components/ui/toast";
import { Avatar, Stars } from "@/components/ui/widgets";
import { api } from "@/lib/api";
import type { Review } from "@/lib/types";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

const MAX_LENGTH = 1000;

function ReviewerLine({ review }: { review: Review }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={review.reviewerName} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{review.reviewerName}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Stars rating={review.rating} />
          <time dateTime={review.reviewedAt} title={formatDate(review.reviewedAt)} className="text-xs text-muted">
            {relativeDate(review.reviewedAt)}
          </time>
        </div>
      </div>
    </div>
  );
}

function ReviewText({ review, className }: { review: Review; className?: string }) {
  return review.text ? (
    <p className={cn("text-sm leading-relaxed whitespace-pre-line text-ink-soft", className)}>{review.text}</p>
  ) : (
    <p className={cn("text-sm text-subtle italic", className)}>Rating only, no written review</p>
  );
}

function ReplyBlock({ label, icon: Icon, children, tone = "primary" }: { label: string; icon: typeof Info; children: React.ReactNode; tone?: "primary" | "muted" }) {
  return (
    <div className={cn("mt-4 rounded-xl border-l-[3px] px-4 py-3", tone === "primary" ? "border-primary bg-lavender" : "border-line-strong bg-surface-2")}>
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </p>
      <p className="text-sm leading-relaxed whitespace-pre-line text-ink">{children}</p>
    </div>
  );
}

export function ReviewCard({ clientId, review, onChanged }: { clientId: string; review: Review; onChanged: () => void }) {
  const draft = review.replies[0];
  const status = replyStatus(review);
  const negative = isNegative(review);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(draft?.text ?? "");
  const [touched, setTouched] = useState(false);
  const base = `/clients/${clientId}`;

  const suggest = useMutation({
    mutationFn: () =>
      api<{ text: string }>(`${base}/reviews/${review.id}/suggest`, {
        method: "POST",
      }),
    onSuccess: (result) => setText(result.text),
    onError: (error) => toastError(error),
  });
  const send = useMutation({
    mutationFn: () =>
      draft && draft.status !== "scheduled"
        ? api(`${base}/replies/${draft.id}/approve`, {
            method: "POST",
            body: { text },
          })
        : api(`${base}/reviews/${review.id}/reply`, {
            method: "POST",
            body: { text },
          }),
    onSuccess: () => {
      toast.success(`Reply to ${review.reviewerName} is live on Google`);
      setOpen(false);
      onChanged();
    },
    onError: (error) => {
      toastError(error);
      onChanged();
    },
  });

  const openDrawer = () => {
    setText(draft?.text ?? "");
    setTouched(false);
    suggest.reset();
    send.reset();
    setOpen(true);
  };
  const submit = () => {
    setTouched(true);
    if (text.trim()) send.mutate();
  };

  const { label, tone } = REPLY_STATUS[status];
  const isDraft = Boolean(draft) && draft?.status !== "scheduled";
  const actionLabel = {
    needs_reply: "Reply",
    draft: "Review draft",
    scheduled: "Edit or send now",
    failed: "Fix and resend",
    replied: "",
  }[status];
  const fieldError = touched && !text.trim() ? "Write a reply before sending." : null;

  return (
    <Card className={cn("p-5 sm:p-6", negative && "border-bad-line")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ReviewerLine review={review} />
        <div className="flex flex-wrap items-center gap-1.5">
          {negative && (
            <Badge tone="bad">
              <AlertTriangle className="size-3" aria-hidden />
              Low rating
            </Badge>
          )}
          <Badge tone={tone} dot>
            {label}
          </Badge>
        </div>
      </div>

      <ReviewText review={review} className="mt-4" />

      {status === "replied" && review.replyText && (
        <ReplyBlock label="Your reply" icon={CornerDownRight}>
          {review.replyText}
        </ReplyBlock>
      )}
      {status === "scheduled" && draft && (
        <ReplyBlock label={`Auto-reply goes out ${draft.publishAt ? formatDateTime(draft.publishAt) : "soon"}`} icon={CalendarClock}>
          {draft.text}
        </ReplyBlock>
      )}
      {status === "draft" && draft && (
        <ReplyBlock label="Draft reply, waiting for your approval" icon={PenLine} tone="muted">
          {draft.text}
        </ReplyBlock>
      )}
      {status === "failed" && (
        <Notice tone="bad" icon={AlertTriangle} className="mt-4" title="This reply didn't send">
          {draft?.error ?? "Google didn't accept the reply."}
        </Notice>
      )}

      {status !== "replied" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant={status === "scheduled" ? "secondary" : "primary"} onClick={openDrawer}>
            {status === "needs_reply" ? <CornerDownRight aria-hidden /> : <PenLine aria-hidden />}
            {actionLabel}
          </Button>
        </div>
      )}

      <Drawer
        open={open}
        onOpenChange={setOpen}
        title={`Reply to ${review.reviewerName}`}
        description="Your reply is posted publicly on Google under this review."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={send.isPending} onClick={submit}>
              {!send.isPending && <Send aria-hidden />}
              {isDraft ? "Approve and send" : "Send reply"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <figure className={cn("rounded-xl border bg-lavender/60 p-4", negative ? "border-bad-line" : "border-line")}>
            <ReviewerLine review={review} />
            <blockquote className="mt-3">
              <ReviewText review={review} />
            </blockquote>
          </figure>

          {status === "scheduled" && draft && (
            <Notice tone="info" icon={CalendarClock}>
              This auto-reply goes out {draft.publishAt ? formatDateTime(draft.publishAt) : "soon"}. Sending now replaces it with what you write here.
            </Notice>
          )}
          {status === "failed" && draft?.error && (
            <Notice tone="bad" icon={AlertTriangle} title="Last attempt failed">
              {draft.error}
            </Notice>
          )}
          {negative && status !== "failed" && (
            <Notice tone="warn" icon={Info}>
              Low ratings never reply on their own. Take a moment, stay calm and offer a way to make it right.
            </Notice>
          )}

          <Field
            label="Your reply"
            error={fieldError}
            hint={`${text.length} / ${MAX_LENGTH} characters`}
            action={
              <Button size="sm" variant="soft" loading={suggest.isPending} onClick={() => suggest.mutate()}>
                {!suggest.isPending && <Sparkles aria-hidden />}
                {suggest.isPending ? "Writing" : "AI suggest"}
              </Button>
            }
          >
            {(props) => (
              <Textarea
                {...props}
                rows={9}
                maxLength={MAX_LENGTH}
                placeholder="Thank them by name, mention what they liked, and invite them back."
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            )}
          </Field>
        </div>
      </Drawer>
    </Card>
  );
}
