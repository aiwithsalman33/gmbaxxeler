"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const AVATAR_TINTS = ["bg-primary-100 text-primary-800", "bg-pink-100 text-pink-800", "bg-sky-100 text-sky-800", "bg-emerald-100 text-emerald-800", "bg-amber-100 text-amber-800", "bg-indigo-100 text-indigo-800"];

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, "").trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (words[1]?.[0] ?? "")).toUpperCase();
}

/** Initials on a tint picked from the name, so each client keeps the same colour. */
export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const tint = AVATAR_TINTS[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_TINTS.length];
  const sizes = { sm: "size-7 text-2xs", md: "size-9 text-xs", lg: "size-12 text-sm" };
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", sizes[size], tint, className)}>
      {initials(name)}
    </span>
  );
}

export function Stars({ rating, size = "sm", className }: { rating: number; size?: "sm" | "md"; className?: string }) {
  const px = size === "sm" ? "size-3.5" : "size-4.5";
  return (
    <span role="img" aria-label={`${rating} out of 5 stars`} className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden className={cn(px, n <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "fill-gray-200 text-gray-200")} />
      ))}
    </span>
  );
}

const WEEKDAYS = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 7, short: "Sun", long: "Sunday" },
];

/** Toggle chips for days of the week (1 = Monday … 7 = Sunday). */
export function WeekdayChips({ value, onChange, label = "Days", disabled }: { value: number[]; onChange: (days: number[]) => void; label?: string; disabled?: boolean }) {
  const toggle = (day: number) => onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day].sort((a, b) => a - b));
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {WEEKDAYS.map((day) => {
        const on = value.includes(day.value);
        return (
          <button
            key={day.value}
            type="button"
            aria-pressed={on}
            aria-label={day.long}
            disabled={disabled}
            onClick={() => toggle(day.value)}
            className={cn(
              "h-10 min-w-12 cursor-pointer rounded-control border px-3 text-sm font-medium transition-colors focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
              on ? "border-primary bg-primary text-white shadow-sm shadow-primary/20" : "border-line-strong bg-white text-ink-soft hover:border-primary-300 hover:bg-primary-50",
            )}
          >
            {day.short}
          </button>
        );
      })}
    </div>
  );
}

export const weekdayName = (day: number) => WEEKDAYS.find((d) => d.value === day)?.short ?? "";

const QUICK_TIMES = ["09:00", "11:00", "13:00", "15:00", "18:00"];

function label12(time: string): string {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Native time input (keyboard friendly, 24h value) plus one-tap common times. */
export function TimePicker({ id, value, onChange, disabled }: { id?: string; value: string; onChange: (time: string) => void; disabled?: boolean }) {
  return (
    <div className="space-y-2">
      <input
        id={id}
        type="time"
        step={300}
        value={value}
        disabled={disabled}
        onChange={(event) => event.target.value && onChange(event.target.value)}
        className="h-10 w-full rounded-control border border-line-strong bg-white px-3 text-sm text-ink hover:border-primary-300 focus:border-primary focus:shadow-focus focus:outline-none"
      />
      <div className="flex flex-wrap gap-1.5" aria-label="Common times">
        {QUICK_TIMES.map((time) => (
          <button
            key={time}
            type="button"
            disabled={disabled}
            onClick={() => onChange(time)}
            aria-pressed={value === time}
            className={cn(
              "cursor-pointer rounded-full border px-2.5 py-0.5 text-2xs font-medium transition-colors focus-visible:shadow-focus focus-visible:outline-none",
              value === time ? "border-primary bg-primary-100 text-primary-800" : "border-line text-muted hover:bg-primary-50",
            )}
          >
            {label12(time)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Circular score, e.g. profile strength. */
export function ProgressRing({ value, size = 128, stroke = 12, label }: { value: number; size?: number; stroke?: number; label: string }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const tone = clamped >= 80 ? "#15803d" : clamped >= 50 ? "#7c3aed" : "#d97706";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${clamped} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#ede9fe" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-ink tabular-nums">{clamped}</span>
        <span className="text-2xs font-medium text-muted">of 100</span>
      </div>
    </div>
  );
}

/** Thin horizontal progress bar. */
export function ProgressBar({ value, className, label }: { value: number; className?: string; label: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100} className={cn("h-1.5 overflow-hidden rounded-full bg-primary-100", className)}>
      <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${clamped}%` }} />
    </div>
  );
}
