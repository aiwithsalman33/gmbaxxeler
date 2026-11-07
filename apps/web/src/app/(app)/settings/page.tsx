"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AiSettings } from "./ai-settings";
import { NotificationSettings } from "./notification-settings";
import { SecuritySettings } from "./security-settings";
import { TeamSettings } from "./team-settings";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, apiUrl } from "@/lib/api";
import type { Connection, Me } from "@/lib/types";

const RESULTS: Record<string, { text: string; good: boolean }> = {
  connected: { text: "Google account connected.", good: true },
  denied: { text: "Google access was not granted.", good: false },
  different_account: { text: "Disconnect the current agency account before connecting another.", good: false },
  failed: { text: "Connecting Google failed. Please try again.", good: false },
};

function ConnectResult() {
  const result = RESULTS[useSearchParams().get("google") ?? ""];
  if (!result) return null;
  return <p className={result.good ? "mb-4 text-sm text-good" : "mb-4 text-sm text-bad"}>{result.text}</p>;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me") });
  const connections = useQuery({ queryKey: ["connections"], queryFn: () => api<Connection[]>("/google/connections") });
  const disconnect = useMutation({
    mutationFn: (id: string) => api(`/google/connections/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const reconnect = useMutation({
    mutationFn: (id: string) => api<{ url: string }>(`/google/connections/${id}/reconnect`, { method: "POST" }),
    onSuccess: ({ url }) => window.location.assign(url),
  });

  const agency = connections.data?.find((connection) => connection.source === "agency" && connection.status === "active");
  const revoked = connections.data?.find((connection) => connection.source === "agency" && connection.status !== "active");
  const connectHref = apiUrl("/google/oauth/start");

  return (
    <>
      <PageHeader title="Account Settings" subtitle={me.data?.workspace.name} />
      <Suspense>
        <ConnectResult />
      </Suspense>
      <div className="space-y-6">
        <Card>
          <CardTitle>Agency Google account</CardTitle>
          <p className="mt-1 mb-4 text-sm text-muted">Clients add this account as Manager on their Business Profile.</p>
          {connections.isPending && <Skeleton className="h-12" />}
          {connections.isError && <ErrorState error={connections.error} onRetry={() => connections.refetch()} />}
          {connections.isSuccess &&
            (agency ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium">{agency.googleAccountEmail}</p>
                <div className="flex gap-2">
                <Button variant="secondary" disabled={reconnect.isPending} onClick={() => reconnect.mutate(agency.id)}>
                  Reconnect
                </Button>
                <Button
                  variant="danger"
                  disabled={disconnect.isPending}
                  onClick={() => {
                    if (window.confirm("Disconnect this account? Connected clients will need a reconnect.")) disconnect.mutate(agency.id);
                  }}
                >
                  Disconnect
                </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                {revoked && <p className="text-sm text-bad">{revoked.googleAccountEmail} needs to be reconnected.</p>}
                <Button asChild>
                  <a href={connectHref}>{revoked ? "Reconnect Google" : "Connect Google"}</a>
                </Button>
              </div>
            ))}
          {disconnect.isError && <p className="mt-2 text-sm text-bad">{disconnect.error.message}</p>}
        </Card>

        <AiSettings />
        <NotificationSettings />
        <TeamSettings />
        <SecuritySettings />

        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Failed jobs</CardTitle>
            <p className="mt-1 text-sm text-muted">Review and retry uploads that didn&apos;t go through.</p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/admin/failed-jobs">View failed jobs</Link>
          </Button>
        </Card>
      </div>
    </>
  );
}
