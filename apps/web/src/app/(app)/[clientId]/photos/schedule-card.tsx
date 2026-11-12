"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CountField, DaysField, ScheduleFrame, TimeField, TimezoneField, countValid } from "@/components/schedule/schedule-form";
import { browserZone, scheduleSummary } from "@/components/schedule/utils";
import { Field, Select, Switch } from "@/components/ui/input";
import { toast, toastError } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { CATEGORY_LABELS, PHOTO_CATEGORIES, type PhotoSchedule } from "@/lib/types";
import type { Readiness } from "@/lib/types";

export interface ScheduleResponse {
  schedule: PhotoSchedule | null;
  timezone: string;
  aiRenameEnabled: boolean;
  weekly: number;
  readiness?: Readiness;
}

export function ScheduleCard({ clientId, data }: { clientId: string; data: ScheduleResponse }) {
  const queryClient = useQueryClient();
  const saved = data.schedule;
  const [weekdays, setWeekdays] = useState<number[]>(saved?.weekdays ?? [1, 3, 5]);
  const [localTime, setLocalTime] = useState(saved?.localTime ?? "10:00");
  const [timezone, setTimezone] = useState(saved?.timezone ?? (data.timezone === "UTC" ? browserZone() : data.timezone));
  const [countPerDay, setCountPerDay] = useState(saved?.countPerDay ?? 1);
  const [defaultCategory, setDefaultCategory] = useState(saved?.defaultCategory ?? "ADDITIONAL");
  const [enabled, setEnabled] = useState(saved?.enabled ?? true);

  const refresh = () =>
    Promise.all(["photo-schedule", "photo-queue", "client"].map((key) => queryClient.invalidateQueries({ queryKey: [key, clientId] })));

  const body = { weekdays, localTime, timezone, countPerDay, defaultCategory, enabled };
  const save = useMutation({
    mutationFn: () => api(`/clients/${clientId}/photo-schedule`, { method: "PUT", body }),
    onSuccess: () => {
      toast.success("Schedule saved", { description: enabled ? "The next 14 days of uploads are queued." : "The schedule is paused." });
      return refresh();
    },
    onError: (error) => toastError(error),
  });
  const toggleRename = useMutation({
    mutationFn: (aiRenameEnabled: boolean) => api(`/clients/${clientId}`, { method: "PATCH", body: { aiRenameEnabled } }),
    onSuccess: (_, on) => {
      toast.success(on ? "AI renaming is on" : "AI renaming is off");
      return refresh();
    },
    onError: (error) => toastError(error),
  });

  const dirty =
    !saved ||
    JSON.stringify(body) !==
      JSON.stringify({ weekdays: saved.weekdays, localTime: saved.localTime, timezone: saved.timezone, countPerDay: saved.countPerDay, defaultCategory: saved.defaultCategory, enabled: saved.enabled });
  const valid = weekdays.length > 0 && countValid(countPerDay, 1, 10);
  const renameOn = toggleRename.isPending ? toggleRename.variables : data.aiRenameEnabled;

  return (
    <ScheduleFrame
      title="Upload schedule"
      description="Photos from the Photos folder are uploaded to Google on these days."
      enabled={enabled}
      onEnabledChange={setEnabled}
      summary={scheduleSummary({ noun: ["photo", "photos"], weekdays, countPerDay: countValid(countPerDay, 1, 10) ? countPerDay : 1, localTime, timezone })}
      dirty={dirty}
      saving={save.isPending}
      canSave={valid && !save.isPending}
      onSave={() => save.mutate()}
    >
      <DaysField label="Upload days" value={weekdays} onChange={setWeekdays} />
      <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
        <TimeField value={localTime} onChange={setLocalTime} />
        <TimezoneField value={timezone} onChange={setTimezone} />
        <CountField label="Photos per day" value={countPerDay} onChange={setCountPerDay} min={1} max={10} />
        <Field label="Google category" hint="Used unless you change it on an upload.">
          {(props) => (
            <Select {...props} value={defaultCategory} onChange={(event) => setDefaultCategory(event.target.value)}>
              {PHOTO_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className="rounded-xl border border-line bg-surface p-4">
        <Switch
          checked={renameOn}
          disabled={toggleRename.isPending}
          onChange={(on) => toggleRename.mutate(on)}
          label="Rename photos with AI"
          description="Gives each file a descriptive, search-friendly name before upload. Saves right away."
        />
      </div>
    </ScheduleFrame>
  );
}
