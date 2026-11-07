export type ReminderKindName = "day_2" | "day_5";

const REMINDER_DAYS: [ReminderKindName, number][] = [
  ["day_5", 5],
  ["day_2", 2],
];

/** Sends only the latest due reminder, so a long outage cannot trigger both at once. */
export function dueReminder(
  invitedAt: Date,
  sent: ReminderKindName[],
  now = new Date(),
): ReminderKindName | null {
  const ageDays = (now.getTime() - invitedAt.getTime()) / 86_400_000;
  for (const [kind, days] of REMINDER_DAYS) {
    if (ageDays >= days) return sent.includes(kind) ? null : kind;
  }
  return null;
}
