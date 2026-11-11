"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, BookOpen, Check, CheckCircle2, Circle, CircleDashed, Copy, KeyRound, Link2, ListChecks, RefreshCw, Unplug, Zap } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { LocationChecklist } from "@/components/location-checklist";
import { PageHeader } from "@/components/page-header";
import { ErrorState, Notice } from "@/components/states";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { LoadingBlock, Skeleton } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toast";
import { api, apiUrl } from "@/lib/api";
import type { Connection, GoogleCredentials, GoogleStatus } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

const RESULTS: Record<string, { text: string; good?: boolean }> = {
  connected: { text: "Google account connected.", good: true },
  denied: { text: "Google access wasn't granted." },
  mismatch: { text: "That isn't the expected agency account. Confirm it below, or reconnect with the right one." },
  different_account: { text: "Disconnect the current agency account before connecting another." },
  missing_permission: { text: "Permission missing. Reconnect and tick the Business Profile checkbox on Google's screen." },
  no_refresh_token: { text: "Google didn't return a long-term token. Remove this app's access in your Google account, then connect again." },
  no_credentials: { text: "Add your Google Client ID and Secret first." },
  redirect_mismatch: { text: "Google rejected the redirect URI. Copy the URI below into your OAuth client exactly." },
  invalid_grant: { text: "Google rejected the sign-in code. Please try again." },
  invalid_client: { text: "Google rejected the Client ID or Secret. Check them, then test them below." },
  quota_zero: { text: "Business Profile API access not yet approved for this project. See the setup guide below." },
  expired: { text: "That sign-in took too long. Please try again." },
  failed: { text: "Connecting Google failed. Please try again." },
};

function ConnectResult() {
  const result = RESULTS[useSearchParams().get("google") ?? ""];
  if (!result) return null;
  return (
    <Notice tone={result.good ? "good" : "warn"} icon={result.good ? CheckCircle2 : AlertTriangle} className="mb-6">
      {result.text}
    </Notice>
  );
}

function CopyLine({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-lavender py-1.5 pr-1.5 pl-3">
      <code className="min-w-0 flex-1 font-mono text-xs break-all text-ink-soft">{value}</code>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={copied ? "Copied" : `Copy ${value}`}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success("Redirect URI copied");
        }}
      >
        {copied ? <Check className="text-good" aria-hidden /> : <Copy aria-hidden />}
      </Button>
    </div>
  );
}

