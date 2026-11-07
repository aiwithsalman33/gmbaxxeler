import { describe, expect, it } from "vitest";
import { dueReminder } from "./reminders";

const invitedAt = new Date("2026-01-01T00:00:00Z");
const at = (days: number) => new Date(invitedAt.getTime() + days * 86_400_000);

describe("dueReminder", () => {
  it("sends nothing before day 2", () => {
    expect(dueReminder(invitedAt, [], at(1.9))).toBeNull();
  });

  it("sends day 2 once", () => {
    expect(dueReminder(invitedAt, [], at(2))).toBe("day_2");
    expect(dueReminder(invitedAt, ["day_2"], at(3))).toBeNull();
  });

  it("sends day 5 after day 2", () => {
    expect(dueReminder(invitedAt, ["day_2"], at(5))).toBe("day_5");
    expect(dueReminder(invitedAt, ["day_2", "day_5"], at(9))).toBeNull();
  });

  it("skips day 2 when day 5 is already due", () => {
    expect(dueReminder(invitedAt, [], at(6))).toBe("day_5");
  });
});
