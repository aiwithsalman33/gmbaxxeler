/** Date helpers for schedule screens. Day keys are "YYYY-MM-DD" in the schedule's timezone. */

const SHORT_DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function safeZone(timeZone: string): string | undefined {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return timeZone;
  } catch {
    return undefined;
  }
}

export function dayKey(value: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: safeZone(timeZone), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

/** Noon UTC on the key's date, so arithmetic never crosses a day boundary. */
const keyDate = (key: string) => new Date(`${key}T12:00:00Z`);

export function addDays(key: string, days: number): string {
  const date = keyDate(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(key: string): number {
  return keyDate(key).getUTCDay() || 7;
}

export function formatTime(value: string, timeZone: string): string {
  return new Date(value).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", timeZone: safeZone(timeZone) });
}

export function formatDay(key: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  return keyDate(key).toLocaleDateString("en", { ...opts, timeZone: "UTC" });
}

export function dayHeading(key: string, today: string): string {
  if (key === today) return `Today · ${formatDay(key, { day: "numeric", month: "short" })}`;
  if (key === addDays(today, 1)) return `Tomorrow · ${formatDay(key, { day: "numeric", month: "short" })}`;
  return formatDay(key, { weekday: "long", day: "numeric", month: "short" });
}

export function formatDayTime(value: string, timeZone: string): string {
  return new Date(value).toLocaleString("en", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: safeZone(timeZone) });
}

export function time12(time: string): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function describeDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return "every day";
  if (sorted.join() === "1,2,3,4,5") return "weekdays";
  if (sorted.join() === "6,7") return "weekends";
  return sorted.map((d) => SHORT_DAYS[d]).join(", ");
}

/** "3 photos a week · Mon, Wed, Fri at 10:00 AM Asia/Kolkata" */
export function scheduleSummary({ noun, weekdays, countPerDay, localTime, timezone }: { noun: [string, string]; weekdays: number[]; countPerDay: number; localTime: string; timezone: string }): string {
  if (weekdays.length === 0) return "Pick at least one day";
  const weekly = weekdays.length * countPerDay;
  const perDay = countPerDay > 1 ? ` · ${countPerDay} a day` : "";
  const days = describeDays(weekdays);
  return `${weekly} ${weekly === 1 ? noun[0] : noun[1]} a week${perDay} · ${days.charAt(0).toUpperCase()}${days.slice(1)} at ${time12(localTime)} ${timezone}`;
}
