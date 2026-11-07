"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Circle, Copy } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { LocationChecklist } from "@/components/location-checklist";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, apiUrl } from "@/lib/api";
import type { Connection, GoogleCredentials, GoogleStatus } from "@/lib/types";
import { formatDate } from "@/lib/utils";

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
    <p role="status" className={result.good ? "mb-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-good" : "mb-4 rounded-xl bg-amber-50 px-4 py-2 text-sm text-warn"}>
      {result.text}
    </p>
  );
}

function CopyLine({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl bg-lavender px-3 py-2">
      <code className="min-w-0 flex-1 text-xs break-all">{value}</code>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Copy ${value}`}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}

function SetupStatus({ status }: { status: GoogleStatus }) {
  const access = { approved: "API access: approved", not_approved: "API access: not approved", unknown: "API access: not checked yet" }[status.apiAccess];
  const items = [
    { done: status.credentialsSet, label: status.credentialsSet ? "Credentials set" : "Credentials not set" },
    { done: status.agencyConnected, label: status.agencyConnected ? "Agency account connected" : "Agency account not connected" },
    { done: status.apiAccess === "approved", label: access },
  ];
  return (
    <Card>
      <CardTitle>Google setup status</CardTitle>
      <ul className="mt-3 space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2">
            {item.done ? <Check className="size-4 text-good" /> : <Circle className="size-4 text-muted" />}
            {item.label}
          </li>
        ))}
        <li className="flex items-center gap-2 text-muted">
          <Circle className="size-4" />
          Consent screen mode: check this in Google Cloud
        </li>
      </ul>
      {status.adapter === "mock" && <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-sm text-warn">Mock mode: locations, reviews and metrics here are simulated. Nothing reaches Google.</p>}
    </Card>
  );
}

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
      refresh();
    },
  });
  const test = useMutation({ mutationFn: () => api<{ status: string }>("/settings/google/credentials/test", { method: "POST" }), onSuccess: refresh });
  const badge = { valid: "Credentials work", invalid: "Google rejected these", unknown: "Not tested yet" }[data?.status ?? "unknown"];
  const error = save.error ?? test.error;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Google OAuth credentials</CardTitle>
        {data && <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary-dark">{badge}</span>}
      </div>
      <p className="mt-1 mb-4 text-sm text-muted">One Google Cloud project serves the whole app. Clients never need their own.</p>
      {query.isPending && <Skeleton className="h-32" />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="clientId">Client ID</Label>
              <Input id="clientId" disabled={!owner} value={clientId} onChange={(event) => setClientId(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="clientSecret">Client Secret</Label>
              <Input id="clientSecret" type="password" autoComplete="off" disabled={!owner} placeholder={data.maskedSecret ?? ""} value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} />
            </div>
          </div>
          {data.source === "env" && <p className="mt-2 text-xs text-muted">Using values from the environment. Saving here overrides them.</p>}
          <p className="mt-4 mb-1 text-sm font-medium">Redirect URIs for your OAuth client</p>
          <div className="space-y-2">
            {data.redirectUris.map((uri) => (
              <CopyLine key={uri} value={uri} />
            ))}
          </div>
          {owner && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button disabled={save.isPending || !clientId} onClick={() => save.mutate()}>
                Save
              </Button>
              <Button variant="secondary" disabled={test.isPending || data.source === "none"} onClick={() => test.mutate()}>
                Test credentials
              </Button>
              {save.isSuccess && <p className="text-sm text-good">Saved.</p>}
            </div>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-bad">
              {error.message}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function AgencyCard({ owner, expected }: { owner: boolean; expected: string | null }) {
  const queryClient = useQueryClient();
  const connections = useQuery({ queryKey: ["connections"], queryFn: () => api<Connection[]>("/google/connections") });
  const agency = connections.data?.find((connection) => connection.source === "agency" && connection.status !== "disconnected");
  const refresh = () => queryClient.invalidateQueries();
  const disconnect = useMutation({ mutationFn: (id: string) => api(`/google/connections/${id}`, { method: "DELETE" }), onSuccess: refresh });
  const confirm = useMutation({ mutationFn: (id: string) => api(`/google/connections/${id}/confirm-mismatch`, { method: "POST" }), onSuccess: refresh });
  const reconnect = useMutation({
    mutationFn: (id: string) => api<{ url: string }>(`/google/connections/${id}/reconnect`, { method: "POST" }),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const error = disconnect.error ?? confirm.error ?? reconnect.error;
  const active = agency?.status === "active" && !agency.needsConfirmation;

  return (
    <>
      <Card>
        <CardTitle>Agency Google account</CardTitle>
        <p className="mt-1 mb-4 text-sm text-muted">This account holds Manager access to client profiles. It's separate from your login.</p>
        {connections.isPending && <Skeleton className="h-16" />}
        {connections.isError && <ErrorState error={connections.error} onRetry={() => connections.refetch()} />}
        {connections.isSuccess && !agency && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Not connected{expected ? `. Expected account: ${expected}` : ""}</p>
            <Button asChild>
              <a href={apiUrl("/google/oauth/start")}>Connect</a>
            </Button>
          </div>
        )}
        {agency && (
          <>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">Status</dt>
                <dd className={active ? "font-medium text-good" : "font-medium text-bad"}>{agency.needsConfirmation ? "Needs confirming" : active ? "Connected" : "Error"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Account</dt>
                <dd className="font-medium break-all">{agency.googleAccountEmail}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Last sync</dt>
                <dd>{formatDate(agency.lastSyncedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Found</dt>
                <dd>
                  {agency.accountsCount} accounts, {agency.locationsCount} locations
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted">Scopes granted</dt>
                <dd className="text-xs break-all">{agency.scopes.join(" ")}</dd>
              </div>
            </dl>
            {agency.lastError && <p className="mt-3 text-sm text-bad">{agency.lastError}</p>}
            {agency.needsConfirmation && (
              <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-sm text-warn">
                You connected {agency.googleAccountEmail}, but the expected agency account is {expected}.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {agency.needsConfirmation && owner && (
                <Button disabled={confirm.isPending} onClick={() => confirm.mutate(agency.id)}>
                  Use this account
                </Button>
              )}
              <Button variant="secondary" disabled={reconnect.isPending} onClick={() => reconnect.mutate(agency.id)}>
                Reconnect
              </Button>
              {owner && (
                <Button
                  variant="danger"
                  disabled={disconnect.isPending}
                  onClick={() => {
                    if (window.confirm("Disconnect this account? Clients will need a reconnect. Their data is kept.")) disconnect.mutate(agency.id);
                  }}
                >
                  Disconnect
                </Button>
              )}
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-bad">
            {error.message}
          </p>
        )}
      </Card>
      {agency && active && <LocationChecklist connectionId={agency.id} />}
    </>
  );
}

function SetupGuide() {
  const steps = [
    "In Google Cloud, enable the Business Profile APIs: Account Management, Business Information, Performance, and My Business.",
    "Set up the OAuth consent screen and add axxeler@gmail.com and baranikumargd2@gmail.com as Test users.",
    "Create a Web application OAuth client and add both redirect URIs above.",
    "Apply for Business Profile API access. Google asks for a verified profile active for 60+ days and a valid website.",
    "While the consent screen is in Testing, refresh tokens expire after 7 days, so reconnect the agency account weekly until the app is published.",
  ];
  return (
    <Card>
      <CardTitle>Setup guide</CardTitle>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
        {steps.map((step) => (
          <li key={step}>{step}</li>
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
      <PageHeader title="Google" subtitle="One agency account connects every client profile" />
      <Suspense>
        <ConnectResult />
      </Suspense>
      <div className="space-y-6">
        {status.isPending && <Skeleton className="h-32" />}
        {status.isError && <ErrorState error={status.error} onRetry={() => status.refetch()} />}
        {status.data && <SetupStatus status={status.data} />}
        <CredentialsCard owner={owner} />
        {status.data && <AgencyCard owner={owner} expected={status.data.expectedAgencyEmail} />}
        <SetupGuide />
      </div>
    </>
  );
}
