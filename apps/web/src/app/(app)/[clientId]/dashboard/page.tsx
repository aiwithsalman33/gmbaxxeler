"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, CalendarClock, CheckCircle2, Circle, ImageIcon, MapPin, MessageSquare, Minus, RefreshCw, Sparkles, Star, TrendingUp } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { MetricChart, METRICS, type MetricKey } from "./metric-chart";
import { ClientBanner } from "../client-banner";
import { useClients } from "@/components/client-switcher";
import { EmptyState, ErrorState } from "@/components/states";
import { DemoBadge, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { LoadingBlock, Skeleton } from "@/components/ui/skeleton";
import { Segmented } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { Avatar, ProgressRing, Stars } from "@/components/ui/widgets";
import { api } from "@/lib/api";
import type { Dashboard } from "@/lib/types";
import { cn, formatDate, formatNumber } from "@/lib/utils";

type Range = "7" | "28" | "90";
const RANGES: { value: Range; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "28", label: "28 days" },
  { value: "90", label: "90 days" },
];

function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return <span className="text-xs text-muted">No earlier data</span>;
  const change = Math.round(((current - previous) / previous) * 100);
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  const style = change > 0 ? "bg-good-soft text-good" : change < 0 ? "bg-bad-soft text-bad" : "bg-neutral-soft text-muted";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold", style)}>
        <Icon className="size-3" aria-hidden />
        {change > 0 ? "+" : ""}
        {change}%
      </span>
      <span className="hidden sm:inline">vs previous period</span>
      <span className="sm:hidden">vs prev.</span>
    </span>
  );
}

function DashboardSkeleton() {
  return (
    <LoadingBlock label="Loading dashboard" className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((n) => (
          <Skeleton key={n} className="h-[132px]" />
        ))}
      </div>
      <Skeleton className="h-[400px]" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Skeleton className="h-80" />
        <Skeleton className="h-80 lg:col-span-2" />
      </div>
    </LoadingBlock>
  );
}

export default function DashboardPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const queryClient = useQueryClient();
  const [range, setRange] = useState<Range>("28");
  const [metric, setMetric] = useState<MetricKey>("views");
  const { data: clients } = useClients();
  const listed = clients?.find((c) => c.id === clientId);

  const query = useQuery({
    queryKey: ["dashboard", clientId, Number(range)],
    queryFn: () => api<Dashboard>(`/clients/${clientId}/dashboard?range=${range}`),
    placeholderData: (previous) => (previous?.client.id === clientId ? keepPreviousData(previous) : undefined),
  });
  const refresh = useMutation({
    mutationFn: () => api(`/clients/${clientId}/dashboard/refresh`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Metrics refreshed");
      return queryClient.invalidateQueries({ queryKey: ["dashboard", clientId] });
    },
    onError: (error) => toast.error(error.message),
  });

  if (query.isPending) return <DashboardSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const { client, basics, strength, metrics, syncedAt } = query.data;
  const openItems = strength.checklist.filter((item) => !item.done).sort((a, b) => b.weight - a.weight);
  const doneItems = strength.checklist.filter((item) => item.done);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 sm:mb-8">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={basics.name} size="lg" className="size-14 text-base" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{basics.name}</h1>
              <StatusBadge status={client.status} />
              {listed?.demo && <DemoBadge />}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              {basics.address && (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <MapPin className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{basics.address}</span>
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <RefreshCw className="size-3.5" aria-hidden />
                {syncedAt ? `Synced ${formatDate(syncedAt)}` : "Not synced yet"}
              </span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Date range" value={range} onChange={setRange} options={RANGES} />
          <Button variant="secondary" loading={refresh.isPending} disabled={client.status !== "connected"} onClick={() => refresh.mutate()}>
            {!refresh.isPending && <RefreshCw aria-hidden />}
            Refresh
          </Button>
        </div>
      </div>

      <ClientBanner status={client.status} needsKnowledge={!client.onboarded} clientId={client.id} />

      {metrics.series.length === 0 ? (
        <EmptyState icon={TrendingUp} title="No performance data yet" body="Views, calls, direction requests and website clicks appear here after this client is connected and the first nightly sync finishes." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" role="group" aria-label="Metrics">
            {METRICS.map(({ key, label, icon: Icon }) => {
              const selected = metric === key;
              return (
                <button
                  key={key}
                  aria-pressed={selected}
                  onClick={() => setMetric(key)}
                  className={cn(
                    "group cursor-pointer rounded-card border bg-surface p-4 text-left shadow-card transition-[border-color,box-shadow] focus-visible:shadow-focus focus-visible:outline-none sm:p-5",
                    selected ? "border-primary ring-1 ring-primary" : "border-line hover:border-primary-300",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted sm:text-sm">{label}</p>
                    <span className={cn("flex size-8 items-center justify-center rounded-lg transition-colors", selected ? "bg-primary text-white" : "bg-primary-50 text-primary")}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{formatNumber(metrics.current[key])}</p>
                  <div className="mt-1.5">
                    <Delta current={metrics.current[key]} previous={metrics.previous[key]} />
                  </div>
                </button>
              );
            })}
          </div>
          <Card className="mt-6">
            <MetricChart metric={metric} series={metrics.series} />
          </Card>
        </>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader icon={Star} title="Profile basics" description="From Google Business Profile" />
          <div className="mb-5 flex items-end gap-3 rounded-xl bg-lavender px-4 py-3">
            <span className="text-3xl font-bold tabular-nums">{basics.rating?.toFixed(1) ?? "–"}</span>
            <div className="pb-1">
              {basics.rating !== null && <Stars rating={basics.rating} />}
              <p className="text-xs text-muted">{formatNumber(basics.reviewCount)} reviews</p>
            </div>
          </div>
          <dl className="space-y-3 text-sm">
            {[
              { icon: MessageSquare, label: "Reviews", value: formatNumber(basics.reviewCount) },
              { icon: ImageIcon, label: "Photos", value: formatNumber(basics.photoCount) },
              { icon: CalendarClock, label: "Last post", value: formatDate(basics.lastPostAt) },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-2.5">
                <Icon className="size-4 text-subtle" aria-hidden />
                <dt className="flex-1 text-muted">{label}</dt>
                <dd className="font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader icon={Sparkles} title="Profile strength" description={openItems.length === 0 ? "Everything on the checklist is done." : `${openItems.length} ${openItems.length === 1 ? "thing" : "things"} to improve, highest impact first`} />
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="flex flex-col items-center gap-2 sm:w-40">
              <ProgressRing value={strength.score} label="Profile strength" />
              <p className="text-xs font-medium text-muted">
                {doneItems.length} of {strength.checklist.length} complete
              </p>
            </div>
            <ul className="grid flex-1 gap-2 sm:grid-cols-2">
              {[...openItems, ...doneItems].map((item) => (
                <li key={item.key} className={cn("flex gap-2.5 rounded-xl border px-3 py-2.5", item.done ? "border-transparent bg-lavender/60" : "border-line bg-surface")}>
                  {item.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" aria-label="Done" /> : <Circle className="mt-0.5 size-4 shrink-0 text-warn" aria-label="To do" />}
                  <div className="min-w-0">
                    <p className={cn("text-sm font-medium", item.done && "text-muted")}>{item.label}</p>
                    {!item.done && <p className="text-xs text-muted">{item.hint}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
    </>
  );
}
