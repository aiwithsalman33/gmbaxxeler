"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bot, MessageSquare, MessageSquareDashed, RefreshCw, Search, Star, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ReviewCard } from "./review-card";
import { REPLY_MODES, ReviewSettingsDrawer, useReviewSettings } from "./review-settings-card";
import { isNegative, replyStatus } from "./review-status";
import { ClientBanner } from "../client-banner";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingBlock, Skeleton } from "@/components/ui/skeleton";
import { Segmented } from "@/components/ui/tabs";
import { toast, toastError } from "@/components/ui/toast";
import { Stars } from "@/components/ui/widgets";
import { api } from "@/lib/api";
import type { Client, Review } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";

type StatusFilter = "all" | "needs" | "pending" | "replied";
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needs", label: "Needs reply" },
  { value: "pending", label: "Drafts" },
  { value: "replied", label: "Replied" },
];
/** The API knows replied yes/no; drafts vs. untouched is split on this side. */
const REPLIED_PARAM: Record<StatusFilter, string> = {
  all: "",
  needs: "no",
  pending: "no",
  replied: "yes",
};

function useDebounced<T>(value: T, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function SummarySkeleton() {
  return <Skeleton className="mb-6 h-[372px] sm:h-[300px] lg:h-[258px]" />;
}

function ListSkeleton() {
  return (
    <LoadingBlock label="Loading reviews" className="space-y-4">
      {[0, 1, 2].map((n) => (
        <Skeleton key={n} className="h-[188px]" />
      ))}
    </LoadingBlock>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  onClick,
  active,
}: {
  icon: typeof Star;
  label: string;
  value: number;
  hint: string;
  tone: "warn" | "bad";
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border bg-surface p-3 text-left sm:p-4 transition-[border-color,box-shadow] focus-visible:shadow-focus focus-visible:outline-none",
        active ? "border-primary ring-1 ring-primary" : "border-line hover:border-primary-300",
      )}
    >
      <span className={cn("hidden size-9 shrink-0 items-center sm:flex justify-center rounded-lg", tone === "warn" ? "bg-warn-soft text-warn" : "bg-bad-soft text-bad")}>
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className={cn("flex items-center gap-1.5 text-xs font-medium text-muted", tone === "warn" ? "[&_svg]:text-warn" : "[&_svg]:text-bad")}>
          <Icon className="size-3.5 sm:hidden" aria-hidden />
          {label}
        </span>
        <span className="block text-xl font-bold tracking-tight text-ink tabular-nums">{formatNumber(value)}</span>
        <span className="block text-2xs text-subtle">{hint}</span>
      </span>
    </button>
  );
}

