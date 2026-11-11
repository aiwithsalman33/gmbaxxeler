"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CloudDownload, Inbox, Link2, Plus, RefreshCw, Search, Send, ShieldCheck, Users, Wand2 } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ClientCard, PendingClientRow, type ClientActions } from "./client-cards";
import { AddClientDialog, GuideDialog, ImportDialog } from "./client-dialogs";
import { useClients } from "@/components/client-switcher";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { CLIENT_STATUS } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { LoadingBlock, Skeleton } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { Client, ClientStatus, Connection, Invitation } from "@/lib/types";

const PENDING = ["invited", "waiting_for_access"];
const SEARCH_THRESHOLD = 6;

function ActionCard({ icon: Icon, title, body, children }: { icon: typeof Users; title: string; body: string; children: ReactNode }) {
  return (
    <Card className="relative flex flex-col overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-primary-100/50 blur-2xl" />
      <div className="relative flex items-start gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-100 to-primary-200 text-primary-700 ring-1 ring-primary-200">
          <Icon className="size-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted">{body}</p>
        </div>
      </div>
      <div className="relative mt-5 flex flex-wrap gap-2 sm:pl-15">{children}</div>
    </Card>
  );
}

function ClientsSkeleton() {
  return (
    <LoadingBlock label="Loading clients" className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-[168px]" />
        <Skeleton className="h-[168px]" />
      </div>
      <Skeleton className="h-6 w-40" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <Skeleton key={n} className="h-[212px] rounded-card" />
        ))}
      </div>
    </LoadingBlock>
  );
}

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const clients = useClients();
  const connections = useQuery({ queryKey: ["connections"], queryFn: () => api<Connection[]>("/google/connections") });
  const agency = connections.data?.find((connection) => connection.source === "agency" && connection.status === "active");
  const invitations = useQuery({ queryKey: ["invitations"], queryFn: () => api<Invitation[]>("/invitations") });
  const mock = useQuery({
    queryKey: ["mock"],
    queryFn: () => api<{ enabled: boolean }>("/dev/mock/enabled").catch(() => ({ enabled: false })),
    staleTime: Infinity,
  });

  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [guideFor, setGuideFor] = useState<Client | null>(null);
  const [removing, setRemoving] = useState<Client | null>(null);
  const [matchTo, setMatchTo] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ClientStatus>("all");

  const refreshAll = () => queryClient.invalidateQueries();
  const check = useMutation({
    mutationFn: () => api<{ seen: number; accepted: number; needsReview: number; connected: number }>("/clients/check-invitations", { method: "POST" }),
    onSuccess: (summary) => {
      toast.success(`Found ${summary.seen} ${summary.seen === 1 ? "invitation" : "invitations"}`, {
        description: `${summary.accepted} accepted, ${summary.needsReview} to review, ${summary.connected} connected.`,
      });
      refreshAll();
    },
    onError: (error) => toastError(error),
  });
  const simulate = useMutation({
    mutationFn: (id: string) => api(`/dev/mock/clients/${id}/invite`, { method: "POST" }),
    onSuccess: () => toast.success("Mock invitation created", { description: "It would be picked up within 10 minutes, or use Check now." }),
    onError: (error) => toastError(error),
  });
  const simulateSample = useMutation({
    mutationFn: () => api("/dev/mock/sample-invitations", { method: "POST" }),
    onSuccess: () => toast.success("Two mock invitations created", { description: "One clean match and one unsure. Use Check now." }),
    onError: (error) => toastError(error),
  });
  const matchInvitation = useMutation({
    mutationFn: ({ id, clientId }: { id: string; clientId: string }) => api(`/invitations/${id}/match`, { method: "POST", body: { clientId } }),
    onSuccess: () => {
      toast.success("Invitation accepted");
      refreshAll();
    },
    onError: (error) => toastError(error),
  });
  const decline = useMutation({
    mutationFn: (id: string) => api(`/invitations/${id}/decline`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Invitation declined");
      refreshAll();
    },
    onError: (error) => toastError(error),
  });
  const pause = useMutation({
    mutationFn: ({ id, paused }: { id: string; paused: boolean }) => api(`/clients/${id}`, { method: "PATCH", body: { paused } }),
    onSuccess: (_, { paused }) => {
      toast.success(paused ? "Automations paused" : "Automations resumed");
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (error) => toastError(error),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/clients/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(`${removing?.name ?? "Client"} removed`);
      setRemoving(null);
      refreshAll();
    },
    onError: (error) => toastError(error),
  });

  const actions: ClientActions = {
    onGuide: setGuideFor,
    onPause: (client, paused) => pause.mutate({ id: client.id, paused }),
    onRemove: setRemoving,
    onSimulate: mock.data?.enabled ? (client) => simulate.mutate(client.id) : undefined,
  };

  const header = (
    <PageHeader
      title="Clients"
      subtitle={
        agency ? (
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <ShieldCheck className="size-4 text-good" aria-hidden />
            Agency account <span className="font-medium break-all text-ink-soft">{agency.googleAccountEmail}</span>
          </span>
        ) : (
          "Every business you manage, and the ones still waiting to give you access."
        )
      }
      actions={
        <>
          {mock.data?.enabled && (
            <Button variant="ghost" loading={simulateSample.isPending} onClick={() => simulateSample.mutate()}>
              {!simulateSample.isPending && <Wand2 aria-hidden />}
              Simulate invitations
            </Button>
          )}
          <Button variant="secondary" loading={check.isPending} disabled={!agency} title={agency ? "Look for new Manager invitations" : "Connect Google first"} onClick={() => check.mutate()}>
            {!check.isPending && <RefreshCw aria-hidden />}
            Check now
          </Button>
          <Button className="max-sm:order-first" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            Add client
          </Button>
        </>
      }
    />
  );

  const dialogs = (
    <>
      <AddClientDialog
        open={adding}
        onOpenChange={setAdding}
        onCreated={(client) => {
          setAdding(false);
          setGuideFor(client);
          refreshAll();
        }}
      />
      {agency && <ImportDialog open={importing} onOpenChange={setImporting} connectionId={agency.id} />}
      <GuideDialog client={guideFor} onClose={() => setGuideFor(null)} onSent={refreshAll} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.name ?? "client"}?`}
        description="Automations for this business stop and it leaves your client list. Nothing is deleted on Google."
        confirmLabel="Remove client"
        danger
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </>
  );

  if (clients.isError) {
    return (
      <>
        {header}
        <ErrorState error={clients.error} onRetry={() => clients.refetch()} />
      </>
    );
  }

  if (clients.isPending || connections.isPending) {
    return (
      <>
        {header}
        <ClientsSkeleton />
        {dialogs}
      </>
    );
  }

  const all = clients.data;
  const pending = all.filter((client) => PENDING.includes(client.status));
  const others = all.filter((client) => !PENDING.includes(client.status));
  const unmatched = invitations.data ?? [];
  const needle = search.trim().toLowerCase();
  const visible = others.filter(
    (client) => (statusFilter === "all" || client.status === statusFilter) && (!needle || [client.name, client.address].some((v) => v?.toLowerCase().includes(needle))),
  );
  const statusesInUse = [...new Set(others.map((client) => client.status))];

  // No agency account and nothing yet: one prominent connect card is the whole page.
  if (all.length === 0 && !agency) {
    return (
      <>
        {header}
        <EmptyState
          icon={Link2}
          title="Connect your Google account to import your clients"
          body="Connect the agency Google account that manages your Business Profiles. Its businesses can then be imported here in one click."
          action={
            <Button asChild size="lg">
              <Link href="/settings/google">
                Connect Google
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          }
          secondary={
            <Button variant="secondary" size="lg" onClick={() => setAdding(true)}>
              Add a client by hand
            </Button>
          }
          className="py-16"
        />
        {dialogs}
      </>
    );
  }

  return (
    <>
      {header}

      {!agency && (
        <Card className="mb-6 flex flex-wrap items-center gap-4 border-primary-200 bg-gradient-to-r from-primary-50 to-white">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-sm shadow-primary/30">
            <Link2 className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 basis-60">
            <h2 className="text-base font-semibold">Connect your agency Google account</h2>
            <p className="mt-0.5 text-sm text-muted">Clients add this account as Manager, so it comes first. Without it, invitations can&apos;t be checked.</p>
          </div>
          <Button asChild>
            <Link href="/settings/google">Connect Google</Link>
          </Button>
        </Card>
      )}

      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <ActionCard icon={CloudDownload} title="Import from Google" body="Bring in businesses your agency Google account already manages. Pick the ones you want.">
          {agency ? (
            <Button variant="secondary" onClick={() => setImporting(true)}>
              Choose locations
              <ArrowRight aria-hidden />
            </Button>
          ) : (
            <Button asChild variant="secondary">
              <Link href="/settings/google">Connect Google first</Link>
            </Button>
          )}
        </ActionCard>
        <ActionCard icon={Send} title="Request access" body="Add a new client and send them a short guide asking them to add your agency as Manager.">
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            Add client
          </Button>
        </ActionCard>
      </div>

      <div className="space-y-8">
        {pending.length > 0 && (
          <Card>
            <CardHeader
              icon={Send}
              title={
                <span className="inline-flex items-center gap-2">
                  Waiting for access <Badge tone="primary">{pending.length}</Badge>
                </span>
              }
              description="These clients have been asked to add your agency as Manager. Check now picks up their invitations."
            />
            <ul className="divide-y divide-line">
              {pending.map((client) => (
                <PendingClientRow key={client.id} client={client} actions={actions} />
              ))}
            </ul>
          </Card>
        )}

        {unmatched.length > 0 && (
          <Card className="border-amber-200">
            <CardHeader
              icon={Inbox}
              title={
                <span className="inline-flex items-center gap-2">
                  Unmatched invitations <Badge tone="warn">{unmatched.length}</Badge>
                </span>
              }
              description="These weren't a confident match, so they weren't accepted. Choose a client and accept, or decline."
            />
            <ul className="divide-y divide-line">
              {unmatched.map((invitation) => {
                const chosen = matchTo[invitation.id] ?? invitation.suggestedClientId ?? "";
                return (
                  <li key={invitation.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{invitation.locationName ?? "Unknown location"}</p>
                      <p className="truncate text-xs text-muted">{invitation.matchReason ?? invitation.address ?? "No details from Google"}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1 sm:w-56 sm:flex-none">
                        <Select
                          aria-label={`Client for ${invitation.locationName}`}
                          className="h-8 text-xs"
                          value={chosen}
                          onChange={(event) => setMatchTo({ ...matchTo, [invitation.id]: event.target.value })}
                        >
                          <option value="">Choose a client</option>
                          {pending.map((client) => (
                            <option key={client.id} value={client.id}>
                              {client.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <Button
                        size="sm"
                        disabled={!chosen || matchInvitation.isPending}
                        loading={matchInvitation.isPending && matchInvitation.variables?.id === invitation.id}
                        onClick={() => matchInvitation.mutate({ id: invitation.id, clientId: chosen })}
                      >
                        Accept
                      </Button>
                      <Button size="sm" variant="danger" loading={decline.isPending && decline.variables === invitation.id} onClick={() => decline.mutate(invitation.id)}>
                        Decline
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {others.length > 0 && (
          <section aria-labelledby="all-clients">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="all-clients" className="text-lg font-semibold">
                  All clients
                </h2>
                <p className="text-sm text-muted">
                  {others.length} {others.length === 1 ? "business" : "businesses"}
                  {visible.length !== others.length && ` · ${visible.length} shown`}
                </p>
              </div>
              {others.length > SEARCH_THRESHOLD && (
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
                    <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
                    <Input type="search" aria-label="Search clients" placeholder="Search clients" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} />
                  </div>
                  <div className="w-44">
                    <Select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                      <option value="all">All statuses</option>
                      {statusesInUse.map((status) => (
                        <option key={status} value={status}>
                          {CLIENT_STATUS[status].label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              )}
            </div>
            {visible.length > 0 ? (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((client) => (
                  <ClientCard key={client.id} client={client} actions={actions} />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Search}
                title="No clients match"
                body="Try a different name or status."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearch("");
                      setStatusFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            )}
          </section>
        )}

        {all.length === 0 && (
          <EmptyState
            icon={Users}
            title="No clients yet"
            body="Your clients appear here as cards with their status, profile strength and rating. Import the businesses your agency account already manages, or add a client and send them the guide."
            action={
              <Button onClick={() => setImporting(true)}>
                <CloudDownload aria-hidden />
                Import from Google
              </Button>
            }
            secondary={
              <Button variant="secondary" onClick={() => setAdding(true)}>
                Add client
              </Button>
            }
          />
        )}
      </div>

      {dialogs}
    </>
  );
}
