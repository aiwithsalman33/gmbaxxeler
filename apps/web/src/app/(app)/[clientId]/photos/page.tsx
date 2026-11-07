"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PhotoHistory } from "./photo-history";
import { PhotoQueue } from "./photo-queue";
import { ScheduleCard, type ScheduleResponse } from "./schedule-card";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Client } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ClientBanner } from "../client-banner";

const TABS = ["Upcoming", "History"] as const;

export default function PhotosPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Upcoming");
  const client = useQuery({ queryKey: ["client", clientId], queryFn: () => api<Client>(`/clients/${clientId}`) });
  const schedule = useQuery({ queryKey: ["photo-schedule", clientId], queryFn: () => api<ScheduleResponse>(`/clients/${clientId}/photo-schedule`) });

  if (client.isError || schedule.isError) {
    return <ErrorState error={client.error ?? schedule.error} onRetry={() => { client.refetch(); schedule.refetch(); }} />;
  }
  if (!client.data || !schedule.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Photos" subtitle="Scheduled uploads to this client's Google Business Profile" />
      <ClientBanner status={client.data.status} />
      <ScheduleCard key={clientId} clientId={clientId} data={schedule.data} />
      <div role="tablist" className="mt-6 mb-4 inline-flex rounded-xl border border-line bg-white p-1">
        {TABS.map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            className={cn("cursor-pointer rounded-lg px-4 py-1.5 text-sm font-medium", tab === name ? "bg-primary text-white" : "text-muted hover:bg-lavender")}
          >
            {name}
          </button>
        ))}
      </div>
      {tab === "Upcoming" ? <PhotoQueue clientId={clientId} timezone={schedule.data.timezone} /> : <PhotoHistory clientId={clientId} timezone={schedule.data.timezone} />}
    </>
  );
}
