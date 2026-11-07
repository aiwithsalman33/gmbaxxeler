"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AddClientDialog, GuideDialog } from "./client-dialogs";
import { useClients } from "@/components/client-switcher";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Client, Connection, GbpLocation, Invitation } from "@/lib/types";

const PENDING = ["invited", "waiting_for_access"];

const locationKey = (location: GbpLocation) => `${location.accountId}/${location.locationId}`;

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const clients = useClients();
  const connections = useQuery({ queryKey: ["connections"], queryFn: () => api<Connection[]>("/google/connections") });
  const agency = connections.data?.find((connection) => connection.source === "agency" && connection.status === "active");
  const invitations = useQuery({ queryKey: ["invitations"], queryFn: () => api<Invitation[]>("/invitations") });
  const locations = useQuery({ queryKey: ["locations"], queryFn: () => api<GbpLocation[]>("/locations/unattached"), enabled: Boolean(agency) });
  const mock = useQuery({
    queryKey: ["mock"],
    queryFn: () => api<{ enabled: boolean }>("/dev/mock/enabled").catch(() => ({ enabled: false })),
    staleTime: Infinity,
  });

  const [adding, setAdding] = useState(false);
  const [guideFor, setGuideFor] = useState<Client | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [matchTo, setMatchTo] = useState<Record<string, string>>({});
  const [pollNote, setPollNote] = useState<string | null>(null);

  const refreshAll = () => queryClient.invalidateQueries();
  const check = useMutation({
    mutationFn: () => api<{ seen: number; accepted: number; needsReview: number; connected: number }>("/clients/check-invitations", { method: "POST" }),
    onSuccess: (summary) => {
      setPollNote(`Found ${summary.seen} invitations: ${summary.accepted} accepted, ${summary.needsReview} to review, ${summary.connected} connected.`);
      refreshAll();
    },
  });
  const simulate = useMutation({
    mutationFn: (id: string) => api(`/dev/mock/clients/${id}/invite`, { method: "POST" }),
    onSuccess: () => setPollNote("Mock invitation created. It would be picked up within 10 minutes, or use Check now."),
  });
  const importClients = useMutation({
    mutationFn: () => {
      const refs = (locations.data ?? []).filter((location) => selected.has(locationKey(location)));
      return api("/clients/import", { method: "POST", body: { locations: refs.map(({ accountId, locationId }) => ({ accountId, locationId })) } });
    },
    onSuccess: () => {
      setSelected(new Set());
      refreshAll();
    },
  });
  const matchInvitation = useMutation({
    mutationFn: ({ id, clientId }: { id: string; clientId: string }) => api(`/invitations/${id}/match`, { method: "POST", body: { clientId } }),
    onSuccess: refreshAll,
  });
  const decline = useMutation({ mutationFn: (id: string) => api(`/invitations/${id}/decline`, { method: "POST" }), onSuccess: refreshAll });

  if (clients.isError) return <ErrorState error={clients.error} onRetry={() => clients.refetch()} />;
  const all = clients.data ?? [];
  const pending = all.filter((client) => PENDING.includes(client.status));
  const others = all.filter((client) => !PENDING.includes(client.status));
  const mutationError = check.error ?? importClients.error ?? matchInvitation.error ?? decline.error ?? simulate.error;

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={agency ? `Agency account: ${agency.googleAccountEmail}` : undefined}
        actions={
          <>
            <Button variant="secondary" disabled={check.isPending || !agency} onClick={() => check.mutate()}>
              <RefreshCw className={check.isPending ? "size-4 animate-spin" : "size-4"} />
              Check now
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              Add client
            </Button>
          </>
        }
      />

      {connections.isSuccess && !agency && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Connect your agency Google account</CardTitle>
            <p className="mt-1 text-sm text-muted">Clients add this account as Manager, so it comes first.</p>
          </div>
          <Button asChild>
            <Link href="/settings">Connect Google</Link>
          </Button>
        </Card>
      )}
      {pollNote && <p className="mb-4 rounded-xl bg-primary-soft px-4 py-2 text-sm text-primary-dark">{pollNote}</p>}
      {mutationError && (
        <p role="alert" className="mb-4 text-sm text-bad">
          {mutationError.message}
        </p>
      )}

      {clients.isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <Card>
              <CardTitle>Waiting for access</CardTitle>
              <ul className="mt-3 divide-y divide-line">
                {pending.map((client) => (
                  <li key={client.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{client.name}</p>
                      <p className="truncate text-xs text-muted">{client.contactPhone ?? client.contactEmail}</p>
                    </div>
                    <StatusBadge status={client.status} />
                    <Button size="sm" variant="secondary" onClick={() => setGuideFor(client)}>
                      Guide
                    </Button>
                    {mock.data?.enabled && (
                      <Button size="sm" variant="ghost" onClick={() => simulate.mutate(client.id)}>
                        Simulate invite
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {(invitations.data?.length ?? 0) > 0 && (
            <Card>
              <CardTitle>Invitations to review</CardTitle>
              <p className="mt-1 text-sm text-muted">These couldn&apos;t be matched safely, so they weren&apos;t accepted.</p>
              <ul className="mt-3 divide-y divide-line">
                {invitations.data?.map((invitation) => (
                  <li key={invitation.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{invitation.locationName ?? "Unknown location"}</p>
                      <p className="truncate text-xs text-muted">{invitation.matchReason ?? invitation.address}</p>
                    </div>
                    <select
                      aria-label={`Client for ${invitation.locationName}`}
                      className="h-8 max-w-48 rounded-lg border border-line bg-white px-2 text-xs"
                      value={matchTo[invitation.id] ?? ""}
                      onChange={(event) => setMatchTo({ ...matchTo, [invitation.id]: event.target.value })}
                    >
                      <option value="">Choose a client</option>
                      {pending.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      disabled={!matchTo[invitation.id] || matchInvitation.isPending}
                      onClick={() => matchInvitation.mutate({ id: invitation.id, clientId: matchTo[invitation.id]! })}
                    >
                      Accept
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => decline.mutate(invitation.id)}>
                      Decline
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {(locations.data?.length ?? 0) > 0 && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Locations you can import</CardTitle>
                  <p className="mt-1 text-sm text-muted">The agency account already manages these.</p>
                </div>
                <Button disabled={selected.size === 0 || importClients.isPending} onClick={() => importClients.mutate()}>
                  Import {selected.size || ""} selected
                </Button>
              </div>
              <ul className="mt-3 divide-y divide-line">
                {locations.data?.map((location) => {
                  const key = locationKey(location);
                  return (
                    <li key={key}>
                      <label className="flex cursor-pointer items-center gap-3 py-3">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={selected.has(key)}
                          onChange={(event) => {
                            const next = new Set(selected);
                            if (event.target.checked) next.add(key);
                            else next.delete(key);
                            setSelected(next);
                          }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{location.title}</span>
                          <span className="block truncate text-xs text-muted">{location.address}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {others.length > 0 && (
            <Card>
              <CardTitle>All clients</CardTitle>
              <ul className="mt-3 divide-y divide-line">
                {others.map((client) => (
                  <li key={client.id} className="flex items-center gap-3 py-3">
                    <Link href={`/${client.id}/dashboard`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary">
                      {client.name}
                    </Link>
                    {client.stats && <span className="text-xs text-muted">Strength {client.stats.strengthScore}</span>}
                    <StatusBadge status={client.status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {all.length === 0 && (locations.data?.length ?? 0) === 0 && (
            <EmptyState
              icon={Users}
              title="No clients yet"
              body="Add a client and send them the guide. Once they add your agency account as Manager, they connect automatically."
              action={<Button onClick={() => setAdding(true)}>Add client</Button>}
            />
          )}
        </div>
      )}

      <AddClientDialog
        open={adding}
        onOpenChange={setAdding}
        onCreated={(client) => {
          setAdding(false);
          setGuideFor(client);
          refreshAll();
        }}
      />
      <GuideDialog client={guideFor} onClose={() => setGuideFor(null)} onSent={refreshAll} />
    </>
  );
}
