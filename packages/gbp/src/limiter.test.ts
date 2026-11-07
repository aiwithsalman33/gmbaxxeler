import { describe, expect, it } from "vitest";
import { RateLimiter } from "./limiter";

describe("RateLimiter", () => {
  it("spaces calls evenly", async () => {
    const waits: number[] = [];
    const limiter = new RateLimiter(60, async (ms) => void waits.push(ms), () => 1000);
    await Promise.all([limiter.acquire(), limiter.acquire(), limiter.acquire()]);
    expect(waits).toEqual([1000, 2000]);
  });
});