function Summary({
  reviews,
  rating,
  onRating,
  status,
  onNeedsReply,
  onNegative,
}: {
  reviews: Review[];
  rating: string;
  onRating: (rating: string) => void;
  status: StatusFilter;
  onNeedsReply: () => void;
  onNegative: () => void;
}) {
  const total = reviews.length;
  const average = total ? reviews.reduce((sum, review) => sum + review.rating, 0) / total : 0;
  const counts = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: reviews.filter((review) => review.rating === stars).length,
  }));
  const unanswered = reviews.filter((review) => replyStatus(review) !== "replied").length;
  const negative = reviews.filter(isNegative).length;
  const max = Math.max(1, ...counts.map((c) => c.count));

  return (
    <Card className="mb-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[auto_1fr] lg:grid-cols-[auto_1fr_auto] lg:items-center">
        <div className="flex items-center gap-4 sm:flex-col sm:items-start sm:gap-1 sm:pr-6 lg:border-r lg:border-line">
          <p className="text-4xl font-bold tracking-tight text-ink tabular-nums">{total ? average.toFixed(1) : "–"}</p>
          <div>
            <Stars rating={average} size="md" />
            <p className="mt-1 text-xs text-muted">
              {formatNumber(total)} {total === 1 ? "review" : "reviews"}
              {total >= 200 && " (latest 200)"}
            </p>
          </div>
        </div>

        <ul className="space-y-1" aria-label="Rating breakdown">
          {counts.map(({ stars, count }) => {
            const selected = rating === String(stars);
            return (
              <li key={stars}>
                <button
                  type="button"
                  onClick={() => onRating(selected ? "" : String(stars))}
                  aria-pressed={selected}
                  aria-label={`${stars} star: ${count} ${count === 1 ? "review" : "reviews"}. Show only these.`}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-1 text-xs transition-colors focus-visible:shadow-focus focus-visible:outline-none",
                    selected ? "bg-primary-50" : "hover:bg-lavender",
                  )}
                >
                  <span className="flex w-7 shrink-0 items-center gap-0.5 font-medium text-ink-soft">
                    {stars}
                    <Star className="size-3 fill-star text-star" aria-hidden />
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-primary-100">
                    <span
                      className={cn("block h-full rounded-full transition-[width] duration-500", stars <= 2 ? "bg-bad" : stars === 3 ? "bg-star" : "bg-primary")}
                      style={{ width: `${(count / max) * 100}%` }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right text-muted tabular-nums">{count}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:col-span-1 lg:w-64 lg:grid-cols-1">
          <StatTile icon={MessageSquareDashed} label="Unanswered" value={unanswered} hint="No live reply yet" tone="warn" active={status === "needs"} onClick={onNeedsReply} />
          <StatTile icon={AlertTriangle} label="Low ratings" value={negative} hint="1 to 3 stars" tone="bad" active={rating === "low"} onClick={onNegative} />
        </div>
      </div>
    </Card>
  );
}

export default function ReviewsPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const search = useDebounced(searchInput.trim());
  const replied = REPLIED_PARAM[status];

  // "low" (1 to 3 stars) isn't an API filter, so it's applied to the loaded list instead.
  const apiRating = rating === "low" ? "" : rating;
  const params = new URLSearchParams(Object.entries({ rating: apiRating, replied, search }).filter(([, value]) => value));
  const client = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => api<Client>(`/clients/${clientId}`),
  });
  const settings = useReviewSettings(clientId);
  // Unfiltered list for the summary; same key as the list with no filters, so it is shared.
  const all = useQuery({
    queryKey: ["reviews", clientId, ""],
    queryFn: () => api<Review[]>(`/clients/${clientId}/reviews?`),
  });
  const reviews = useQuery({
    queryKey: ["reviews", clientId, params.toString()],
    queryFn: () => api<Review[]>(`/clients/${clientId}/reviews?${params}`),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["reviews", clientId] });
  const sync = useMutation({
    mutationFn: () => api(`/clients/${clientId}/reviews/sync`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Reviews are up to date");
      return refresh();
    },
    onError: (error) => toastError(error),
  });

  const visible = useMemo(() => {
    let list = reviews.data ?? [];
    if (rating === "low") list = list.filter(isNegative);
    if (status === "needs") return list.filter((review) => replyStatus(review) === "needs_reply");
    if (status === "pending") return list.filter((review) => ["draft", "scheduled", "failed"].includes(replyStatus(review)));
    return list;
  }, [reviews.data, status, rating]);

  const filtered = Boolean(rating || search || status !== "all");
  const clearFilters = () => {
    setRating("");
    setStatus("all");
    setSearchInput("");
  };
  const modeLabel = settings.data ? (settings.data.autoReplyEnabled ? REPLY_MODES.find((m) => m.value === settings.data.mode)?.short : "Off") : null;

  return (
    <>
      <PageHeader
        title="Reviews"
        subtitle="New reviews are checked every 15 minutes"
        actions={
          <>
            <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
              <Bot aria-hidden />
              AI replies
              {modeLabel && (
                <Badge tone={settings.data?.autoReplyEnabled ? "primary" : "neutral"} className="ml-0.5 px-2">
                  {modeLabel}
                </Badge>
              )}
            </Button>
            <Button loading={sync.isPending} onClick={() => sync.mutate()}>
              {!sync.isPending && <RefreshCw aria-hidden />}
              Sync now
            </Button>
          </>
        }
      />
      {client.data && <ClientBanner status={client.data.status} />}

      {all.isPending ? (
        <SummarySkeleton />
      ) : all.data && all.data.length > 0 ? (
        <Summary
          reviews={all.data}
          rating={rating}
          onRating={setRating}
          status={status}
          onNeedsReply={() => setStatus(status === "needs" ? "all" : "needs")}
          onNegative={() => setRating(rating === "low" ? "" : "low")}
        />
      ) : null}

      {(all.data?.length ?? 0) > 0 && (
        <div className="mb-5 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1 basis-60">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
              <Input
                type="search"
                aria-label="Search reviews"
                placeholder="Search by name or words in the review"
                className="pl-9"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>
            <div className="max-w-full overflow-x-auto">
              <Segmented label="Reply status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
            </div>
          </div>
          <div role="group" aria-label="Filter by rating" className="flex flex-wrap items-center gap-2">
            {["", "5", "4", "3", "2", "1", "low"].map((value) => {
              const selected = rating === value;
              return (
                <button
                  key={value || "all"}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setRating(value)}
                  className={cn(
                    "inline-flex h-8 cursor-pointer items-center gap-1 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:shadow-focus focus-visible:outline-none",
                    selected ? "border-primary bg-primary text-white shadow-sm shadow-primary/20" : "border-line-strong bg-surface text-ink-soft hover:border-primary-300 hover:bg-primary-50",
                  )}
                >
                  {value === "low" ? (
                    <>
                      <AlertTriangle className={cn("size-3", selected ? "text-white" : "text-bad")} aria-hidden />
                      Low ratings
                    </>
                  ) : value ? (
                    <>
                      {value}
                      <Star className={cn("size-3", selected ? "fill-white text-white" : "fill-star text-star")} aria-hidden />
                      <span className="sr-only">stars</span>
                    </>
                  ) : (
                    "All ratings"
                  )}
                </button>
              );
            })}
            {filtered && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X aria-hidden />
                Clear filters
              </Button>
            )}
          </div>
        </div>
      )}

      {reviews.isPending && <ListSkeleton />}
      {reviews.isError && <ErrorState error={reviews.error} onRetry={() => reviews.refetch()} />}
      {reviews.isSuccess &&
        visible.length === 0 &&
        (filtered ? (
          <EmptyState
            icon={Search}
            title="No reviews match these filters"
            body="Try another rating or reply status, or clear the search."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={MessageSquare}
            title="No reviews yet"
            body="Google reviews for this client show up here, with AI reply drafts ready for you. Sync now to pull the latest."
            action={
              <Button loading={sync.isPending} onClick={() => sync.mutate()}>
                {!sync.isPending && <RefreshCw aria-hidden />}
                Sync now
              </Button>
            }
            secondary={
              <Button variant="ghost" onClick={() => setSettingsOpen(true)}>
                Set up AI replies
              </Button>
            }
          />
        ))}
      {visible.length > 0 && (
        <>
          <p className="mb-3 text-xs font-medium text-muted" aria-live="polite">
            Showing {formatNumber(visible.length)} {visible.length === 1 ? "review" : "reviews"}
          </p>
          <div className="space-y-4">
            {visible.map((review) => (
              <ReviewCard key={review.id} clientId={clientId} review={review} onChanged={refresh} />
            ))}
          </div>
        </>
      )}

      <ReviewSettingsDrawer clientId={clientId} open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