function SetupStatus({ status }: { status: GoogleStatus }) {
  const access = { approved: "Approved", not_approved: "Not approved yet", unknown: "Not checked yet" }[status.apiAccess];
  const items = [
    { state: status.credentialsSet ? "done" : "todo", label: "OAuth credentials", detail: status.credentialsSet ? "Credentials set" : "Credentials not set" },
    { state: status.agencyConnected ? "done" : "todo", label: "Agency account", detail: status.agencyConnected ? "Agency account connected" : "Agency account not connected" },
    { state: status.apiAccess === "approved" ? "done" : "todo", label: "Business Profile API access", detail: access },
    { state: "manual", label: "Consent screen mode", detail: "Check this in Google Cloud" },
  ] as const;
  const done = items.filter((item) => item.state === "done").length;
  const total = items.filter((item) => item.state !== "manual").length;

  return (
    <Card>
      <CardHeader icon={ListChecks} title="Setup checklist" description={`${done} of ${total} done`} className="mb-4" />
      <ol className="space-y-1">
        {items.map((item, index) => (
          <li key={item.label} className="relative flex gap-3 pb-3 last:pb-0">
            {index < items.length - 1 && <span aria-hidden className={cn("absolute top-7 bottom-0 left-[11px] w-0.5 rounded-full", item.state === "done" ? "bg-primary-300" : "bg-line")} />}
            {item.state === "done" ? (
              <CheckCircle2 className="relative size-6 shrink-0 fill-good-soft text-good" aria-label="Done" />
            ) : item.state === "manual" ? (
              <CircleDashed className="relative size-6 shrink-0 text-subtle" aria-label="Check by hand" />
            ) : (
              <Circle className="relative size-6 shrink-0 text-line-strong" aria-label="Not done" />
            )}
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted">{item.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      {status.adapter === "mock" && (
        <Notice tone="warn" className="mt-4">
          Mock mode: locations, reviews and metrics here are simulated. Nothing reaches Google.
        </Notice>
      )}
    </Card>
  );
}

const CREDENTIAL_BADGE: Record<GoogleCredentials["status"], { label: string; tone: Tone }> = {
  valid: { label: "Credentials work", tone: "good" },
  invalid: { label: "Google rejected these", tone: "bad" },
  unknown: { label: "Not tested yet", tone: "neutral" },
};

function CredentialsCard({ owner }: { owner: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["google-credentials"], queryFn: () => api<GoogleCredentials>("/settings/google/credentials") });
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const data = query.data;
  useEffect(() => setClientId(data?.clientId ?? ""), [data?.clientId]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["google-credentials"] });
    queryClient.invalidateQueries({ queryKey: ["google-status"] });
  };
  const save = useMutation({
    mutationFn: () => api("/settings/google/credentials", { method: "PUT", body: { clientId, ...(clientSecret ? { clientSecret } : {}) } }),
    onSuccess: () => {
      setClientSecret("");
      toast.success("Credentials saved");
      refresh();
    },
    onError: (error) => toastError(error),
  });
  const test = useMutation({
    mutationFn: () => api<{ status: string }>("/settings/google/credentials/test", { method: "POST" }),
    onSuccess: ({ status }) => {
      if (status === "valid") toast.success("Google accepted these credentials");
      else if (status === "invalid") toast.error("Google rejected these credentials");
      else toast("Google couldn't confirm these credentials yet");
      refresh();
    },
    onError: (error) => toastError(error),
  });
  const badge = CREDENTIAL_BADGE[data?.status ?? "unknown"];

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <Card>
      <CardHeader
        icon={KeyRound}
        title="Google OAuth credentials"
        description="One Google Cloud project serves the whole app. Clients never need their own."
        actions={
          data && (
            <Badge tone={badge.tone} dot>
              {badge.label}
            </Badge>
          )
        }
      />
      {query.isPending && (
        <LoadingBlock label="Loading credentials" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-[66px]" />
            <Skeleton className="h-[66px]" />
          </div>
          <Skeleton className="h-24" />
        </LoadingBlock>
      )}
      {query.isError && <ErrorState bare error={query.error} onRetry={() => query.refetch()} />}
      {data && (
        <form onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client ID">{(props) => <Input {...props} disabled={!owner} value={clientId} onChange={(event) => setClientId(event.target.value)} />}</Field>
            <Field label="Client Secret" hint={data.maskedSecret ? "Leave blank to keep the saved secret." : undefined}>
              {(props) => (
                <Input {...props} type="password" autoComplete="off" disabled={!owner} placeholder={data.maskedSecret ?? ""} value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} />
              )}
            </Field>
          </div>
          {data.source === "env" && <p className="mt-3 text-xs text-muted">Using values from the environment. Saving here overrides them.</p>}
          {!owner && <p className="mt-3 text-xs text-muted">Only the workspace owner can change these.</p>}

          <div className="mt-5">
            <p className="mb-2 text-sm font-medium">Redirect URIs for your OAuth client</p>
            <div className="space-y-2">
              {data.redirectUris.map((uri) => (
                <CopyLine key={uri} value={uri} />
              ))}
            </div>
          </div>

          {owner && (
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-5">
              <Button type="submit" disabled={!clientId} loading={save.isPending}>
                Save
              </Button>
              <Button type="button" variant="secondary" disabled={data.source === "none"} loading={test.isPending} onClick={() => test.mutate()}>
                {!test.isPending && <Zap aria-hidden />}
                Test credentials
              </Button>
            </div>
          )}
        </form>
      )}
    </Card>
  );
}

