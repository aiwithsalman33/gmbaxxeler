import { describe, expect, it } from "vitest";
import { fillZeroGaps, summarizeMetrics, type MetricRow } from "./metrics";

describe("fillZeroGaps", () => {
  it("fills omitted zeros but does not invent days after the last data point", () => {
    const rows: MetricRow[] = [{ date: "2026-01-03", metric: "CALL_CLICKS", value: 2 }];
    const filled = fillZeroGaps(rows, "2026-01-01");
    expect(filled.some((r) => r.date === "2026-01-01" && r.metric === "WEBSITE_CLICKS" && r.value === 0)).toBe(true);
    expect(filled.some((r) => r.date > "2026-01-03")).toBe(false);
  });

  it("returns nothing when Google has no data at all", () => {
    expect(fillZeroGaps([], "2026-01-01")).toEqual([]);
  });
});

describe("summarizeMetrics", () => {
  const rows: MetricRow[] = [
    { date: "2026-01-14", metric: "BUSINESS_IMPRESSIONS_MOBILE_MAPS", value: 10 },
    { date: "2026-01-14", metric: "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", value: 5 },
    { date: "2026-01-14", metric: "CALL_CLICKS", value: 3 },
    { date: "2026-01-08", metric: "WEBSITE_CLICKS", value: 1 },
    { date: "2026-01-07", metric: "BUSINESS_IMPRESSIONS_MOBILE_SEARCH", value: 7 },
    { date: "2025-12-31", metric: "BUSINESS_IMPRESSIONS_MOBILE_SEARCH", value: 100 },
  ];

  it("sums Search and Maps into views and splits the two periods", () => {
    const summary = summarizeMetrics(rows, 7);
    expect(summary.rangeStart).toBe("2026-01-08");
    expect(summary.current).toEqual({ views: 15, calls: 3, directions: 0, websiteClicks: 1 });
    expect(summary.previous.views).toBe(7);
    expect(summary.series).toHaveLength(7);
  });

  it("handles a client with no data", () => {
    expect(summarizeMetrics([], 28)).toMatchObject({ series: [], rangeEnd: null });
  });
});
