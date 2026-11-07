"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { JobStatusBadge } from "@/components/job-status-badge";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { JobStatus } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

interface FailedJob {
  id: string;
  type: string;
  status: JobStatus;
  error: string | null;
  runAt: string;
  clientId: string;
  clientName: string;
}

export default function FailedJobsPage() {
  const queryClient = useQueryClient();
  const jobs = useQuery({ queryKey: ["failed-jobs"], queryFn: () => api<FailedJob[]>("/admin/failed-jobs") });
  const retry = useMutation({
    mutationFn: (id: string) => api(`/admin/failed-jobs/${id}/retry`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["failed-jobs"] }),
  });

  return (
    <>
      <PageHeader title="Failed jobs" subtitle="Uploads that need attention, across all clients" />
      {jobs.isPending && <Skeleton className="h-48" />}
      {jobs.isError && <ErrorState error={jobs.error} onRetry={() => jobs.refetch()} />}
      {jobs.data?.length === 0 && <EmptyState icon={CheckCircle2} title="Nothing has failed" body="Failed uploads appear here so you can retry them." />}
      {retry.isError && (
        <p role="alert" className="mb-3 text-sm text-bad">
          {retry.error.message}
        </p>
      )}
      {jobs.data && jobs.data.length > 0 && (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {jobs.data.map((job) => (
              <li key={job.id} className="flex flex-wrap items-center gap-3 p-3 sm:px-5">
                <div className="min-w-48 flex-1">
                  <Link href={`/${job.clientId}/photos`} className="text-sm font-medium hover:text-primary">
                    {job.clientName}
                  </Link>
                  <p className="text-xs text-muted">{formatDateTime(job.runAt)}</p>
                  {job.error && <p className="text-xs text-bad">{job.error}</p>}
                </div>
                <JobStatusBadge status={job.status} />
                <Button size="sm" variant="secondary" disabled={retry.isPending} onClick={() => retry.mutate(job.id)}>
                  Retry
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
