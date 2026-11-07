"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { ReviewSettings } from "@/lib/types";

const MODES = [
  ["draft_only", "Draft only: everything needs approval"],
  ["auto_4_5", "Auto for 4-5 star reviews with text"],
  ["full_auto", "Full auto: all 4-5 star reviews, including rating-only"],
] as const;

export function ReviewSettingsCard({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["review-settings", clientId], queryFn: () => api<ReviewSettings>(`/clients/${clientId}/review-settings`) });
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<ReviewSettings["mode"]>("draft_only");
  const [brain, setBrain] = useState("");
  const data = query.data;

  useEffect(() => {
    if (!data) return;
    setEnabled(data.autoReplyEnabled);
    setMode(data.mode);
    setBrain(data.replyBrain ?? "");
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api(`/clients/${clientId}/review-settings`, {
        method: "PUT",
        body: { autoReplyEnabled: enabled, mode, replyBrain: brain || null, delayMinS: data?.delayMinS ?? 300, delayMaxS: data?.delayMaxS ?? 3600 },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["review-settings", clientId] }),
  });

  if (query.isPending) return <Skeleton className="h-40" />;

  return (
    <Card>
      <CardTitle>AI replies</CardTitle>
      <p className="mt-1 text-sm text-muted">1 to 3 star reviews never publish automatically. They become drafts and alert you right away.</p>
      <div className="mt-4 space-y-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="size-4 accent-primary" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          Enable AI auto-reply
        </label>
        <div>
          <Label htmlFor="replyMode">Mode</Label>
          <select id="replyMode" className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm" value={mode} onChange={(event) => setMode(event.target.value as ReviewSettings["mode"])}>
            {MODES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="brain">Reply Brain</Label>
          <Textarea id="brain" rows={3} placeholder="Brand voice, policies, do's and don'ts, sign-off" value={brain} onChange={(event) => setBrain(event.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
          {save.isSuccess && <p className="text-sm text-good">Saved.</p>}
          {save.isError && (
            <p role="alert" className="text-sm text-bad">
              {save.error.message}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
