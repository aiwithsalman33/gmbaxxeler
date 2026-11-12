"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ACTIVE_CLIENT_KEY, useClients } from "@/components/client-switcher";
import { ErrorState } from "@/components/states";
import { LoadingBlock, Skeleton } from "@/components/ui/skeleton";

function rememberedClient(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CLIENT_KEY);
  } catch {
    return null;
  }
}

export default function HomePage() {
  const router = useRouter();
  const { data: clients, error, refetch } = useClients();

  useEffect(() => {
    if (!clients) return;
    const remembered = rememberedClient();
    const target = clients.find((client) => client.id === remembered) ?? clients.find((client) => client.status === "connected");
    router.replace(target ? `/${target.id}/dashboard` : "/clients");
  }, [clients, router]);

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  // Shaped like the dashboard most people land on, so the redirect doesn't jump.
  return (
    <LoadingBlock label="Opening AX Grow" className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-64 max-w-[60vw]" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((n) => (
          <Skeleton key={n} className="h-[132px]" />
        ))}
      </div>
      <Skeleton className="h-[400px]" />
    </LoadingBlock>
  );
}