function Detail({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn("min-w-0 rounded-xl bg-lavender/70 px-4 py-3", wide && "sm:col-span-2")}>
      <dt className="text-2xs font-semibold tracking-wide text-subtle uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function AgencyCard({ owner, expected }: { owner: boolean; expected: string | null }) {
  const queryClient = useQueryClient();
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const connections = useQuery({ queryKey: ["connections"], queryFn: () => api<Connection[]>("/google/connections") });
  const agency = connections.data?.find((connection) => connection.source === "agency" && connection.status !== "disconnected");
  const refresh = () => queryClient.invalidateQueries();
  const disconnect = useMutation({
    mutationFn: (id: string) => api(`/google/connections/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setConfirmingDisconnect(false);
      toast.success("Agency account disconnected");
      refresh();
    },
    onError: (error) => toastError(error),
  });
  const confirm = useMutation({
    mutationFn: (id: string) => api(`/google/connections/${id}/confirm-mismatch`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Using this account");
      refresh();
    },
    onError: (error) => toastError(error),
  });
  const reconnect = useMutation({
    mutationFn: (id: string) => api<{ url: string }>(`/google/connections/${id}/reconnect`, { method: "POST" }),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) => toastError(error),
  });
  const active = agency?.status === "active" && !agency.needsConfirmation;
  const state = agency ? (agency.needsConfirmation ? { label: "Needs confirming", tone: "warn" as const } : active ? { label: "Connected", tone: "good" as const } : { label: "Error", tone: "bad" as const }) : null;

  return (
    <>
      <Card>
        <CardHeader
          icon={Link2}
          title="Agency Google account"
          description="This account holds Manager access to client profiles. It's separate from your login."
          actions={
            state && (
              <Badge tone={state.tone} dot>
                {state.label}
              </Badge>
            )
          }
        />
        {connections.isPending && (
          <LoadingBlock label="Loading agency account" className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-[62px]" />
            ))}
          </LoadingBlock>
        )}
        {connections.isError && <ErrorState bare error={connections.error} onRetry={() => connections.refetch()} />}
        {connections.isSuccess && !agency && (
          <div className="flex flex-col items-start gap-4 rounded-xl border border-dashed border-primary-300 bg-primary-50/60 p-5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Not connected</p>
              <p className="mt-0.5 text-sm text-muted">{expected ? `Sign in with ${expected} and allow Business Profile access.` : "Sign in with the Google account your clients add as Manager."}</p>
            </div>
            <Button asChild>
              <a href={apiUrl("/google/oauth/start")}>
                <Link2 aria-hidden />
                Connect Google
              </a>
            </Button>
          </div>
        )}
        {agency && (
          <>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Detail label="Account">
                <span className="font-medium break-all">{agency.googleAccountEmail}</span>
              </Detail>
              <Detail label="Last sync">{formatDate(agency.lastSyncedAt)}</Detail>
              <Detail label="Found">
                {agency.accountsCount} {agency.accountsCount === 1 ? "account" : "accounts"}, {agency.locationsCount} {agency.locationsCount === 1 ? "location" : "locations"}
              </Detail>
              <Detail label="Status">{state?.label}</Detail>
              <Detail label="Scopes granted" wide>
                <span className="font-mono text-xs break-all text-ink-soft">{agency.scopes.join(" ")}</span>
              </Detail>
            </dl>
            {agency.lastError && (
              <Notice tone="bad" icon={AlertTriangle} className="mt-4">
                {agency.lastError}
              </Notice>
            )}
            {agency.needsConfirmation && (
              <Notice tone="warn" icon={AlertTriangle} className="mt-4">
                You connected {agency.googleAccountEmail}, but the expected agency account is {expected}.
              </Notice>
            )}
            <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-5">
              {agency.needsConfirmation && owner && (
                <Button loading={confirm.isPending} onClick={() => confirm.mutate(agency.id)}>
                  Use this account
                </Button>
              )}
              <Button variant="secondary" loading={reconnect.isPending} onClick={() => reconnect.mutate(agency.id)}>
                {!reconnect.isPending && <RefreshCw aria-hidden />}
                Reconnect
              </Button>
              {owner && (
                <Button variant="danger" className="sm:ml-auto" onClick={() => setConfirmingDisconnect(true)}>
                  <Unplug aria-hidden />
                  Disconnect
                </Button>
              )}
            </div>
          </>
        )}
      </Card>
      {agency && active && <LocationChecklist connectionId={agency.id} />}
      {agency && (
        <ConfirmDialog
          open={confirmingDisconnect}
          onOpenChange={setConfirmingDisconnect}
          title="Disconnect this account?"
          description="Clients will need a reconnect. Their data is kept."
          confirmLabel="Disconnect"
          danger
          loading={disconnect.isPending}
          onConfirm={() => disconnect.mutate(agency.id)}
        />
      )}
    </>
  );
}

function SetupGuide() {
  const steps = [
    "In Google Cloud, enable the Business Profile APIs: Account Management, Business Information, Performance, and My Business.",
    "Set up the OAuth consent screen and add axxeler@gmail.com and baranikumargd2@gmail.com as Test users.",
    "Create a Web application OAuth client and add both redirect URIs from the credentials card.",
    "Apply for Business Profile API access. Google asks for a verified profile active for 60+ days and a valid website.",
    "While the consent screen is in Testing, refresh tokens expire after 7 days, so reconnect the agency account weekly until the app is published.",
  ];
  return (
    <Card>
      <CardHeader icon={BookOpen} title="Setup guide" description="Once per Google Cloud project" className="mb-4" />
      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3 text-sm text-ink-soft">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-2xs font-semibold text-primary-800">{index + 1}</span>
            <span className="min-w-0 pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export default function GoogleSettingsPage() {
  const status = useQuery({ queryKey: ["google-status"], queryFn: () => api<GoogleStatus>("/settings/google/status") });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<{ role: string }>("/me") });
  const owner = me.data?.role === "owner";

  return (
    <>
      <Link href="/settings?tab=google" className="mb-3 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-muted hover:text-primary">
        <ArrowLeft className="size-4" aria-hidden />
        Settings
      </Link>
      <PageHeader title="Google" subtitle="One agency account connects every client profile." />
      <Suspense>
        <ConnectResult />
      </Suspense>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="space-y-6 lg:sticky lg:top-6 lg:order-2">
          {status.isPending && <Skeleton className="h-[300px] rounded-card" />}
          {status.isError && <ErrorState error={status.error} onRetry={() => status.refetch()} />}
          {status.data && <SetupStatus status={status.data} />}
          <div className="hidden lg:block">
            <SetupGuide />
          </div>
        </aside>
        <div className="min-w-0 space-y-6 lg:order-1">
          <CredentialsCard owner={owner} />
          {status.isPending && <Skeleton className="h-[260px] rounded-card" />}
          {status.data && <AgencyCard owner={owner} expected={status.data.expectedAgencyEmail} />}
          <div className="lg:hidden">
            <SetupGuide />
          </div>
        </div>
      </div>
    </>
  );
}
