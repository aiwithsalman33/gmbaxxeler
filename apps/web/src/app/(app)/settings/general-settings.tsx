"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, ArrowRight, Building2, CheckCircle2, Circle, Globe, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { DemoDataSettings } from "./demo-data-settings";
import { WorkerStatusCard } from "@/components/worker-status";
import { ErrorState, Notice } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { LoadingBlock, Skeleton } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { GoogleStatus, Me } from "@/lib/types";

function WorkspaceCard() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me") });
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");
  const data = me.data;
  const owner = data?.role === "owner";

  useEffect(() => {
    if (!data) return;
    setName(data.workspace.name);
    setTimezone(data.workspace.timezone);
  }, [data]);

  const save = useMutation({
    mutationFn: () => api("/workspace", { method: "PATCH", body: { name: name.trim(), timezone: timezone.trim() } }),
    onSuccess: () => {
      toast.success("Workspace saved");
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error) => toastError(error),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  const changed = data && (name.trim() !== data.workspace.name || timezone.trim() !== data.workspace.timezone);

  return (
    <Card>
      <CardHeader icon={Building2} title="Workspace" description={owner ? "The name your team sees, and the time zone used for new clients." : "Only the owner can change these."} />
      {me.isPending && (
        <LoadingBlock label="Loading workspace" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-[66px]" />
          <Skeleton className="h-[66px]" />
        </LoadingBlock>
      )}
      {me.isError && <ErrorState bare error={me.error} onRetry={() => me.refetch()} />}
      {data && (
        <form onSubmit={submit}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Workspace name">{(props) => <Input {...props} required minLength={2} maxLength={120} disabled={!owner} value={name} onChange={(event) => setName(event.target.value)} />}</Field>
            <Field label="Time zone" hint="For example Asia/Kolkata">
              {(props) => <Input {...props} maxLength={64} disabled={!owner} value={timezone} onChange={(event) => setTimezone(event.target.value)} />}
            </Field>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-lavender px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5 text-sm">
              <UserRound className="size-4 shrink-0 text-subtle" aria-hidden />
              <span className="truncate text-ink-soft">{data.user.email}</span>
              <Badge tone="primary" className="capitalize">
                {data.role}
              </Badge>
            </div>
            {owner && (
              <Button type="submit" size="sm" disabled={!changed} loading={save.isPending}>
                Save changes
              </Button>
            )}
          </div>
        </form>
      )}
    </Card>
  );
}

function FailedJobsCard() {
  return (
    <Card>
      <CardHeader
        icon={AlertOctagon}
        title="Failed jobs"
        description="Uploads, posts and replies that didn't go through after every retry. Review what went wrong and retry them."
        className="mb-0"
        actions={
          <Button asChild variant="secondary">
            <Link href="/admin/failed-jobs">
              View failed jobs
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
      />
    </Card>
  );
}

export function GeneralSettings() {
  return (
    <div className="space-y-6">
      <WorkspaceCard />
      <section aria-label="System health" className="space-y-6">
        <WorkerStatusCard />
        <FailedJobsCard />
      </section>
      <DemoDataSettings />
    </div>
  );
}

/** Short summary of Google setup; the full controls live on /settings/google. */
export function GoogleSummary() {
  const status = useQuery({ queryKey: ["google-status"], queryFn: () => api<GoogleStatus>("/settings/google/status") });
  const data = status.data;
  const items = data
    ? [
        { done: data.credentialsSet, label: "OAuth credentials", detail: data.credentialsSet ? "Set" : "Not set" },
        { done: data.agencyConnected, label: "Agency account", detail: data.agencyConnected ? "Connected" : "Not connected" },
        { done: data.apiAccess === "approved", label: "Business Profile API access", detail: { approved: "Approved", not_approved: "Not approved", unknown: "Not checked yet" }[data.apiAccess] },
      ]
    : [];
  const done = items.filter((item) => item.done).length;

  return (
    <Card>
      <CardHeader
        icon={Globe}
        title="Google"
        description="One agency Google account connects every client profile."
        actions={
          <Button asChild>
            <Link href="/settings/google">
              Open Google settings
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
      />
      {status.isPending && (
        <LoadingBlock label="Loading Google status" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-[68px]" />
          ))}
        </LoadingBlock>
      )}
      {status.isError && <ErrorState bare error={status.error} onRetry={() => status.refetch()} />}
      {data && (
        <>
          <p className="mb-3 text-sm font-medium text-ink-soft">
            {done} of {items.length} setup steps done
          </p>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {items.map((item) => (
              <li key={item.label} className="flex items-start gap-3 rounded-xl border border-line px-4 py-3">
                {item.done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-good" aria-label="Done" /> : <Circle className="mt-0.5 size-5 shrink-0 text-subtle" aria-label="Not done" />}
                <div className="min-w-0">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
          {data.adapter === "mock" && (
            <Notice tone="warn" className="mt-4">
              Mock mode: locations, reviews and metrics are simulated. Nothing reaches Google.
            </Notice>
          )}
        </>
      )}
    </Card>
  );
}
