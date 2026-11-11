"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorState, Notice } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { Field, Switch, Textarea } from "@/components/ui/input";
import { LoadingBlock, Skeleton } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { ReviewSettings } from "@/lib/types";
import { cn } from "@/lib/utils";

export const REPLY_MODES: {
  value: ReviewSettings["mode"];
  label: string;
  short: string;
  body: string;
}[] = [
  {
    value: "draft_only",
    label: "Draft only",
    short: "Draft only",
    body: "AI writes a draft for every review. Nothing goes out until you approve it.",
  },
  {
    value: "auto_4_5",
    label: "Auto-reply to 4 and 5 stars with text",
    short: "Auto 4-5 stars",
    body: "Happy reviews with written text get a reply on their own after a short delay.",
  },
  {
    value: "full_auto",
    label: "Full auto for 4 and 5 stars",
    short: "Full auto",
    body: "All 4 and 5 star reviews get a reply on their own, including rating-only ones.",
  },
];

export const reviewSettingsKey = (clientId: string) => ["review-settings", clientId];

export function useReviewSettings(clientId: string) {
  return useQuery({
    queryKey: reviewSettingsKey(clientId),
    queryFn: () => api<ReviewSettings>(`/clients/${clientId}/review-settings`),
  });
}

/** AI reply settings, edited in a side panel opened from the page header. */
export function ReviewSettingsDrawer({ clientId, open, onOpenChange }: { clientId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const query = useReviewSettings(clientId);
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<ReviewSettings["mode"]>("draft_only");
  const [brain, setBrain] = useState("");
  const data = query.data;

  useEffect(() => {
    if (!data || !open) return;
    setEnabled(data.autoReplyEnabled);
    setMode(data.mode);
    setBrain(data.replyBrain ?? "");
  }, [data, open]);

  const save = useMutation({
    mutationFn: () =>
      api(`/clients/${clientId}/review-settings`, {
        method: "PUT",
        body: {
          autoReplyEnabled: enabled,
          mode,
          replyBrain: brain || null,
          delayMinS: data?.delayMinS ?? 300,
          delayMaxS: data?.delayMaxS ?? 3600,
        },
      }),
    onSuccess: () => {
      toast.success("Reply settings saved");
      onOpenChange(false);
      return queryClient.invalidateQueries({
        queryKey: reviewSettingsKey(clientId),
      });
    },
    onError: (error) => toastError(error),
  });

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="AI reply settings"
      description="Choose how much LocalPilot replies on its own for this client."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!data} onClick={() => save.mutate()}>
            Save settings
          </Button>
        </>
      }
    >
      {query.isPending ? (
        <LoadingBlock label="Loading settings" className="space-y-5">
          <Skeleton className="h-12" />
          <Skeleton className="h-56" />
          <Skeleton className="h-32" />
        </LoadingBlock>
      ) : query.isError ? (
        <ErrorState bare error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <div className="space-y-6">
          <Switch checked={enabled} onChange={setEnabled} label="AI auto-reply" description="When off, new reviews just wait for you. AI suggest still works when you reply." />

          <fieldset disabled={!enabled} className={cn("space-y-2 transition-opacity", !enabled && "opacity-60")}>
            <legend className="mb-2 text-sm font-medium text-ink">Mode</legend>
            {REPLY_MODES.map((option) => {
              const selected = mode === option.value;
              return (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-colors has-[:focus-visible]:shadow-focus",
                    selected ? "border-primary bg-primary-50 ring-1 ring-primary" : "border-line bg-white hover:border-primary-300",
                    !enabled && "cursor-not-allowed",
                  )}
                >
                  <input
                    type="radio"
                    name="replyMode"
                    value={option.value}
                    checked={selected}
                    onChange={() => setMode(option.value)}
                    className="mt-0.5 size-4 shrink-0 accent-primary focus:outline-none"
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-muted">{option.body}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          <Notice tone="info" icon={ShieldAlert}>
            1 to 3 star reviews never publish on their own. They become drafts and you get an alert right away.
          </Notice>

          <Field label="Reply Brain" hint="Brand voice, policies, do's and don'ts, and how to sign off. AI uses this for every reply.">
            {(props) => (
              <Textarea
                {...props}
                rows={6}
                maxLength={3000}
                placeholder="e.g. Friendly, first names, sign off as 'The Bloom team'. Never offer refunds in public."
                value={brain}
                onChange={(event) => setBrain(event.target.value)}
              />
            )}
          </Field>
        </div>
      )}
    </Drawer>
  );
}
