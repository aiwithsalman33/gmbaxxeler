import { describe, expect, it } from "vitest";
import { computeProfileStrength } from "./profile-strength";

const now = new Date("2026-06-15T00:00:00Z");
const full = {
  categories: 3,
  description: "x".repeat(300),
  hasHours: true,
  services: 5,
  photoCount: 20,
  lastPostAt: new Date("2026-06-10T00:00:00Z"),
  reviewReplyRate: 0.9,
  website: "https://example.com",
  attributes: 2,
};

describe("computeProfileStrength", () => {
  it("scores a complete profile 100", () => {
    expect(computeProfileStrength(full, now).score).toBe(100);
  });

  it("scores an empty profile 0 and lists every item as open", () => {
    const { score, checklist } = computeProfileStrength(
      { categories: 0, description: null, hasHours: false, services: 0, photoCount: 0, lastPostAt: null, reviewReplyRate: null, website: null, attributes: 0 },
      now,
    );
    expect(score).toBe(0);
    expect(checklist.every((item) => !item.done)).toBe(true);
  });

  it("drops the post item when the last post is stale", () => {
    const { score, checklist } = computeProfileStrength({ ...full, lastPostAt: new Date("2026-05-01T00:00:00Z") }, now);
    expect(score).toBe(85);
    expect(checklist.find((item) => item.key === "posts")?.done).toBe(false);
  });
});
