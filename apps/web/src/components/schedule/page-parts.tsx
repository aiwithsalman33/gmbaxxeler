"use client";

import { useQuery } from "@tanstack/react-query";
import { LoadingBlock, Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

/** True when the API runs with the mock Google adapter (dev buttons are shown). */
export function useMockEnabled(): boolean {
  const mock = useQuery({
    queryKey: ["mock"],
    queryFn: () => api<{ enabled: boolean }>("/dev/mock/enabled").catch(() => ({ enabled: false })),
    staleTime: Infinity,
  });
  return mock.data?.enabled ?? false;
}

export function SchedulePageSkeleton({ label }: { label: string }) {
  return (
    <LoadingBlock label={label}>
      <div className="mb-6 space-y-2 sm:mb-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-[420px] rounded-card" />
      <Skeleton className="mt-8 h-10 w-56" />
      <QueueSkeleton className="mt-5" />
    </LoadingBlock>
  );
}

export function QueueSkeleton({ className }: { className?: string }) {
  return (
    <LoadingBlock label="Loading queue" className={className}>
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {[0, 1, 2, 3].map((n) => (
          <div key={n} className="flex items-center gap-4 border-b border-line px-6 py-3.5 last:border-b-0">
            <Skeleton className="hidden h-4 w-16 sm:block" />
            <Skeleton className="size-12" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
    </LoadingBlock>
  );
}
