"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, CheckCircle2, FileText, ImageIcon, RefreshCw, RotateCcw, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { JobStatusBadge } from "@/components/job-status-badge";
import { PageHeader } from "@/components/page-header";
import { WorkerStatusStrip } from "@/components/worker-status";
import { EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { LoadingBlock, Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { toast, toastError } from "@/components/ui/toast";
import { Avatar } from "@/components/ui/widgets";
import { api } from "@/lib/api";
import type { JobStatus } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

interface FailedJob {
  id: string;
  type: string;
  status: JobStatus;
  error: string | null;
  attempts?: number;
  runAt: string;
  finishedAt?: string | null;
  clientId: string;
  clientName: string;
}

const TYPES: Record<string, { label: string; icon: LucideIcon; page: string }> = {
  photo: { label: "Photo upload", icon: ImageIcon, page: "photos" },
  seo_post: { label: "SEO post", icon: FileText, page: "seo-posts" },
};
const typeInfo = (type: string) =>
  TYPES[type] ?? {
    label: type.replace(/_/g, " "),
    icon: FileText,
    page: "dashboard",
  };

function TableSkeleton() {
  return (
    <LoadingBlock label="Loading failed jobs">
      <Card>
        <div className="mb-5 flex items-center gap-3">
          <Skeleton className="size-10" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-10" />
          {[0, 1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-14" />
          ))}
        </div>
      </Card>
    </LoadingBlock>
  );
}

export default function FailedJobsPage() {
  const queryClient = useQueryClient();
  const jobs = useQuery({
    queryKey: ["failed-jobs"],
    queryFn: () => api<FailedJob[]>("/admin/failed-jobs"),
  });
  const retry = useMutation({
    mutationFn: (id: string) => api(`/admin/failed-jobs/${id}/retry`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Queued to run again now");
      return queryClient.invalidateQueries({ queryKey: ["failed-jobs"] });
    },
    onError: (error) => toastError(error),
  });
  const count = jobs.data?.length ?? 0;

  return (
    <>
      <PageHeader
        title="Failed jobs"
        subtitle="Photo uploads and posts that need attention, across all clients"
        actions={
          <Button variant="secondary" loading={jobs.isFetching && !jobs.isPending} onClick={() => jobs.refetch()}>
            {!(jobs.isFetching && !jobs.isPending) && <RefreshCw aria-hidden />}
            Refresh
          </Button>
        }
      />
      <WorkerStatusStrip className="mb-6" />
      {jobs.isPending && <TableSkeleton />}
      {jobs.isError && <ErrorState error={jobs.error} onRetry={() => jobs.refetch()} />}
      {jobs.isSuccess && count === 0 && (
        <EmptyState
          icon={CheckCircle2}
          title="No failed jobs. Everything is running."
          body="If a photo upload or post can't reach Google, it shows up here with the reason, so you can fix it and retry."
          action={
            <Button asChild variant="secondary">
              <Link href="/clients">Go to clients</Link>
            </Button>
          }
        />
      )}
      {jobs.data && count > 0 && (
        <Card>
          <CardHeader
            icon={AlertOctagon}
            title={`${count} ${count === 1 ? "job needs" : "jobs need"} attention`}
            description="Retry runs the job again right away. If it keeps failing, open the client to check the cause."
          />
          <ul className="-mx-5 divide-y divide-line border-t border-line sm:hidden">
            {jobs.data.map((job) => {
              const { label, icon: Icon, page } = typeInfo(job.type);
              const retrying = retry.isPending && retry.variables === job.id;
              const when = job.finishedAt ?? job.runAt;
              return (
                <li key={job.id} className="space-y-2.5 px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/${job.clientId}/${page}`}
                      className="flex min-w-0 items-center gap-2.5 rounded-md text-sm font-medium text-ink hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
                    >
                      <Avatar name={job.clientName} size="sm" />
                      <span className="truncate">{job.clientName}</span>
                    </Link>
                    <JobStatusBadge status={job.status} />
                  </div>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Icon className="size-3.5" aria-hidden />
                      {label}
                    </span>
                    <time dateTime={when}>{formatDateTime(when)}</time>
                    {job.attempts !== undefined && (
                      <span>
                        {job.attempts} {job.attempts === 1 ? "attempt" : "attempts"}
                      </span>
                    )}
                  </p>
                  {job.error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-xs text-bad">{job.error}</p>}
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={retrying}
                    disabled={retry.isPending && !retrying}
                    onClick={() => retry.mutate(job.id)}
                    aria-label={`Retry ${label.toLowerCase()} for ${job.clientName}`}
                  >
                    {!retrying && <RotateCcw aria-hidden />}
                    Retry
                  </Button>
                </li>
              );
            })}
          </ul>
          <div className="hidden sm:block">
            <Table className="min-w-[56rem]">
              <THead>
                <tr>
                  <TH>Client</TH>
                  <TH>Type</TH>
                  <TH>Status</TH>
                  <TH>When</TH>
                  <TH className="text-right">Attempts</TH>
                  <TH>Error</TH>
                  <TH className="relative text-right">
                    <span className="sr-only">Actions</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {jobs.data.map((job) => {
                  const { label, icon: Icon, page } = typeInfo(job.type);
                  const retrying = retry.isPending && retry.variables === job.id;
                  const when = job.finishedAt ?? job.runAt;
                  return (
                    <TR key={job.id}>
                      <TD>
                        <Link
                          href={`/${job.clientId}/${page}`}
                          className="flex items-center gap-2.5 rounded-md font-medium text-ink hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
                        >
                          <Avatar name={job.clientName} size="sm" />
                          <span className="max-w-44 truncate">{job.clientName}</span>
                        </Link>
                      </TD>
                      <TD>
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-ink-soft">
                          <Icon className="size-4 text-subtle" aria-hidden />
                          {label}
                        </span>
                      </TD>
                      <TD>
                        <JobStatusBadge status={job.status} />
                      </TD>
                      <TD className="whitespace-nowrap text-muted">
                        <time dateTime={when}>{formatDateTime(when)}</time>
                      </TD>
                      <TD className="text-right text-muted tabular-nums">{job.attempts ?? "–"}</TD>
                      <TD className="max-w-80">
                        {job.error ? (
                          <p className="line-clamp-2 text-xs text-bad" title={job.error}>
                            {job.error}
                          </p>
                        ) : (
                          <span className="text-xs text-subtle">No message</span>
                        )}
                      </TD>
                      <TD className="text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={retrying}
                          disabled={retry.isPending && !retrying}
                          onClick={() => retry.mutate(job.id)}
                          aria-label={`Retry ${label.toLowerCase()} for ${job.clientName}`}
                        >
                          {!retrying && <RotateCcw aria-hidden />}
                          Retry
                        </Button>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        </Card>
      )}
    </>
  );
}
