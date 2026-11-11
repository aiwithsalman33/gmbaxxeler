import { cn } from "@/lib/utils";

/** Placeholder block. Give it the size of what will load there so the page doesn't jump. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-xl", className)} />;
}

/** Screen-reader friendly wrapper for a group of skeletons. */
export function LoadingBlock({ label = "Loading", className, children }: { label?: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-label={label} aria-busy className={className}>
      {children}
    </div>
  );
}

export function SkeletonCards({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <LoadingBlock className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-32" />
      ))}
    </LoadingBlock>
  );
}

export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <LoadingBlock className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </LoadingBlock>
  );
}
