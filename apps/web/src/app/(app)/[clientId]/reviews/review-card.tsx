"use client";

import { useMutation } from "@tanstack/react-query";
import { Sparkles, Star } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { Review } from "@/lib/types";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

export function ReviewCard({ clientId, review, onChanged }: { clientId: string; review: Review; onChanged: () => void }) {
  const draft = review.replies[0];
  const [text, setText] = useState(draft?.text ?? "");
  const [composing, setComposing] = useState(false);
  const base = `/clients/${clientId}`;

  const suggest = useMutation({
    mutationFn: () => api<{ text: string }>(`${base}/reviews/${review.id}/suggest`, { method: "POST" }),
    onSuccess: (result) => setText(result.text),
  });
  const send = useMutation({
    mutationFn: () =>
      draft && draft.status !== "scheduled"
        ? api(`${base}/replies/${draft.id}/approve`, { method: "POST", body: { text } })
        : api(`${base}/reviews/${review.id}/reply`, { method: "POST", body: { text } }),
    onSuccess: () => {
      setComposing(false);
      onChanged();
    },
  });
  const error = suggest.error ?? send.error;
  const replied = review.replyState === "replied";
  const showEditor = !replied && (composing || draft?.status === "draft" || draft?.status === "failed");

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{review.reviewerName}</p>
          <p className="text-xs text-muted">{formatDate(review.reviewedAt)}</p>
        </div>
        <p aria-label={`${review.rating} out of 5 stars`} className="flex items-center gap-1 text-sm font-medium">
          {review.rating}
          <Star className={cn("size-4", review.rating <= 3 ? "fill-bad text-bad" : "fill-amber-400 text-amber-400")} />
        </p>
      </div>
      <p className="mt-2 text-sm">{review.text ?? <span className="text-muted">No written review</span>}</p>

      {replied && review.replyText && (
        <div className="mt-3 rounded-xl bg-lavender p-3 text-sm">
          <p className="mb-1 text-xs font-medium text-muted">Your reply</p>
          {review.replyText}
        </div>
      )}
      {draft?.status === "scheduled" && (
        <div className="mt-3 rounded-xl bg-lavender p-3 text-sm">
          <p className="mb-1 text-xs font-medium text-muted">Auto-reply goes out {draft.publishAt ? formatDateTime(draft.publishAt) : "soon"}</p>
          {draft.text}
        </div>
      )}
      {draft?.status === "failed" && <p className="mt-2 text-xs text-bad">{draft.error}</p>}

      {showEditor && (
        <div className="mt-3 space-y-2">
          {draft && <p className="text-xs font-medium text-warn">Draft needs your approval</p>}
          <Textarea aria-label={`Reply to ${review.reviewerName}`} rows={3} maxLength={1000} value={text} onChange={(event) => setText(event.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={send.isPending || !text.trim()} onClick={() => send.mutate()}>
              {draft ? "Approve and send" : "Send reply"}
            </Button>
            <Button size="sm" variant="secondary" disabled={suggest.isPending} onClick={() => suggest.mutate()}>
              <Sparkles className="size-3.5" />
              {suggest.isPending ? "Writing" : "AI suggest reply"}
            </Button>
          </div>
        </div>
      )}
      {!replied && !showEditor && !draft && (
        <Button className="mt-3" size="sm" variant="secondary" onClick={() => setComposing(true)}>
          Reply
        </Button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error.message}
        </p>
      )}
    </Card>
  );
}
