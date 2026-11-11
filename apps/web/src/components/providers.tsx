"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toast";
import { ApiFailure } from "@/lib/api";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Cached data shows at once; a background refetch follows.
            staleTime: 30_000,
            gcTime: 30 * 60_000,
            retry: (count, error) => count < 2 && !(error instanceof ApiFailure && error.status < 500),
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
