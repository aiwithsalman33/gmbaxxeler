"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";
import { CTA_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface SeoScheduleResponse {
  schedule: { weekdays: number[]; localTime: string; timezone: string; countPerDay: number; enabled: boolean } | null;
  timezone: string;
  seoMode: "auto" | "draft";
  draftLeadHours: number;
  ctaType: string;
  ctaUrl: string | null;
}

const DAYS = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [7, "Sun"],
] as const;

export function SeoScheduleCard({ clientId, data }: { clientId: string; data: SeoScheduleResponse }) {
  const queryClient = useQueryClient();
  const saved = data.schedule;
  const [weekdays, setWeekdays] = useState<number[]>(saved?.weekdays ?? [1, 3, 5]);
  const [localTime, setLocalTime] = useState(saved?.localTime ?? "16:00");
  const [timezone, setTimezone] = useState(saved?.timezone ?? (data.timezone === "UTC" ? Intl.DateTimeFormat().resolvedOptions().timeZone : data.timezone));
  const [countPerDay, setCountPerDay] = useState(saved?.countPerDay ?? 1);
  const [enabled, setEnabled] = useState(saved?.enabled ?? true);
  const [seoMode, setSeoMode] = useState(data.seoMode);
  const [draftLeadHours, setDraftLeadHours] = useState(data.draftLeadHours);
  const [ctaType, setCtaType] = useState(data.ctaType);
  const [ctaUrl, setCtaUrl] = useState(data.ctaUrl ?? "");

  const save = useMutation({
    mutationFn: () =>
      api(`/clients/${clientId}/seo-schedule`, {
        method: "PUT",
        body: { weekdays, localTime, timezone, countPerDay, enabled, seoMode, draftLeadHours, ctaType, ctaUrl: ctaType === "CALL" ? null : ctaUrl || null },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seo-schedule", clientId] });
      queryClient.invalidateQueries({ queryKey: ["posts", clientId] });
    },
  });

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle>Schedule</CardTitle>
        <p className="text-sm text-muted">{weekdays.length * countPerDay} posts a week</p>
      </div>
      <div role="group" aria-label="Post days" className="mt-4 flex flex-wrap gap-2">
        {DAYS.map(([day, label]) => (
          <button
            key={day}
            type="button"
            aria-pressed={weekdays.includes(day)}
            onClick={() => setWeekdays(weekdays.includes(day) ? weekdays.filter((d) => d !== day) : [...weekdays, day])}
            className={cn("h-10 w-14 cursor-pointer rounded-xl border text-sm font-medium", weekdays.includes(day) ? "border-primary bg-primary text-white" : "border-line bg-white text-muted hover:bg-lavender")}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label htmlFor="seoTime">Time</Label>
          <Input id="seoTime" type="time" value={localTime} onChange={(event) => setLocalTime(event.target.value)} />
        </div>
        <div>
          <Label htmlFor="seoTimezone">Timezone</Label>
          <Input id="seoTimezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} />
        </div>
        <div>
          <Label htmlFor="seoCount">Posts per day</Label>
          <Input id="seoCount" type="number" min={1} max={5} value={countPerDay} onChange={(event) => setCountPerDay(Number(event.target.value))} />
        </div>
        <div>
          <Label htmlFor="seoMode">Publishing</Label>
          <select id="seoMode" className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm" value={seoMode} onChange={(event) => setSeoMode(event.target.value as "auto" | "draft")}>
            <option value="draft">Drafts for approval</option>
            <option value="auto">Auto-publish</option>
          </select>
        </div>
        {seoMode === "draft" && (
          <div>
            <Label htmlFor="lead">Write drafts (hours ahead)</Label>
            <Input id="lead" type="number" min={1} max={168} value={draftLeadHours} onChange={(event) => setDraftLeadHours(Number(event.target.value))} />
          </div>
        )}
        <div>
          <Label htmlFor="seoCta">Button</Label>
          <select id="seoCta" className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm" value={ctaType} onChange={(event) => setCtaType(event.target.value)}>
            {Object.entries(CTA_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {ctaType !== "CALL" && (
          <div>
            <Label htmlFor="seoCtaUrl">Button link</Label>
            <Input id="seoCtaUrl" type="url" placeholder="https://" value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} />
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          Schedule on
        </label>
        <Button className="ml-auto" disabled={save.isPending || weekdays.length === 0} onClick={() => save.mutate()}>
          {save.isPending ? "Saving" : "Save schedule"}
        </Button>
      </div>
      {save.isSuccess && <p className="mt-2 text-sm text-good">Schedule saved.</p>}
      {save.isError && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {save.error.message}
        </p>
      )}
    </Card>
  );
}
