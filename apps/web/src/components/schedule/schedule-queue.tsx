"use client";

import { ImageOff } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { addDays, dayHeading, dayKey, formatDay, formatTime, isoWeekday } from "./utils";

export interface QueueItem {
  id: string;
  runAt: string;
  thumb?: string | null;
  thumbAlt?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Status badge plus any small labels. */
  badges?: ReactNode;
  /** Per-item buttons, shown on the right of the row. */
  actions?: ReactNode;
  /** Opens the item from the calendar. */
  onOpen?: () => void;
  /** Accent for the calendar chip. */
  accent?: "warn" | "bad";
  /** Short text for the calendar chip and its accessible name. */
  label: string;
}

type View = "list" | "calendar";
const VIEWS: { value: View; label: string }[] = [
  { value: "list", label: "List" },
  { value: "calendar", label: "Calendar" },
];

export function Thumb({ src, alt, size = "md" }: { src?: string | null; alt?: string; size?: "sm" | "md" }) {
  const [broken, setBroken] = useState<string | null>(null);
  const box = size === "sm" ? "size-6 rounded-md" : "size-12 rounded-xl";
  if (src && broken !== src) return <img src={src} alt={alt ?? ""} loading="lazy" onError={() => setBroken(src)} className={cn(box, "shrink-0 bg-lavender object-cover ring-1 ring-line")} />;
  return (
    <span aria-hidden className={cn(box, "flex shrink-0 items-center justify-center bg-lavender text-subtle ring-1 ring-line")}>
      <ImageOff className={size === "sm" ? "size-3" : "size-5"} />
    </span>
  );
}

