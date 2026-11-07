import { describe, expect, it } from "vitest";
import { expandSchedule, isValidTimezone, weeklyCount } from "./schedule";

const rule = { weekdays: [1, 3, 5], localTime: "16:00", timezone: "Asia/Kolkata", countPerDay: 1 };

describe("expandSchedule", () => {
  it("creates Mon/Wed/Fri slots at 4 PM client time", () => {
    const slots = expandSchedule(rule, new Date("2026-06-01T00:00:00Z"));
    expect(slots).toHaveLength(6);
    expect(slots[0]!.runAt.toISOString()).toBe("2026-06-01T10:30:00.000Z");
    expect(slots[0]!.localKey).toBe("2026-06-01T16:00");
  });

  it("uses the client's weekday, not UTC's", () => {
    const sundayNight = new Date("2026-06-07T20:00:00Z"); // Already Monday in India
    const [first] = expandSchedule({ ...rule, weekdays: [1], localTime: "09:00" }, sundayNight);
    expect(first!.localKey).toBe("2026-06-08T09:00");
    expect(first!.runAt.toISOString()).toBe("2026-06-08T03:30:00.000Z");
  });

  it("supports several photos a day, spaced apart", () => {
    const slots = expandSchedule({ ...rule, weekdays: [1, 2, 3, 4], countPerDay: 2 }, new Date("2026-06-01T00:00:00Z"), 7);
    expect(slots).toHaveLength(8);
    expect(slots[1]!.runAt.getTime() - slots[0]!.runAt.getTime()).toBe(10 * 60_000);
    expect(new Set(slots.map((s) => `${s.localKey}:${s.index}`)).size).toBe(8);
  });

  it("skips slots already in the past", () => {
    const afterSlot = new Date("2026-06-01T11:00:00Z");
    expect(expandSchedule(rule, afterSlot)[0]!.localKey).toBe("2026-06-03T16:00");
  });

  it("keeps wall-clock time across daylight saving", () => {
    const slots = expandSchedule({ ...rule, weekdays: [7], localTime: "09:00", timezone: "America/New_York" }, new Date("2026-03-01T20:00:00Z"));
    expect(slots.map((s) => s.runAt.toISOString())).toEqual(["2026-03-08T13:00:00.000Z", "2026-03-15T13:00:00.000Z"]);
  });

  it("moves a time that doesn't exist on the spring-forward day", () => {
    const [slot] = expandSchedule({ ...rule, weekdays: [7], localTime: "02:30", timezone: "America/New_York" }, new Date("2026-03-08T00:00:00Z"), 1);
    expect(slot!.runAt.toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("creates one slot on the repeated hour in autumn", () => {
    const slots = expandSchedule({ ...rule, weekdays: [7], localTime: "01:30", timezone: "America/New_York" }, new Date("2026-11-01T00:00:00Z"), 1);
    expect(slots).toHaveLength(1);
  });

  it("gives the same slots on a repeat run, so idempotency keys match", () => {
    const from = new Date("2026-06-01T00:00:00Z");
    expect(expandSchedule(rule, from)).toEqual(expandSchedule(rule, from));
  });
});

describe("helpers", () => {
  it("counts per week", () => {
    expect(weeklyCount({ weekdays: [1, 2, 3, 4], countPerDay: 2 })).toBe(8);
  });

  it("validates timezones", () => {
    expect(isValidTimezone("Asia/Kolkata")).toBe(true);
    expect(isValidTimezone("Mars/Base")).toBe(false);
  });
});
