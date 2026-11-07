"use client";

import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { CheckCircle2, Circle, ImageIcon, MessageSquare, RefreshCw, Star, TrendingDown, TrendingUp } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { MetricChart, METRICS, type MetricKey } from "./metric-chart";
import { ClientBanner } from "../client-banner";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Dashboard } from "@/lib/types";
import { cn, formatDate, formatNumber } from "@/lib/utils";

const RANGES = [7, 28, 90] as const;

function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return <span className="text-xs text-muted">No earlier data</span>;
  const change = Math.round(((current - previous) / previous) * 100);
  const Icon = change >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", change >= 0 ? "text-good" : "text-bad")}>
      <Icon className="size-3.5" />
      {change >= 0 ? "+" : ""}
      {change}% vs previous
    </span>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((n) => (
          <Skeleton key={n} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}

export default function DashboardPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const queryClient = useQueryClient();
  const [range, setRange] = useState<(typeof RANGES)[number]>(28);
  const [metric, setMetric] = useState<MetricKey>("views");

  const query = useQuery({
    queryKey: ["dashboard", clientId, range],
    queryFn: () => api<Dashboard>(`/clients/${clientId}/dashboard?range=${range}`),
    placeholderData: (previous) => (previous?.client.id === clientId ? keepPreviousData(previous) : undefined),
  });
  const refresh = useMutation({
    mutationFn: () => api(`/clients/${clientId}/dashboard/refresh`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard", clientId] }),
  });

  if (query.isPending) return <DashboardSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const { client, basics, strength, metrics, syncedAt } = query.data;
  const openItems = strength.checklist.filter((item) => !item.done);

  return (
    <>
      <PageHeader
        title={basics.name}
        subtitle={syncedAt ? `Last synced ${formatDate(syncedAt)}` : "Not synced yet"}
        actions={
          <>
            <div role="group" aria-label="Date range" className="flex rounded-xl border border-line bg-white p-1">
              {RANGES.map((days) => (
                <button
                  key={days}
                  aria-pressed={range === days}
                  onClick={() => setRange(days)}
                  className={cn("cursor-pointer rounded-lg px-3 py-1 text-sm font-medium", range === days ? "bg-primary text-white" : "text-muted hover:bg-lavender")}
                >
                  {days}d
                </button>
              ))}
            </div>
            <Button variant="secondary" disabled={refresh.isPending || client.status !== "connected"} onClick={() => refresh.mutate()}>
              <RefreshCw className={cn("size-4", refresh.isPending && "animate-spin")} />
              Refresh
            </Button>
          </>
        }
      />
      <ClientBanner status={client.status} needsKnowledge={!client.onboarded} clientId={client.id} />
      {refresh.isError && (
        <p role="alert" className="mb-4 text-sm text-bad">
          {refresh.error.message}
        </p>
      )}

      {metrics.series.length === 0 ? (
        <EmptyState icon={TrendingUp} title="No performance data yet" body="Metrics appear here once this client is connected and the first sync finishes." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {METRICS.map(({ key, label }) => (
              <button
                key={key}
                aria-pressed={metric === key}
                onClick={() => setMetric(key)}
                className={cn(
                  "cursor-pointer rounded-card border bg-white p-5 text-left shadow-card transition-colors",
                  metric === key ? "border-primary" : "border-line hover:border-primary/40",
                )}
              >
                <p className="text-sm text-muted">{label}</p>
                <p className="mt-1 text-2xl font-bold">{formatNumber(metrics.current[key])}</p>
                <Delta current={metrics.current[key]} previous={metrics.previous[key]} />
              </button>
            ))}
          </div>
          <Card className="mt-6">
            <MetricChart metric={metric} series={metrics.series} />
          </Card>
        </>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardTitle>Profile basics</CardTitle>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Star className="size-4 text-muted" />
              <dt className="flex-1 text-muted">Rating</dt>
              <dd className="font-medium">{basics.rating?.toFixed(1) ?? "None"}</dd>
            </div>
            <div className="flex items-center gap-2">
              <MessageSquare className="size-4 text-muted" />
              <dt className="flex-1 text-muted">Reviews</dt>
              <dd className="font-medium">{formatNumber(basics.reviewCount)}</dd>
            </div>
            <div className="flex items-center gap-2">
              <ImageIcon className="size-4 text-muted" />
              <dt className="flex-1 text-muted">Photos</dt>
              <dd className="font-medium">{formatNumber(basics.photoCount)}</dd>
            </div>
            <div className="flex items-center gap-2">
              <RefreshCw className="size-4 text-muted" />
              <dt className="flex-1 text-muted">Last post</dt>
              <dd className="font-medium">{formatDate(basics.lastPostAt)}</dd>
            </div>
          </dl>
          {basics.address && <p className="mt-4 border-t border-line pt-3 text-xs text-muted">{basics.address}</p>}
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex items-baseline justify-between gap-3">
            <CardTitle>Profile strength</CardTitle>
            <p className="text-3xl font-bold text-primary">
              {strength.score}
              <span className="text-base font-medium text-muted">/100</span>
            </p>
          </div>
          <div role="progressbar" aria-valuenow={strength.score} aria-valuemin={0} aria-valuemax={100} aria-label="Profile strength" className="mt-3 h-2 rounded-full bg-primary-soft">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${strength.score}%` }} />
          </div>
          <p className="mt-3 text-sm text-muted">{openItems.length === 0 ? "Everything on the checklist is done." : `${openItems.length} things to improve`}</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {strength.checklist.map((item) => (
              <li key={item.key} className="flex gap-2 text-sm">
                {item.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted" />}
                <div>
                  <p className="font-medium">{item.label}</p>
                  {!item.done && <p className="text-xs text-muted">{item.hint}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