/** Upcoming items for the next two weeks, as a day-grouped list or a Mon–Sun calendar (list only on phones). */
export function ScheduleQueue({ items, timezone, toolbar, note }: { items: QueueItem[]; timezone: string; toolbar?: ReactNode; note?: ReactNode }) {
  const [view, setView] = useState<View>("list");
  const today = dayKey(new Date(), timezone);
  const groups = useMemo(() => {
    const map = new Map<string, QueueItem[]>();
    for (const item of items) {
      const key = dayKey(item.runAt, timezone);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [items, timezone]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="hidden md:block">
            <Segmented label="Queue view" value={view} onChange={setView} options={VIEWS} />
          </div>
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">{items.length}</span> coming up · times in {timezone}
          </p>
        </div>
        {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
      </div>
      {note}
      <div className={cn(view === "calendar" && "md:hidden")}>
        <QueueList groups={groups} today={today} timezone={timezone} />
      </div>
      {view === "calendar" && (
        <div className="hidden md:block">
          <QueueCalendar groups={groups} today={today} timezone={timezone} />
        </div>
      )}
    </div>
  );
}

function QueueList({ groups, today, timezone }: { groups: Map<string, QueueItem[]>; today: string; timezone: string }) {
  return (
    <Card className="overflow-hidden p-0 sm:p-0">
      {[...groups.entries()].map(([key, dayItems]) => (
        <section key={key} aria-label={dayHeading(key, today)} className="border-b border-line last:border-b-0">
          <h3 className="flex items-center justify-between gap-2 bg-lavender/60 px-5 py-2 text-xs font-semibold text-ink-soft sm:px-6">
            <span className={cn(key === today && "text-primary-700")}>{dayHeading(key, today)}</span>
            <span className="font-medium text-muted">{dayItems.length}</span>
          </h3>
          <ul className="divide-y divide-line">
            {dayItems.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-5 py-3.5 sm:gap-4 sm:px-6">
                <time dateTime={item.runAt} className="hidden w-[4.5rem] shrink-0 text-sm font-semibold text-ink tabular-nums sm:block">
                  {formatTime(item.runAt, timezone)}
                </time>
                <Thumb src={item.thumb} alt={item.thumbAlt} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-ink tabular-nums sm:hidden">{formatTime(item.runAt, timezone)}</p>
                  <div className="truncate text-sm font-medium text-ink">{item.title}</div>
                  {item.subtitle && <div className="truncate text-xs text-muted">{item.subtitle}</div>}
                  {item.badges && <div className="mt-1.5 flex flex-wrap items-center gap-1.5 lg:hidden">{item.badges}</div>}
                </div>
                {item.badges && <div className="hidden shrink-0 flex-wrap items-center justify-end gap-1.5 lg:flex">{item.badges}</div>}
                {item.actions && <div className="flex shrink-0 items-center gap-1">{item.actions}</div>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Card>
  );
}

const WEEK_HEAD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 3;

function QueueCalendar({ groups, today, timezone }: { groups: Map<string, QueueItem[]>; today: string; timezone: string }) {
  const start = addDays(today, 1 - isoWeekday(today));
  const lastKey = [...groups.keys()].sort().at(-1) ?? today;
  const windowEnd = addDays(today, 13);
  const end = lastKey > windowEnd ? lastKey : windowEnd;
  const days: string[] = [];
  for (let key = start; key <= end && days.length < 42; key = addDays(key, 1)) days.push(key);
  while (days.length % 7 !== 0) days.push(addDays(days.at(-1)!, 1));
  const later = [...groups.entries()].filter(([key]) => key > days.at(-1)!).reduce((sum, [, list]) => sum + list.length, 0);

  return (
    <Card className="overflow-hidden p-0 sm:p-0">
      <div className="grid grid-cols-7 border-b border-line bg-lavender/60">
        {WEEK_HEAD.map((day) => (
          <div key={day} className="px-3 py-2 text-xs font-semibold tracking-wide text-muted uppercase">
            {day}
          </div>
        ))}
      </div>
      <ol className="grid grid-cols-7">
        {days.map((key, index) => {
          const dayItems = groups.get(key) ?? [];
          const outside = key < today || key > end;
          const isToday = key === today;
          const firstOfMonth = key.endsWith("-01") || index === 0;
          return (
            <li
              key={key}
              aria-label={`${formatDay(key, { weekday: "long", day: "numeric", month: "long" })}: ${dayItems.length} scheduled`}
              className={cn("min-h-32 border-line p-2", index % 7 !== 6 && "border-r", index < days.length - 7 && "border-b", outside && "bg-lavender/40")}
            >
              <div className="mb-1.5 flex items-center justify-between gap-1">
                <span className={cn("inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums", isToday ? "bg-primary text-white" : outside ? "text-subtle" : "text-ink-soft")}>
                  {Number(key.slice(8))}
                </span>
                {firstOfMonth && <span className="text-2xs font-medium text-subtle">{formatDay(key, { month: "short" })}</span>}
              </div>
              <ul className="space-y-1">
                {dayItems.slice(0, MAX_CHIPS).map((item) => {
                  const chip = (
                    <>
                      <Thumb src={item.thumb} alt="" size="sm" />
                      <span className="min-w-0 leading-tight">
                        <span className="block font-semibold tabular-nums">{formatTime(item.runAt, timezone)}</span>
                        <span className="block truncate text-muted">{item.label}</span>
                      </span>
                    </>
                  );
                  const style = cn(
                    "flex w-full items-center gap-1.5 rounded-lg border-l-2 bg-primary-50 px-1.5 py-1 text-left text-2xs text-ink",
                    item.accent === "warn" ? "border-amber-500 bg-warn-soft" : item.accent === "bad" ? "border-red-600 bg-bad-soft" : "border-primary",
                  );
                  return (
                    <li key={item.id}>
                      {item.onOpen ? (
                        <button type="button" onClick={item.onOpen} title={item.label} className={cn(style, "cursor-pointer hover:bg-primary-100 focus-visible:shadow-focus focus-visible:outline-none")}>
                          {chip}
                        </button>
                      ) : (
                        <div className={style}>{chip}</div>
                      )}
                    </li>
                  );
                })}
                {dayItems.length > MAX_CHIPS && <li className="px-1.5 text-2xs font-medium text-muted">+{dayItems.length - MAX_CHIPS} more</li>}
              </ul>
            </li>
          );
        })}
      </ol>
      {later > 0 && <p className="border-t border-line px-4 py-2.5 text-xs text-muted">{later} more scheduled later. Switch to List to see them.</p>}
    </Card>
  );
}
