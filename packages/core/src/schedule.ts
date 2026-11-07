import { DateTime, IANAZone } from "luxon";

export const SLOT_SPACING_MINUTES = 10;

export interface ScheduleRule {
  weekdays: number[]; // 1 is Monday, 7 is Sunday
  localTime: string; // HH:mm
  timezone: string;
  countPerDay: number;
}

export interface Slot {
  runAt: Date;
  localKey: string;
  index: number;
}

export function isValidTimezone(zone: string): boolean {
  return IANAZone.isValidZone(zone);
}

/** Times stay on the client's wall clock across daylight saving changes. */
export function expandSchedule(rule: ScheduleRule, from: Date, days = 14): Slot[] {
  const [hour, minute] = rule.localTime.split(":").map(Number) as [number, number];
  const start = DateTime.fromJSDate(from, { zone: rule.timezone });
  const end = from.getTime() + days * 86_400_000;
  const slots: Slot[] = [];

  for (let offset = 0; offset <= days; offset++) {
    const day = start.plus({ days: offset });
    if (!rule.weekdays.includes(day.weekday)) continue;
    const local = DateTime.fromObject({ year: day.year, month: day.month, day: day.day, hour, minute }, { zone: rule.timezone });
    const localKey = `${day.toISODate()}T${rule.localTime}`;
    for (let index = 0; index < rule.countPerDay; index++) {
      const runAt = local.plus({ minutes: index * SLOT_SPACING_MINUTES }).toJSDate();
      if (runAt > from && runAt.getTime() < end) slots.push({ runAt, localKey, index });
    }
  }
  return slots;
}

export function weeklyCount(rule: Pick<ScheduleRule, "weekdays" | "countPerDay">): number {
  return rule.weekdays.length * rule.countPerDay;
}
