"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Eye, FileText, FlaskConical, History, ImagePlus, PenLine } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PostDialog } from "./post-dialog";
import { SeoScheduleCard, type SeoScheduleResponse } from "./seo-schedule-card";
import { ClientBanner } from "../client-banner";
import { JobStatusBadge } from "@/components/job-status-badge";
import { PageHeader } from "@/components/page-header";
import { QueueSkeleton, SchedulePageSkeleton, useMockEnabled } from "@/components/schedule/page-parts";
import { PublishNowButton, ReadinessNotice, SimulatedBadge } from "@/components/schedule/publishing";
import { ScheduleHistory, type HistoryRow } from "@/components/schedule/schedule-history";
import { ScheduleQueue, type QueueItem } from "@/components/schedule/schedule-queue";
import { formatDayTime } from "@/components/schedule/utils";
import { EmptyState, ErrorState, Notice } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast, toastError } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { CTA_LABELS, type Client, type JobStatus, type PostJob } from "@/lib/types";

const UPCOMING: JobStatus[] = ["scheduled", "awaiting_approval"];

export default function SeoPostsPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const client = useQuery({ queryKey: ["client", clientId], queryFn: () => api<Client>(`/clients/${clientId}`) });
  const schedule = useQuery({ queryKey: ["seo-schedule", clientId], queryFn: () => api<SeoScheduleResponse>(`/clients/${clientId}/seo-schedule`) });
  const posts = useQuery({ queryKey: ["posts", clientId], queryFn: () => api<PostJob[]>(`/clients/${clientId}/posts`) });
  const mock = useMockEnabled();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["posts", clientId] });
    queryClient.invalidateQueries({ queryKey: ["seo-schedule", clientId] });
  };
  const writeNext = useMutation({
    mutationFn: () => api(`/dev/mock/clients/${clientId}/posts/write-next`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Wrote the next post (mock)");
      return refresh();
    },
    onError: (error) => toastError(error),
  });
  const publishNext = useMutation({
    mutationFn: () => api(`/dev/mock/clients/${clientId}/posts/publish-next`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Published the next post (mock)");
      return refresh();
    },
    onError: (error) => toastError(error),
  });

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
  if (!client.data || !schedule.data) return <SchedulePageSkeleton label="Loading SEO posts" />;

  const timezone = schedule.data.schedule?.timezone ?? schedule.data.timezone;
  const all = posts.data ?? [];
  const upcoming = all.filter((job) => UPCOMING.includes(job.status));
  const past = all.filter((job) => !UPCOMING.includes(job.status)).reverse();
  const awaiting = upcoming.filter((job) => job.status === "awaiting_approval");
  const open = all.find((job) => job.id === openId) ?? null;

  const mockButtons = mock && all.length > 0 && (
    <>
      <Button size="sm" variant="secondary" loading={writeNext.isPending} onClick={() => writeNext.mutate()}>
        {!writeNext.isPending && <FlaskConical aria-hidden />}
        Write next (mock)
      </Button>
      <Button size="sm" variant="secondary" loading={publishNext.isPending} onClick={() => publishNext.mutate()}>
        {!publishNext.isPending && <FlaskConical aria-hidden />}
        Publish next (mock)
      </Button>
    </>
  );

  const items: QueueItem[] = upcoming.map((job) => {
    const needsApproval = job.status === "awaiting_approval";
    return {
      id: job.id,
      runAt: job.runAt,
      thumb: job.image?.publicUrl,
      thumbAlt: job.image?.originalName,
      title: job.post?.summary ?? <span className="text-muted">Not written yet</span>,
      subtitle: job.post ? `Button: ${CTA_LABELS[job.post.ctaType] ?? job.post.ctaType}` : "AI writes it before the publish time",
      label: needsApproval ? "Needs approval" : job.post ? "Post" : "Not written",
      accent: needsApproval ? "warn" : undefined,
      onOpen: () => setOpenId(job.id),
      badges: <JobStatusBadge status={job.status} />,
      actions: needsApproval ? (
        <Button size="sm" variant="soft" onClick={() => setOpenId(job.id)} aria-label={`Review post for ${formatDayTime(job.runAt, timezone)}`}>
          <BadgeCheck aria-hidden />
          <span className="hidden sm:inline">Review</span>
        </Button>
      ) : (
        <>
          <PublishNowButton
            path={`/clients/${clientId}/posts/${job.id}/publish-now`}
            label={`post for ${formatDayTime(job.runAt, timezone)}`}
            simulated={schedule.data?.readiness?.simulated ?? false}
            invalidate={[["posts", clientId], ["seo-schedule", clientId], ["library", clientId]]}
          />
          <Button size="sm" variant="ghost" onClick={() => setOpenId(job.id)} aria-label={`Open post for ${formatDayTime(job.runAt, timezone)}`}>
            {job.post ? <PenLine aria-hidden /> : <Eye aria-hidden />}
            <span className="hidden sm:inline">{job.post ? "Edit" : "View"}</span>
          </Button>
        </>
      ),
    };
  });

  const rows: HistoryRow[] = past.map((job) => ({
    id: job.id,
    runAt: job.runAt,
    status: job.status,
    thumb: job.image?.publicUrl,
    thumbAlt: job.image?.originalName,
    title: job.post ? <span className="line-clamp-2">{job.post.summary}</span> : <span className="text-muted">Not written</span>,
    detail: job.post ? `Button: ${CTA_LABELS[job.post.ctaType] ?? job.post.ctaType}` : undefined,
    error: job.error,
    labels: job.simulated ? <SimulatedBadge /> : undefined,
    actions: (
      <Button size="sm" variant="ghost" onClick={() => setOpenId(job.id)} aria-label={`Open post from ${formatDayTime(job.runAt, timezone)}`}>
        <Eye aria-hidden />
        <span className="hidden lg:inline">Open</span>
      </Button>
    ),
  }));

  return (
    <>
      <PageHeader title="SEO Posts" subtitle="AI-written posts for this client's Google Business Profile" />
      <ClientBanner status={client.data.status} />
      <ReadinessNotice readiness={schedule.data.readiness} clientId={clientId} className="mb-6" />
      <SeoScheduleCard key={clientId} clientId={clientId} data={schedule.data} />

      <Tabs defaultValue="upcoming" className="mt-8">
        <TabsList aria-label="Posts">
          <TabsTrigger value="upcoming" count={posts.data ? upcoming.length : undefined}>
            Upcoming
          </TabsTrigger>
          <TabsTrigger value="history" count={posts.data ? past.length : undefined}>
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming">
          {posts.isPending ? (
            <QueueSkeleton />
          ) : posts.isError ? (
            <ErrorState error={posts.error} onRetry={() => posts.refetch()} />
          ) : upcoming.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No posts coming up"
              body={
                schedule.data.schedule
                  ? "Posts for the next 14 days appear here. Turn the schedule on and add images to the SEO Post Images folder."
                  : "Save a schedule above and the next 14 days of posts appear here. Add images to the SEO Post Images folder first."
              }
              action={
                <Button asChild variant="secondary">
                  <Link href={`/${clientId}/library`}>
                    <ImagePlus aria-hidden />
                    Add post images
                  </Link>
                </Button>
              }
              secondary={mockButtons}
            />
          ) : (
            <ScheduleQueue
              items={items}
              timezone={timezone}
              toolbar={mockButtons}
              note={
                awaiting.length > 0 && (
                  <Notice
                    tone="warn"
                    icon={BadgeCheck}
                    className="items-center"
                    action={
                      <Button size="sm" onClick={() => setOpenId(awaiting[0]!.id)}>
                        Review {awaiting.length === 1 ? "it" : "the first"}
                      </Button>
                    }
                  >
                    {awaiting.length === 1 ? "1 post needs your approval before it can go live." : `${awaiting.length} posts need your approval before they can go live.`}
                  </Notice>
                )
              }
            />
          )}
        </TabsContent>

        <TabsContent value="history">
          {posts.isPending ? (
            <QueueSkeleton />
          ) : posts.isError ? (
            <ErrorState error={posts.error} onRetry={() => posts.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState icon={History} title="No past posts yet" body="Published, skipped and failed posts appear here once their time has passed." />
          ) : (
            <ScheduleHistory rows={rows} timezone={timezone} itemHeading="Post" />
          )}
        </TabsContent>
      </Tabs>

      <PostDialog clientId={clientId} job={open} timezone={timezone} onClose={() => setOpenId(null)} onChanged={refresh} />
    </>
  );
}
