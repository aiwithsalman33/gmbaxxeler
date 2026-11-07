export const IMPRESSION_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
] as const;

/** Names verified against Google's DailyMetric enum. */
export const DAILY_METRICS = [
  ...IMPRESSION_METRICS,
  "CALL_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
  "WEBSITE_CLICKS",
] as const;

export type DailyMetricName = (typeof DAILY_METRICS)[number];

export interface MetricRow {
  date: string; // YYYY-MM-DD
  metric: string;
  value: number;
}

export interface DashboardPoint {
  date: string;
  views: number;
  calls: number;
  directions: number;
  websiteClicks: number;
}

export type Totals = Omit<DashboardPoint, "date">;

export interface MetricSummary {
  current: Totals;
  previous: Totals;
  series: DashboardPoint[];
  rangeStart: string | null;
  rangeEnd: string | null;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return isoDate(next);
}

export function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/**
 * Google omits zero values, so gaps are real zeros, but only up to the last date
 * with any data. Later dates are reporting lag and must stay absent.
 */
export function fillZeroGaps(rows: MetricRow[], start: string): MetricRow[] {
  if (rows.length === 0) return [];
  const lastDate = rows.reduce((max, row) => (row.date > max ? row.date : max), start);
  const known = new Set(rows.map((row) => `${row.date}|${row.metric}`));
  const filled = [...rows];
  for (const date of datesBetween(start, lastDate)) {
    for (const metric of DAILY_METRICS) {
      if (!known.has(`${date}|${metric}`)) filled.push({ date, metric, value: 0 });
    }
  }
  return filled;
}

function emptyTotals(): Totals {
  return { views: 0, calls: 0, directions: 0, websiteClicks: 0 };
}

function apply(target: Totals, metric: string, value: number): void {
  if ((IMPRESSION_METRICS as readonly string[]).includes(metric)) target.views += value;
  else if (metric === "CALL_CLICKS") target.calls += value;
  else if (metric === "BUSINESS_DIRECTION_REQUESTS") target.directions += value;
  else if (metric === "WEBSITE_CLICKS") target.websiteClicks += value;
}

/** Windows end at the latest date with data, so both periods are complete days. */
export function summarizeMetrics(rows: MetricRow[], rangeDays: number): MetricSummary {
  const rangeEnd = rows.reduce<string | null>((max, row) => (!max || row.date > max ? row.date : max), null);
  const current = emptyTotals();
  const previous = emptyTotals();
  if (!rangeEnd) return { current, previous, series: [], rangeStart: null, rangeEnd: null };

  const rangeStart = addDays(rangeEnd, -(rangeDays - 1));
  const previousStart = addDays(rangeStart, -rangeDays);
  const byDate = new Map(datesBetween(rangeStart, rangeEnd).map((date) => [date, emptyTotals()]));

  for (const { date, metric, value } of rows) {
    if (date >= rangeStart) {
      apply(current, metric, value);
      const point = byDate.get(date);
      if (point) apply(point, metric, value);
    } else if (date >= previousStart) {
      apply(previous, metric, value);
    }
  }
  const series = [...byDate].map(([date, totals]) => ({ date, ...totals }));
  return { current, previous, series, rangeStart, rangeEnd };
}
