"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, RefreshCw, Search, Star } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ReviewCard } from "./review-card";
import { ReviewSettingsCard } from "./review-settings-card";
import { ClientBanner } from "../client-banner";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Client, Review } from "@/lib/types";

export default function ReviewsPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState("");
  const [replied, setReplied] = useState("");
  const [search, setSearch] = useState("");
  const params = new URLSearchParams(Object.entries({ rating, replied, search }).filter(([, value]) => value));
  const client = useQuery({ queryKey: ["client", clientId], queryFn: () => api<Client>(`/clients/${clientId}`) });
  const reviews = useQuery({ queryKey: ["reviews", clientId, params.toString()], queryFn: () => api<Review[]>(`/clients/${clientId}/reviews?${params}`) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["reviews", clientId] });
  const sync = useMutation({ mutationFn: () => api(`/clients/${clientId}/reviews/sync`, { method: "POST" }), onSuccess: refresh });

  return (
    <>
      <PageHeader
        title="Reviews"
        subtitle="New reviews are checked every 15 minutes"
        actions={
          <Button variant="secondary" disabled={sync.isPending} onClick={() => sync.mutate()}>
            <RefreshCw className={sync.isPending ? "size-4 animate-spin" : "size-4"} />
            Sync
          </Button>
        }
      />
      {client.data && <ClientBanner status={client.data.status} />}
      <ReviewSettingsCard clientId={clientId} />

      <div className="mt-6 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute top-3 left-3 size-4 text-muted" />
          <Input aria-label="Search reviews" placeholder="Search reviews" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <select aria-label="Filter by rating" className="h-10 rounded-xl border border-line bg-white px-3 text-sm" value={rating} onChange={(event) => setRating(event.target.value)}>
          <option value="">All ratings</option>
          {[5, 4, 3, 2, 1].map((stars) => (
            <option key={stars} value={stars}>
              {stars} star{stars > 1 ? "s" : ""}
            </option>
          ))}
        </select>
        <select aria-label="Filter by reply status" className="h-10 rounded-xl border border-line bg-white px-3 text-sm" value={replied} onChange={(event) => setReplied(event.target.value)}>
          <option value="">All reviews</option>
          <option value="no">Unreplied</option>
          <option value="yes">Replied</option>
        </select>
      </div>

      {sync.isError && (
        <p role="alert" className="mb-3 text-sm text-bad">
          {sync.error.message}
        </p>
      )}
      {reviews.isPending && <Skeleton className="h-48" />}
      {reviews.isError && <ErrorState error={reviews.error} onRetry={() => reviews.refetch()} />}
      {reviews.data?.length === 0 &&
        (params.size > 0 ? (
          <EmptyState icon={Search} title="No matching reviews" body="Try a different filter." />
        ) : (
          <EmptyState icon={MessageSquare} title="No reviews yet" body="Choose Sync to pull this client's reviews from Google." action={<Star className="size-4 text-muted" />} />
        ))}
      <div className="space-y-4">
        {reviews.data?.map((review) => (
          <ReviewCard key={review.id} clientId={clientId} review={review} onChanged={refresh} />
        ))}
      </div>
    </>
  );
}
