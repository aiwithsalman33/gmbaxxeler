"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PostDialog } from "./post-dialog";
import { SeoScheduleCard, type SeoScheduleResponse } from "./seo-schedule-card";
import { ClientBanner } from "../client-banner";
import { JobStatusBadge } from "@/components/job-status-badge";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Client, PostJob } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export default function SeoPostsPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const client = useQuery({ queryKey: ["client", clientId], queryFn: () => api<Client>(`/clients/${clientId}`) });
  const schedule = useQuery({ queryKey: ["seo-schedule", clientId], queryFn: () => api<SeoScheduleResponse>(`/clients/${clientId}/seo-schedule`) });
  const posts = useQuery({ queryKey: ["posts", clientId], queryFn: () => api<PostJob[]>(`/clients/${clientId}/posts`) });
  const mock = useQuery({
    queryKey: ["mock"],
    queryFn: () => api<{ enabled: boolean }>("/dev/mock/enabled").catch(() => ({ enabled: false })),
    staleTime: Infinity,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["posts", clientId] });
  const writeNext = useMutation({ mutationFn: () => api(`/dev/mock/clients/${clientId}/posts/write-next`, { method: "POST" }), onSuccess: refresh });
  const publishNext = useMutation({ mutationFn: () => api(`/dev/mock/clients/${clientId}/posts/publish-next`, { method: "POST" }), onSuccess: refresh });

  if (client.isError || schedule.isError) return <ErrorState error={client.error ?? schedule.error} onRetry={() => { client.refetch(); schedule.refetch(); }} />;
  if (!client.data || !schedule.data) return <Skeleton className="h-96" />;
  const open = posts.data?.find((job) => job.id === openId) ?? null;
  const error = writeNext.error ?? publishNext.error;

  return (
    <>
      <PageHeader title="SEO Posts" subtitle="AI-written posts for this client's Google Business Profile" />
      <ClientBanner status={client.data.status} />
      <SeoScheduleCard key={clientId} clientId={clientId} data={schedule.data} />

      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Posts</h2>
        {mock.data?.enabled && (posts.data?.length ?? 0) > 0 && (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={writeNext.isPending} onClick={() => writeNext.mutate()}>
              Write next (mock)
            </Button>
            <Button size="sm" variant="secondary" disabled={publishNext.isPending} onClick={() => publishNext.mutate()}>
              Publish next (mock)
            </Button>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="mb-3 text-sm text-bad">
          {error.message}
        </p>
      )}
      {posts.isPending && <Skeleton className="h-48" />}
      {posts.isError && <ErrorState error={posts.error} onRetry={() => posts.refetch()} />}
      {posts.data?.length === 0 && <EmptyState icon={FileText} title="No posts yet" body="Save a schedule, and upcoming posts appear here. Add images to the SEO Post Images folder first." />}
      {posts.data && posts.data.length > 0 && (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {posts.data.map((job) => (
              <li key={job.id}>
                <button onClick={() => setOpenId(job.id)} className="flex w-full cursor-pointer flex-wrap items-center gap-3 p-3 text-left hover:bg-lavender sm:px-5">
                  {job.image ? <img src={job.image.publicUrl} alt="" loading="lazy" className="size-12 rounded-lg object-cover" /> : <span className="size-12 rounded-lg bg-lavender" />}
                  <span className="min-w-40 flex-1">
                    <span className="block text-sm font-medium">{formatDateTime(job.runAt, schedule.data.timezone)}</span>
                    <span className="line-clamp-1 text-xs text-muted">{job.post?.summary ?? job.error ?? "Not written yet"}</span>
                  </span>
                  <JobStatusBadge status={job.status} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <PostDialog clientId={clientId} job={open} onClose={() => setOpenId(null)} onChanged={refresh} />
    </>
  );
}
