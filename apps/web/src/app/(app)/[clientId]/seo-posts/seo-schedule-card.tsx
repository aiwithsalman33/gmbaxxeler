"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Send } from "lucide-react";
import { useState } from "react";
import { CountField, DaysField, ScheduleFrame, TimeField, TimezoneField, countValid } from "@/components/schedule/schedule-form";
import { browserZone, scheduleSummary } from "@/components/schedule/utils";
import { Field, Input, Select } from "@/components/ui/input";
import { toast, toastError } from "@/components/ui/toast";
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
  readiness?: import("@/lib/types").Readiness;
}

const MODES = [
  { value: "draft", icon: CheckCircle2, title: "Drafts for approval", body: "AI writes each post ahead of time. You approve it before it goes live." },
  { value: "auto", icon: Send, title: "Auto-publish", body: "AI writes and publishes each post on schedule, no review needed." },
] as const;

const isUrl = (value: string) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

export function SeoScheduleCard({ clientId, data }: { clientId: string; data: SeoScheduleResponse }) {
  const queryClient = useQueryClient();
  const saved = data.schedule;
  const [weekdays, setWeekdays] = useState<number[]>(saved?.weekdays ?? [1, 3, 5]);
  const [localTime, setLocalTime] = useState(saved?.localTime ?? "16:00");
  const [timezone, setTimezone] = useState(saved?.timezone ?? (data.timezone === "UTC" ? browserZone() : data.timezone));
  const [countPerDay, setCountPerDay] = useState(saved?.countPerDay ?? 1);
  const [enabled, setEnabled] = useState(saved?.enabled ?? true);
  const [seoMode, setSeoMode] = useState(data.seoMode);
  const [draftLeadHours, setDraftLeadHours] = useState(data.draftLeadHours);
  const [ctaType, setCtaType] = useState(data.ctaType);
  const [ctaUrl, setCtaUrl] = useState(data.ctaUrl ?? "");

  const body = { weekdays, localTime, timezone, countPerDay, enabled, seoMode, draftLeadHours, ctaType, ctaUrl: ctaType === "CALL" ? null : ctaUrl || null };
  const save = useMutation({
    mutationFn: () => api(`/clients/${clientId}/seo-schedule`, { method: "PUT", body }),
    onSuccess: () => {
      toast.success("Schedule saved", { description: enabled ? "Upcoming posts for the next 14 days are queued." : "The schedule is paused." });
      queryClient.invalidateQueries({ queryKey: ["seo-schedule", clientId] });
      queryClient.invalidateQueries({ queryKey: ["posts", clientId] });
    },
    onError: (error) => toastError(error),
  });

  const urlError = ctaType === "CALL" ? null : !ctaUrl ? "Add the link for this button." : !isUrl(ctaUrl) ? "Use a full link starting with https://" : null;
  const dirty =
    !saved ||
    JSON.stringify(body) !==
      JSON.stringify({
        weekdays: saved.weekdays,
        localTime: saved.localTime,
        timezone: saved.timezone,
        countPerDay: saved.countPerDay,
        enabled: saved.enabled,
        seoMode: data.seoMode,
        draftLeadHours: data.draftLeadHours,
        ctaType: data.ctaType,
        ctaUrl: data.ctaType === "CALL" ? null : data.ctaUrl || null,
      });
  const valid = weekdays.length > 0 && countValid(countPerDay, 1, 5) && (seoMode === "auto" || countValid(draftLeadHours, 1, 168)) && !urlError;

  return (
    <ScheduleFrame
      title="Post schedule"
      description="AI writes Google posts from this client's knowledge base and SEO Post Images folder."
      enabled={enabled}
      onEnabledChange={setEnabled}
      summary={scheduleSummary({ noun: ["post", "posts"], weekdays, countPerDay: countValid(countPerDay, 1, 5) ? countPerDay : 1, localTime, timezone })}
      dirty={dirty}
      saving={save.isPending}
      canSave={valid && !save.isPending}
      onSave={() => save.mutate()}
    >
      <DaysField label="Post days" value={weekdays} onChange={setWeekdays} />
      <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
        <TimeField value={localTime} onChange={setLocalTime} />
        <TimezoneField value={timezone} onChange={setTimezone} />
        <CountField label="Posts per day" value={countPerDay} onChange={setCountPerDay} min={1} max={5} />
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">Publishing</legend>
        <div role="radiogroup" aria-label="Publishing" className="grid gap-3 sm:grid-cols-2">
          {MODES.map(({ value, icon: Icon, title, body: text }) => {
            const on = seoMode === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setSeoMode(value)}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-left transition-[border-color,box-shadow,background-color] focus-visible:shadow-focus focus-visible:outline-none",
                  on ? "border-primary bg-primary-50 ring-1 ring-primary" : "border-line-strong bg-white hover:border-primary-300",
                )}
              >
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", on ? "bg-primary text-white" : "bg-primary-50 text-primary")}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{title}</span>
                  <span className="mt-0.5 block text-xs text-muted">{text}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
        {seoMode === "draft" && <CountField label="Write drafts ahead (hours)" hint="Time you have to review each post." value={draftLeadHours} onChange={setDraftLeadHours} min={1} max={168} />}
        <Field label="Post button">
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
          <p className="self-center rounded-xl bg-lavender px-4 py-3 text-xs text-muted sm:self-end">Call buttons use the phone number on the Google profile.</p>
        ) : (
          <Field label="Button link" error={ctaUrl ? urlError : null} hint={!ctaUrl ? "Required for this button." : undefined}>
            {(props) => <Input {...props} type="url" inputMode="url" placeholder="https://" value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} />}
          </Field>
        )}
      </div>
    </ScheduleFrame>
  );
}
