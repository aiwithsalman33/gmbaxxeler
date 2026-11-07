"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";
import { CATEGORY_LABELS, PHOTO_CATEGORIES, type PhotoSchedule } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ScheduleResponse {
  schedule: PhotoSchedule | null;
  timezone: string;
  aiRenameEnabled: boolean;
  weekly: number;
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

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function ScheduleCard({ clientId, data }: { clientId: string; data: ScheduleResponse }) {
  const queryClient = useQueryClient();
  const saved = data.schedule;
  const [weekdays, setWeekdays] = useState<number[]>(saved?.weekdays ?? [1, 3, 5]);
  const [localTime, setLocalTime] = useState(saved?.localTime ?? "10:00");
  const [timezone, setTimezone] = useState(saved?.timezone ?? (data.timezone === "UTC" ? browserZone() : data.timezone));
  const [countPerDay, setCountPerDay] = useState(saved?.countPerDay ?? 1);
  const [defaultCategory, setDefaultCategory] = useState(saved?.defaultCategory ?? "ADDITIONAL");
  const [enabled, setEnabled] = useState(saved?.enabled ?? true);
  const zones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);

  const refresh = () =>
    Promise.all(["photo-schedule", "photo-queue", "client"].map((key) => queryClient.invalidateQueries({ queryKey: [key, clientId] })));

  const save = useMutation({
    mutationFn: () =>
      api(`/clients/${clientId}/photo-schedule`, {
        method: "PUT",
        body: { weekdays, localTime, timezone, countPerDay, defaultCategory, enabled },
      }),
    onSuccess: refresh,
  });
  const toggleRename = useMutation({
    mutationFn: (aiRenameEnabled: boolean) => api(`/clients/${clientId}`, { method: "PATCH", body: { aiRenameEnabled } }),
    onSuccess: refresh,
  });

  const toggleDay = (day: number) => setWeekdays(weekdays.includes(day) ? weekdays.filter((d) => d !== day) : [...weekdays, day]);

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle>Schedule</CardTitle>
        <p className="text-sm text-muted">{weekdays.length * countPerDay} photos a week</p>
      </div>

      <div role="group" aria-label="Days" className="mt-4 flex flex-wrap gap-2">
        {DAYS.map(([day, label]) => (
          <button
            key={day}
            type="button"
            aria-pressed={weekdays.includes(day)}
            onClick={() => toggleDay(day)}
            className={cn("h-10 w-14 cursor-pointer rounded-xl border text-sm font-medium", weekdays.includes(day) ? "border-primary bg-primary text-white" : "border-line bg-white text-muted hover:bg-lavender")}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label htmlFor="time">Time</Label>
          <Input id="time" type="time" value={localTime} onChange={(event) => setLocalTime(event.target.value)} />
        </div>
        <div>
          <Label htmlFor="timezone">Timezone</Label>
          <Input id="timezone" list="timezones" value={timezone} onChange={(event) => setTimezone(event.target.value)} />
          <datalist id="timezones">
            {zones.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
        </div>
        <div>
          <Label htmlFor="count">Photos per day</Label>
          <Input id="count" type="number" min={1} max={10} value={countPerDay} onChange={(event) => setCountPerDay(Number(event.target.value))} />
        </div>
        <div>
          <Label htmlFor="category">Category</Label>
          <select id="category" className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm" value={defaultCategory} onChange={(event) => setDefaultCategory(event.target.value)}>
            {PHOTO_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          Schedule on
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={data.aiRenameEnabled} disabled={toggleRename.isPending} onChange={(event) => toggleRename.mutate(event.target.checked)} />
          Rename photos with AI
        </label>
        <Button className="ml-auto" disabled={save.isPending || weekdays.length === 0} onClick={() => save.mutate()}>
          {save.isPending ? "Saving" : "Save schedule"}
        </Button>
      </div>
      {weekdays.length === 0 && <p className="mt-2 text-sm text-muted">Choose at least one day.</p>}
      {save.isSuccess && <p className="mt-2 text-sm text-good">Schedule saved. The next 14 days are queued.</p>}
      {(save.error ?? toggleRename.error) && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {(save.error ?? toggleRename.error)?.message}
        </p>
      )}
    </Card>
  );
}
