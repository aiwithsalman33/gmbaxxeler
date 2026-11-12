"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CloudDownload, Inbox, Link2, Plus, RefreshCw, Search, Send, ShieldCheck, Users, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ClientCard, PendingClientRow, type ClientActions } from "./client-cards";
import { AddClientDialog, GuideDialog, ImportDialog } from "./client-dialogs";
import { ConnectClientDialog } from "./connect-dialog";
import { useClients } from "@/components/client-switcher";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, Notice } from "@/components/states";
import { CLIENT_STATUS } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { LoadingBlock, Skeleton } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { Client, ClientStatus, Connection, GoogleStatus, Invitation, Me } from "@/lib/types";

const PENDING = ["invited", "waiting_for_access"];
const SEARCH_THRESHOLD = 6;

/** Where Google sends the admin back after "Connect with Google" on one client. */
const SIGN_IN_RESULTS: Record<string, { tone: "success" | "error" | "info"; text: string }> = {
  connected: { tone: "success", text: "Google account connected" },
  choose: { tone: "info", text: "Google account connected. Pick the right business." },
  not_found: { tone: "info", text: "That Google account doesn't manage this business" },
  denied: { tone: "error", text: "Google sign-in was cancelled" },
  missing_permission: { tone: "error", text: "Business Profile permission wasn't granted. Tick the box on Google's screen." },
  no_refresh_token: { tone: "error", text: "Google didn't return a refresh token. Remove AX Grow from that account's third-party access and try again." },
  expired: { tone: "error", text: "The sign-in took too long. Please try again." },
  redirect_mismatch: { tone: "error", text: "Google rejected the redirect URL. Check Settings > Google." },
  invalid_client: { tone: "error", text: "The Google client ID or secret is wrong. Check Settings > Google." },
  quota_zero: { tone: "error", text: "Google hasn't approved Business Profile API access for this project yet." },
};

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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-[168px]" />
        <Skeleton className="h-[168px]" />
      </div>
      <Skeleton className="h-6 w-40" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
  // "linked" is any agency account; "agency" is one the server will actually use. An account that
  // differs from AGENCY_GOOGLE_EMAIL stays inactive until an owner confirms it.
  const linked = connections.data?.find((connection) => connection.source === "agency" && connection.status === "active");
  const agency = linked && !linked.needsConfirmation ? linked : undefined;
  const googleStatus = useQuery({ queryKey: ["google-status"], queryFn: () => api<GoogleStatus>("/settings/google/status") });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me") });
  const confirmAccount = useMutation({
    mutationFn: (id: string) => api(`/google/connections/${id}/confirm-mismatch`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Agency account confirmed", { description: "Its businesses are being added as clients." });
      refreshAll();
    },
    onError: (error) => toastError(error),
  });
  const invitations = useQuery({ queryKey: ["invitations"], queryFn: () => api<Invitation[]>("/invitations") });
  const mock = useQuery({
    queryKey: ["mock"],
    queryFn: () => api<{ enabled: boolean }>("/dev/mock/enabled").catch(() => ({ enabled: false })),
    staleTime: Infinity,
  });

  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [guideFor, setGuideFor] = useState<Client | null>(null);
  const [connecting, setConnecting] = useState<Client | null>(null);
  const [returnedClientId, setReturnedClientId] = useState<string | null>(null);
  const router = useRouter();

  // Back from Google: say what happened, then reopen the connect step for that client.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("google");
    if (!result) return;
    const message = SIGN_IN_RESULTS[result] ?? { tone: "error", text: "Google sign-in didn't work. Please try again." };
    if (message.tone === "success") toast.success(message.text);
    else if (message.tone === "info") toast.message(message.text);
    else toast.error(message.text);
    setReturnedClientId(params.get("client"));
    router.replace("/clients");
  }, [router]);

  useEffect(() => {
    if (!returnedClientId || !clients.data) return;
    const client = clients.data.find((candidate) => candidate.id === returnedClientId);
    setReturnedClientId(null);
    if (client) setConnecting(client);
  }, [returnedClientId, clients.data]);
  const [removing, setRemoving] = useState<Client | null>(null);
  const [matchTo, setMatchTo] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ClientStatus>("all");

  const refreshAll = () => queryClient.invalidateQueries();
  const check = useMutation({
    mutationFn: () => api<{ seen: number; accepted: number; needsReview: number; connected: number; imported: number }>("/clients/check-invitations", { method: "POST" }),
    onSuccess: (summary) => {
      toast.success(summary.imported ? `Added ${summary.imported} ${summary.imported === 1 ? "business" : "businesses"} from Google` : "Google checked", {
        description: `${summary.seen} ${summary.seen === 1 ? "invitation" : "invitations"}: ${summary.accepted} accepted, ${summary.needsReview} to review. ${summary.connected} waiting ${summary.connected === 1 ? "client" : "clients"} connected.`,
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
  const acceptNew = useMutation({
    mutationFn: (id: string) => api<{ connected: number; imported: number }>(`/invitations/${id}/accept-new`, { method: "POST" }),
    onSuccess: (result) => {
      toast.success("Invitation accepted", {
        description: result.imported ? `Added ${result.imported} ${result.imported === 1 ? "business" : "businesses"} as clients.` : "It appears in your clients once Google lists it, usually within a few minutes.",
      });
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
    onConnect: setConnecting,
    onPause: (client, paused) => pause.mutate({ id: client.id, paused }),
    onRemove: setRemoving,
    onSimulate: mock.data?.enabled ? (client) => simulate.mutate(client.id) : undefined,
  };

  const owner = me.data?.role === "owner";
  const googleHealth = linked?.needsConfirmation ? (
    <Notice
      tone="warn"
      icon={AlertTriangle}
      title={`Confirm ${linked.googleAccountEmail} as your agency account`}
      className="mb-6"
      action={
        owner ? (
          <Button size="sm" loading={confirmAccount.isPending} onClick={() => confirmAccount.mutate(linked.id)}>
            Use this account
          </Button>
        ) : undefined
      }
    >
      This app was set up for {googleStatus.data?.expectedAgencyEmail ?? "a different Gmail"} (AGENCY_GOOGLE_EMAIL). Until this account is confirmed, its businesses can&apos;t be listed, imported or
      checked{owner ? ". Confirming adds every business it manages as a client." : ". Ask the workspace owner to confirm it."}
    </Notice>
  ) : agency && googleStatus.data?.apiAccess === "not_approved" ? (
    <Notice tone="bad" icon={AlertTriangle} title="Google hasn't approved Business Profile API access yet" className="mb-6" action={<Button asChild size="sm" variant="secondary"><Link href="/settings/google">Settings &gt; Google</Link></Button>}>
      Your Google Cloud project has zero Business Profile quota, so no businesses can be listed and nothing can be posted. Apply for access in Google Cloud; this clears by itself once approved.
    </Notice>
  ) : agency?.lastError ? (
    <Notice tone="bad" icon={AlertTriangle} title="Google returned an error" className="mb-6" action={<Button size="sm" variant="secondary" loading={check.isPending} onClick={() => check.mutate()}>Try again</Button>}>
      {agency.lastError}
    </Notice>
  ) : null;

  const header = (
    <PageHeader
      title="Clients"
      subtitle={
        linked ? (
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            {agency ? <ShieldCheck className="size-4 text-good" aria-hidden /> : <AlertTriangle className="size-4 text-warn" aria-hidden />}
            Agency account <span className="font-medium break-all text-ink-soft">{linked.googleAccountEmail}</span>
            {agency ? (
              <span className="text-subtle">
                · {agency.accountsCount} Google {agency.accountsCount === 1 ? "account" : "accounts"}, {agency.locationsCount} {agency.locationsCount === 1 ? "profile" : "profiles"}
              </span>
            ) : (
              <Badge tone="warn">Needs confirming</Badge>
            )}
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
          <Button variant="secondary" loading={check.isPending} disabled={!agency} title={agency ? "Check Google for invitations and businesses not added yet" : linked ? "Confirm the agency account first" : "Connect Google first"} onClick={() => check.mutate()}>
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
          setConnecting(client);
          refreshAll();
        }}
      />
      <ConnectClientDialog
        client={connecting}
        onClose={() => setConnecting(null)}
        onChanged={refreshAll}
        onSendGuide={(client) => {
          setConnecting(null);
          setGuideFor(client);
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
  if (all.length === 0 && !linked) {
    return (
      <>
        {header}
        {googleHealth}
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

      {googleHealth}

      {!linked && (
        <Card className="mb-6 flex flex-wrap items-center gap-4 border-primary-200 bg-gradient-to-r from-primary-50 to-surface">
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
        <ActionCard icon={CloudDownload} title="Import from Google" body="Every business your agency Google account manages is added automatically. Pick or re-add specific ones here.">
          {agency ? (
            <Button variant="secondary" onClick={() => setImporting(true)}>
              Choose locations
              <ArrowRight aria-hidden />
            </Button>
          ) : linked ? (
            <Button variant="secondary" disabled>
              Confirm the account above first
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
          <Card className="border-warn-line">
            <CardHeader
              icon={Inbox}
              title={
                <span className="inline-flex items-center gap-2">
                  Unmatched invitations <Badge tone="warn">{unmatched.length}</Badge>
                </span>
              }
              description="These weren't a confident match, so they weren't accepted. Accept one for a waiting client, accept it as a new client, or decline."
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
                      {/* Matching to a waiting client only makes sense when there is one. */}
                      {pending.length > 0 && (
                        <>
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
                        </>
                      )}
                      <Button size="sm" variant="secondary" loading={acceptNew.isPending && acceptNew.variables === invitation.id} onClick={() => acceptNew.mutate(invitation.id)}>
                        Accept as new client
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
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
