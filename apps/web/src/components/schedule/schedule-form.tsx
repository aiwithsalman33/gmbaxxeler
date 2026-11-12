"use client";

import { CalendarClock, CalendarDays, Minus, Plus, Save } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Select, Switch } from "@/components/ui/input";
import { TimePicker, WeekdayChips } from "@/components/ui/widgets";
import { cn } from "@/lib/utils";
import { browserZone } from "./utils";

/** The frame both schedule builders share: header with on/off switch, body, and a footer with summary and Save. */
export function ScheduleFrame({
  title,
  description,
  enabled,
  onEnabledChange,
  summary,
  dirty,
  saving,
  canSave,
  onSave,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onEnabledChange: (on: boolean) => void;
  summary: string;
  dirty: boolean;
  saving: boolean;
  canSave: boolean;
  onSave: () => void;
  children: ReactNode;
}) {
  return (
    <Card className="p-0 sm:p-0">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) onSave();
        }}
      >
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <CardHeader
            icon={CalendarClock}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {title}
                <Badge tone={enabled ? "good" : "neutral"} dot>
                  {enabled ? "On" : "Paused"}
                </Badge>
              </span>
            }
            description={description}
            actions={<Switch checked={enabled} onChange={onEnabledChange} label="Schedule on" />}
          />
          <div className="space-y-6 pb-6">{children}</div>
        </div>
        <div className="flex flex-col gap-3 rounded-b-card border-t border-line bg-lavender/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-start gap-2.5">
            <CalendarDays className={cn("mt-0.5 size-4 shrink-0", enabled ? "text-primary" : "text-subtle")} aria-hidden />
            <p className="min-w-0 text-sm" aria-live="polite">
              <span className={cn("font-medium", enabled ? "text-ink" : "text-muted")}>{enabled ? summary : `Paused · ${summary}`}</span>
              {dirty && <span className="ml-2 inline-block text-xs font-medium text-warn">Unsaved changes</span>}
            </p>
          </div>
          <Button type="submit" loading={saving} disabled={!canSave} className="w-full shrink-0 sm:w-auto">
            {!saving && <Save aria-hidden />}
            {saving ? "Saving" : "Save schedule"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function DaysField({ value, onChange, label }: { value: number[]; onChange: (days: number[]) => void; label: string }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-ink">{label}</legend>
      <WeekdayChips value={value} onChange={onChange} label={label} />
      {value.length === 0 && (
        <p role="alert" className="mt-2 text-xs text-bad">
          Choose at least one day.
        </p>
      )}
    </fieldset>
  );
}

export function TimeField({ value, onChange }: { value: string; onChange: (time: string) => void }) {
  return <Field label="Time">{({ id }) => <TimePicker id={id} value={value} onChange={onChange} />}</Field>;
}

export function TimezoneField({ value, onChange }: { value: string; onChange: (zone: string) => void }) {
  const zones = useMemo(() => {
    const list = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return list.includes(value) ? list : [value, ...list];
  }, [value]);
  const local = typeof window === "undefined" ? null : browserZone();
  return (
    <Field
      label="Timezone"
      hint="Times in the queue use this timezone."
      action={
        local && local !== value ? (
          <button type="button" onClick={() => onChange(local)} className="cursor-pointer rounded text-xs font-medium text-primary hover:underline focus-visible:shadow-focus focus-visible:outline-none">
            Use mine
          </button>
        ) : undefined
      }
    >
      {(props) => (
        <Select {...props} value={value} onChange={(event) => onChange(event.target.value)}>
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll("_", " ")}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

/** Number input with − / + buttons. */
export function CountField({ label, value, onChange, min, max, hint }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; hint?: string }) {
  const error = !Number.isInteger(value) || value < min || value > max ? `Use a number from ${min} to ${max}.` : null;
  return (
    <Field label={label} hint={hint} error={error}>
      {(props) => (
        <div className="flex h-10 w-full max-w-44 items-stretch overflow-hidden rounded-control border border-line-strong bg-surface focus-within:border-primary focus-within:shadow-focus">
          <button type="button" aria-label={`Fewer: ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} className="flex w-10 cursor-pointer items-center justify-center text-muted hover:bg-primary-50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">
            <Minus className="size-4" aria-hidden />
          </button>
          <input
            {...props}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            value={Number.isNaN(value) ? "" : value}
            onChange={(event) => onChange(event.target.valueAsNumber)}
            className="w-full min-w-0 [appearance:textfield] border-x border-line bg-surface text-center text-sm font-semibold text-ink tabular-nums focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button type="button" aria-label={`More: ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, (Number.isNaN(value) ? min - 1 : value) + 1))} className="flex w-10 cursor-pointer items-center justify-center text-muted hover:bg-primary-50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </Field>
  );
}

export const countValid = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;
