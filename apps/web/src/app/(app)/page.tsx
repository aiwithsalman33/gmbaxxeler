"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ACTIVE_CLIENT_KEY, useClients } from "@/components/client-switcher";
import { ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";

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
  return <Skeleton className="h-64" />;
}
