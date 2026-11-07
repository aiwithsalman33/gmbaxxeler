"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import type { Dashboard, Totals } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

export type MetricKey = keyof Totals;

export const METRICS: { key: MetricKey; label: string }[] = [
  { key: "views", label: "Total views" },
  { key: "calls", label: "Calls" },
  { key: "directions", label: "Direction requests" },
  { key: "websiteClicks", label: "Website clicks" },
];

const shortDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en", { day: "numeric", month: "short", timeZone: "UTC" });

/** One metric at a time: views run far higher than calls, and a shared axis would flatten calls. */
export function MetricChart({ metric, series }: { metric: MetricKey; series: Dashboard["metrics"]["series"] }) {
  const [asTable, setAsTable] = useState(false);
  const label = METRICS.find((item) => item.key === metric)?.label ?? "";

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <CardTitle>{label} per day</CardTitle>
        <Button size="sm" variant="ghost" onClick={() => setAsTable(!asTable)}>
          {asTable ? "Show chart" : "Show table"}
        </Button>
      </div>
      {asTable ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 font-medium">Date</th>
                <th className="py-1 text-right font-medium">{label}</th>
              </tr>
            </thead>
            <tbody>
              {series.map((point) => (
                <tr key={point.date} className="border-t border-line">
                  <td className="py-1.5">{shortDate(point.date)}</td>
                  <td className="py-1.5 text-right">{formatNumber(point[metric])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke="var(--color-line)" />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 12, fill: "var(--color-muted)" }} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis tick={{ fontSize: 12, fill: "var(--color-muted)" }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                labelFormatter={(date) => shortDate(String(date))}
                formatter={(value) => [formatNumber(Number(value)), label]}
                contentStyle={{ borderRadius: 12, border: "1px solid var(--color-line)", fontSize: 13 }}
              />
              <Line type="monotone" dataKey={metric} stroke="var(--color-primary)" strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}
