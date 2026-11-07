"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api";
import { CTA_LABELS, type PostJob } from "@/lib/types";

const MAX_CHARS = 1500;
const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

export function PostDialog({ clientId, job, onClose, onChanged }: { clientId: string; job: PostJob | null; onClose: () => void; onChanged: () => void }) {
  const [summary, setSummary] = useState("");
  const [ctaType, setCtaType] = useState("LEARN_MORE");
  const [ctaUrl, setCtaUrl] = useState("");
  const base = `/clients/${clientId}/posts/${job?.id}`;
  const post = job?.post;
  const editable = job ? ["scheduled", "awaiting_approval"].includes(job.status) : false;

  useEffect(() => {
    setSummary(post?.summary ?? "");
    setCtaType(post?.ctaType ?? "LEARN_MORE");
    setCtaUrl(post?.ctaUrl ?? "");
  }, [post]);

  const done = () => {
    onChanged();
    onClose();
  };
  const body = { summary, ctaType, ctaUrl: ctaType === "CALL" ? null : ctaUrl || null };
  const saveThenApprove = useMutation({
    mutationFn: async () => {
      await api(base, { method: "PATCH", body });
      await api(`${base}/approve`, { method: "POST" });
    },
    onSuccess: done,
  });
  const save = useMutation({ mutationFn: () => api(base, { method: "PATCH", body }), onSuccess: done });
  const rewrite = useMutation({ mutationFn: () => api(`${base}/regenerate`, { method: "POST" }), onSuccess: onChanged });
  const skip = useMutation({ mutationFn: () => api(`${base}/skip`, { method: "POST" }), onSuccess: done });
  const retry = useMutation({ mutationFn: () => api(`${base}/retry`, { method: "POST" }), onSuccess: done });
  const error = saveThenApprove.error ?? save.error ?? rewrite.error ?? skip.error ?? retry.error;
  const words = wordCount(summary);

  return (
    <Dialog open={job !== null} onOpenChange={(open) => !open && onClose()} title="Post" description="Check the post before it goes live.">
      {job?.image && <img src={job.image.publicUrl} alt="" className="mb-3 max-h-48 w-full rounded-xl object-cover" />}
      {!post && <p className="text-sm text-muted">{job?.error ?? "This post will be written before its publish time."}</p>}
      {post && (
        <div className="space-y-3">
          <div>
            <Label htmlFor="summary">Post text</Label>
            <Textarea id="summary" rows={9} maxLength={MAX_CHARS} disabled={!editable} value={summary} onChange={(event) => setSummary(event.target.value)} />
            <p className="mt-1 text-xs text-muted">
              {words} words (aim for 150 to 230), {summary.length} of {MAX_CHARS} characters
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ctaType">Button</Label>
              <select id="ctaType" disabled={!editable} className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm" value={ctaType} onChange={(event) => setCtaType(event.target.value)}>
                {Object.entries(CTA_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {ctaType === "CALL" ? (
              <p className="self-end pb-2 text-xs text-muted">Calls use the phone number on the profile.</p>
            ) : (
              <div>
                <Label htmlFor="postCtaUrl">Button link</Label>
                <Input id="postCtaUrl" type="url" disabled={!editable} value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} />
              </div>
            )}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {error.message}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {job?.status === "awaiting_approval" && (
          <Button disabled={saveThenApprove.isPending} onClick={() => saveThenApprove.mutate()}>
            Approve
          </Button>
        )}
        {post && editable && (
          <>
            {job?.status === "scheduled" && <Button onClick={() => save.mutate()}>Save</Button>}
            <Button variant="secondary" disabled={rewrite.isPending} onClick={() => rewrite.mutate()}>
              {rewrite.isPending ? "Rewriting" : "Rewrite"}
            </Button>
          </>
        )}
        {editable && (
          <Button variant="ghost" disabled={skip.isPending} onClick={() => skip.mutate()}>
            Skip
          </Button>
        )}
        {job && ["failed", "dead", "needs_images"].includes(job.status) && (
          <Button disabled={retry.isPending} onClick={() => retry.mutate()}>
            Retry
          </Button>
        )}
      </div>
    </Dialog>
  );
}
