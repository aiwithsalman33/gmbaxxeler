"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { PhotoHistory, usePhotoHistory } from "./photo-history";
import { PhotoQueue, usePhotoQueue } from "./photo-queue";
import { ScheduleCard, type ScheduleResponse } from "./schedule-card";
import { PageHeader } from "@/components/page-header";
import { SchedulePageSkeleton } from "@/components/schedule/page-parts";
import { ErrorState } from "@/components/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type { Client } from "@/lib/types";
import { ClientBanner } from "../client-banner";

export default function PhotosPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const client = useQuery({ queryKey: ["client", clientId], queryFn: () => api<Client>(`/clients/${clientId}`) });
  const schedule = useQuery({ queryKey: ["photo-schedule", clientId], queryFn: () => api<ScheduleResponse>(`/clients/${clientId}/photo-schedule`) });
  const queue = usePhotoQueue(clientId);
  const history = usePhotoHistory(clientId);

  if (client.isError || schedule.isError) {
    return (
      <ErrorState
        error={client.error ?? schedule.error}
        onRetry={() => {
          client.refetch();
          schedule.refetch();
        }}
      />
    );
  }
  if (!client.data || !schedule.data) return <SchedulePageSkeleton label="Loading photos" />;
  const timezone = schedule.data.schedule?.timezone ?? schedule.data.timezone;

  return (
    <>
      <PageHeader title="Photos" subtitle="Scheduled photo uploads to this client's Google Business Profile" />
      <ClientBanner status={client.data.status} />
      <ScheduleCard key={clientId} clientId={clientId} data={schedule.data} />
      <Tabs defaultValue="upcoming" className="mt-8">
        <TabsList aria-label="Photo uploads">
          <TabsTrigger value="upcoming" count={queue.data?.length}>
            Upcoming
          </TabsTrigger>
          <TabsTrigger value="history" count={history.data?.length}>
            History
          </TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming">
          <PhotoQueue clientId={clientId} timezone={timezone} hasSchedule={schedule.data.schedule !== null} />
        </TabsContent>
        <TabsContent value="history">
          <PhotoHistory clientId={clientId} timezone={timezone} />
        </TabsContent>
      </Tabs>
    </>
  );
}
