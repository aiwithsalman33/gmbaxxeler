"use client";

import { Eye, MousePointerClick, Navigation, Phone, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import type { Dashboard, Totals } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

export type MetricKey = keyof Totals;

export const METRICS: { key: MetricKey; label: string; icon: LucideIcon }[] = [
  { key: "views", label: "Total views", icon: Eye },
  { key: "calls", label: "Calls", icon: Phone },
  { key: "directions", label: "Direction requests", icon: Navigation },
  { key: "websiteClicks", label: "Website clicks", icon: MousePointerClick },
];

const shortDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en", { day: "numeric", month: "short", timeZone: "UTC" });

/** One metric at a time: views run far higher than calls, and a shared axis would flatten calls. */
export function MetricChart({ metric, series }: { metric: MetricKey; series: Dashboard["metrics"]["series"] }) {
  const [asTable, setAsTable] = useState(false);
  const label = METRICS.find((item) => item.key === metric)?.label ?? "";

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>{label} per day</CardTitle>
          <p className="mt-0.5 text-sm text-muted">Pick a metric card above to change the chart</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setAsTable(!asTable)} aria-pressed={asTable}>
          {asTable ? "Show chart" : "Show table"}
        </Button>
      </div>
      {asTable ? (
        <div className="h-72 overflow-y-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-lavender">
              <tr className="text-left text-xs text-muted uppercase">
                <th scope="col" className="px-4 py-2 font-semibold">
                  Date
                </th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">
                  {label}
                </th>
              </tr>
            </thead>
            <tbody>
              {series.map((point) => (
                <tr key={point.date} className="border-t border-line">
                  <td className="px-4 py-2">{shortDate(point.date)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatNumber(point[metric])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-72" role="img" aria-label={`${label} per day chart`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="metricFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" style={{ stopColor: "var(--color-primary)", stopOpacity: 0.28 }} />
                  <stop offset="100%" style={{ stopColor: "var(--color-accent)", stopOpacity: 0 }} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="4 4" />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 12, fill: "var(--color-muted)" }} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis tick={{ fontSize: 12, fill: "var(--color-muted)" }} tickLine={false} axisLine={false} allowDecimals={false} width={48} />
              <Tooltip
                labelFormatter={(date) => shortDate(String(date))}
                formatter={(value) => [formatNumber(Number(value)), label]}
                cursor={{ stroke: "var(--color-primary-300)", strokeWidth: 1 }}
                contentStyle={{ borderRadius: 12, border: "1px solid var(--color-line)", background: "var(--color-surface)", color: "var(--color-ink)", fontSize: 13, boxShadow: "var(--shadow-raised)" }}
              />
              <Area type="monotone" dataKey={metric} stroke="var(--color-primary)" strokeWidth={2.5} fill="url(#metricFill)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--color-surface)", fill: "var(--color-primary)" }} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}
