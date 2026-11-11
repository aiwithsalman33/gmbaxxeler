"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MapPin, RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import { EmptyState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingBlock, Skeleton } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { GbpLocation } from "@/lib/types";
import { cn } from "@/lib/utils";

const keyOf = (location: GbpLocation) => `${location.accountId}/${location.locationId}`;

/**
 * Every location the agency Google account can reach, ready to import.
 * `bare` drops the card frame so it can sit inside a dialog.
 */
export function LocationChecklist({ connectionId, bare, onImported }: { connectionId: string; bare?: boolean; onImported?: (count: number) => void }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const locations = useQuery({ queryKey: ["locations", connectionId], queryFn: () => api<GbpLocation[]>("/locations") });

  const refresh = () => {
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ["locations"] });
    queryClient.invalidateQueries({ queryKey: ["clients"] });
    queryClient.invalidateQueries({ queryKey: ["connections"] });
  };
  const rescan = useMutation({
    mutationFn: () => api(`/google/connections/${connectionId}/rescan`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Locations re-scanned");
      refresh();
    },
    onError: (error) => toastError(error),
  });
  const importClients = useMutation({
    mutationFn: (body: object) => api<unknown[]>("/clients/import", { method: "POST", body }),
    onSuccess: (imported) => {
      const count = Array.isArray(imported) ? imported.length : 0;
      toast.success(count === 1 ? "Imported 1 client" : `Imported ${count} clients`, { description: "Their first sync runs in the background." });
      refresh();
      onImported?.(count);
    },
    onError: (error) => toastError(error),
  });

  const all = locations.data ?? [];
  const available = all.filter((location) => !location.clientId);
  const picked = available.filter((location) => selected.has(keyOf(location)));
  const needle = filter.trim().toLowerCase();
  const shown = needle ? all.filter((l) => [l.title, l.address, l.accountName, ...l.categories].some((v) => v?.toLowerCase().includes(needle))) : all;
  const allPicked = available.length > 0 && picked.length === available.length;

  function toggle(key: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(key);
    else next.delete(key);
    setSelected(next);
  }

  const actions = (
    <>
      <Button variant="secondary" size="sm" loading={rescan.isPending} onClick={() => rescan.mutate()}>
        {!rescan.isPending && <RefreshCw aria-hidden />}
        Re-scan locations
      </Button>
      <Button variant="secondary" size="sm" disabled={available.length === 0 || importClients.isPending} onClick={() => importClients.mutate({ all: true })}>
        Import all
      </Button>
      <Button
        size="sm"
        disabled={picked.length === 0}
        loading={importClients.isPending}
        onClick={() => importClients.mutate({ locations: picked.map(({ accountId, locationId }) => ({ accountId, locationId })) })}
      >
        Import selected{picked.length ? ` (${picked.length})` : ""}
      </Button>
    </>
  );

  const body = (
    <>
      {locations.isPending && (
        <LoadingBlock label="Loading locations" className="space-y-2">
          {[0, 1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-[60px]" />
          ))}
        </LoadingBlock>
      )}
      {locations.isError && <ErrorState bare error={locations.error} onRetry={() => locations.refetch()} />}
      {locations.data?.length === 0 && (
        <EmptyState bare icon={MapPin} title="No locations yet" body="Business profiles show up here once a client adds your agency Google account as Manager. Then re-scan." />
      )}
      {all.length > 0 && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            {all.length > 5 && (
              <div className="relative min-w-0 flex-1 basis-56">
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
                <Input aria-label="Search locations" placeholder="Search by name, address or category" className="pl-9" value={filter} onChange={(event) => setFilter(event.target.value)} />
              </div>
            )}
            {available.length > 0 && (
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={allPicked}
                  onChange={(event) => setSelected(event.target.checked ? new Set(available.map(keyOf)) : new Set())}
                />
                Select all not imported
              </label>
            )}
          </div>
          <ul className="space-y-2">
            {shown.map((location) => {
              const key = keyOf(location);
              const imported = Boolean(location.clientId);
              const on = imported || selected.has(key);
              return (
                <li key={key}>
                  <label
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                      imported ? "border-transparent bg-lavender/70" : "cursor-pointer border-line hover:border-primary-300",
                      !imported && on && "border-primary-300 bg-primary-50",
                    )}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select ${location.title}`}
                      className="size-4 shrink-0 accent-primary"
                      disabled={imported}
                      checked={on}
                      onChange={(event) => toggle(key, event.target.checked)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm font-medium", imported && "text-muted")}>{location.title}</span>
                      <span className="block truncate text-xs text-muted">{[location.address, location.categories[0], location.accountName].filter(Boolean).join(" · ")}</span>
                    </span>
                    {imported && (
                      <Badge tone="good">
                        <CheckCircle2 className="size-3" aria-hidden />
                        Imported
                      </Badge>
                    )}
                  </label>
                </li>
              );
            })}
            {shown.length === 0 && <li className="py-6 text-center text-sm text-muted">No locations match &ldquo;{filter}&rdquo;.</li>}
          </ul>
        </>
      )}
    </>
  );

  const summary = locations.data ? `${all.length} found, ${available.length} not imported yet` : "Checking Google…";

  if (bare) {
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">{summary}</p>
          <div className="flex flex-wrap gap-2">{actions}</div>
        </div>
        {body}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader icon={MapPin} title="Locations this account can reach" description={summary} actions={actions} />
      {body}
    </Card>
  );
}
