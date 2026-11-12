"use client";

import { AlertCircle, SearchX } from "lucide-react";
import { useState, type ReactNode } from "react";
import { JobStatusBadge } from "@/components/job-status-badge";
import { EmptyState } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Segmented } from "@/components/ui/tabs";
import type { JobStatus } from "@/lib/types";
import { Thumb } from "./schedule-queue";
import { formatDayTime } from "./utils";

export interface HistoryRow {
  id: string;
  runAt: string;
  status: JobStatus;
  thumb?: string | null;
  thumbAlt?: string;
  title: ReactNode;
  detail?: ReactNode;
  error?: string | null;
  /** Small labels shown beside the status. */
  labels?: ReactNode;
  /** Per-row buttons and links. */
  actions?: ReactNode;
}

type Filter = "all" | "published" | "problems" | "skipped";
const GROUPS: Record<Exclude<Filter, "all">, JobStatus[]> = {
  published: ["published", "publishing"],
  problems: ["failed", "dead", "needs_images"],
  skipped: ["skipped"],
};
const LABELS: Record<Filter, string> = { all: "All", published: "Published", problems: "Problems", skipped: "Skipped" };

const inFilter = (row: HistoryRow, filter: Filter) => filter === "all" || GROUPS[filter].includes(row.status);

export function ScheduleHistory({ rows, timezone, itemHeading }: { rows: HistoryRow[]; timezone: string; itemHeading: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const options = (Object.keys(LABELS) as Filter[])
    .map((value) => ({ value, count: rows.filter((row) => inFilter(row, value)).length }))
    .filter((option) => option.value === "all" || option.count > 0)
    .map((option) => ({ value: option.value, label: `${LABELS[option.value]} ${option.count}` }));
  const shown = rows.filter((row) => inFilter(row, filter));

  return (
    <div className="space-y-4">
      {options.length > 2 && <Segmented label="Filter by status" value={filter} onChange={setFilter} options={options} />}
      {shown.length === 0 ? (
        <EmptyState icon={SearchX} title="Nothing matches this filter" body="Pick another status to see more of the history." />
      ) : (
        <>
          <Card className="hidden py-0 md:block sm:py-0">
            <Table>
              <THead>
                <tr>
                  <TH className="border-t-0">Date</TH>
                  <TH className="border-t-0">{itemHeading}</TH>
                  <TH className="border-t-0">Status</TH>
                  <TH className="border-t-0">
                    <span className="sr-only">Actions</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {shown.map((row) => (
                  <TR key={row.id}>
                    <TD className="w-44 align-top text-sm whitespace-nowrap text-ink-soft tabular-nums">
                      <time dateTime={row.runAt}>{formatDayTime(row.runAt, timezone)}</time>
                    </TD>
                    <TD className="align-top">
                      <div className="flex min-w-0 items-start gap-3">
                        <Thumb src={row.thumb} alt={row.thumbAlt} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium break-words text-ink">{row.title}</div>
                          {row.detail && <div className="mt-0.5 text-xs break-words text-muted">{row.detail}</div>}
                          {row.error && <ErrorLine text={row.error} />}
                        </div>
                      </div>
                    </TD>
                    <TD className="align-top whitespace-nowrap">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <JobStatusBadge status={row.status} />
                        {row.labels}
                      </div>
                    </TD>
                    <TD className="w-px align-top whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">{row.actions}</div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          <ul className="space-y-3 md:hidden">
            {shown.map((row) => (
              <li key={row.id}>
                <Card className="p-4">
                  <div className="flex items-start gap-3">
                    <Thumb src={row.thumb} alt={row.thumbAlt} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted tabular-nums">
                        <time dateTime={row.runAt}>{formatDayTime(row.runAt, timezone)}</time>
                      </p>
                      <div className="mt-0.5 text-sm font-medium break-words text-ink">{row.title}</div>
                      {row.detail && <div className="mt-0.5 text-xs break-words text-muted">{row.detail}</div>}
                    </div>
                  </div>
                  {row.error && <ErrorLine text={row.error} />}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <JobStatusBadge status={row.status} />
                      {row.labels}
                    </div>
                    {row.actions && <div className="flex items-center gap-1">{row.actions}</div>}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-bad-soft px-2.5 py-1.5 text-xs break-words text-bad-ink">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-bad" aria-hidden />
      <span className="min-w-0">{text}</span>
    </p>
  );
}
