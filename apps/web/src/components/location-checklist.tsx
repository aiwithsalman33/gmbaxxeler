"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, RefreshCw } from "lucide-react";
import { useState } from "react";
import { EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { GbpLocation } from "@/lib/types";

const keyOf = (location: GbpLocation) => `${location.accountId}/${location.locationId}`;

/** Every location the agency Google account can reach, ready to import. */
export function LocationChecklist({ connectionId }: { connectionId: string }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const locations = useQuery({ queryKey: ["locations", connectionId], queryFn: () => api<GbpLocation[]>("/locations") });

  const refresh = () => {
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ["locations"] });
    queryClient.invalidateQueries({ queryKey: ["clients"] });
    queryClient.invalidateQueries({ queryKey: ["connections"] });
  };
  const rescan = useMutation({ mutationFn: () => api(`/google/connections/${connectionId}/rescan`, { method: "POST" }), onSuccess: refresh });
  const importClients = useMutation({
    mutationFn: (body: object) => api("/clients/import", { method: "POST", body }),
    onSuccess: refresh,
  });

  const available = locations.data?.filter((location) => !location.clientId) ?? [];
  const picked = available.filter((location) => selected.has(keyOf(location)));
  const error = rescan.error ?? importClients.error;

  function toggle(key: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(key);
    else next.delete(key);
    setSelected(next);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Locations this account can reach</CardTitle>
          <p className="mt-1 text-sm text-muted">{locations.data ? `${locations.data.length} found, ${available.length} not imported yet` : "Checking Google"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={rescan.isPending} onClick={() => rescan.mutate()}>
            <RefreshCw className={rescan.isPending ? "size-4 animate-spin" : "size-4"} />
            Re-scan locations
          </Button>
          <Button variant="secondary" disabled={available.length === 0 || importClients.isPending} onClick={() => importClients.mutate({ all: true })}>
            Import all
          </Button>
          <Button
            disabled={picked.length === 0 || importClients.isPending}
            onClick={() => importClients.mutate({ locations: picked.map(({ accountId, locationId }) => ({ accountId, locationId })) })}
          >
            Import selected{picked.length ? ` (${picked.length})` : ""}
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {error.message}
        </p>
      )}
      {locations.isPending && <Skeleton className="mt-4 h-40" />}
      {locations.isError && (
        <div className="mt-4">
          <ErrorState error={locations.error} onRetry={() => locations.refetch()} />
        </div>
      )}
      {locations.data?.length === 0 && (
        <div className="mt-4">
          <EmptyState icon={MapPin} title="No locations yet" body="Locations appear once clients add this account as Manager." />
        </div>
      )}
      {locations.data && locations.data.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {locations.data.map((location) => {
            const key = keyOf(location);
            return (
              <li key={key}>
                <label className={location.clientId ? "flex items-center gap-3 py-3" : "flex cursor-pointer items-center gap-3 py-3"}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${location.title}`}
                    className="size-4 accent-primary"
                    disabled={Boolean(location.clientId)}
                    checked={Boolean(location.clientId) || selected.has(key)}
                    onChange={(event) => toggle(key, event.target.checked)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{location.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {[location.address, location.categories[0], location.accountName].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {location.clientId && <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-good">Imported</span>}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
