"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Link2, LogIn, MapPin, Phone, RefreshCw, Search, Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Notice } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { LoadingBlock, Skeleton } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { AutoConnectResult, Client, LocationCandidate } from "@/lib/types";

/**
 * Opens right after a client is added, and from Connect on a waiting client.
 * The server looks through every connected Google account, and any Manager
 * invitation, and connects the business when it is sure.
 */
export function ConnectClientDialog({
  client,
  onClose,
  onChanged,
  onSendGuide,
}: {
  client: Client | null;
  onClose: () => void;
  onChanged: () => void;
  onSendGuide: (client: Client) => void;
}) {
  const clientId = client?.id;
  const check = useMutation({
    mutationFn: (id: string) => api<AutoConnectResult>(`/clients/${id}/auto-connect`, { method: "POST" }),
    onSuccess: (result) => {
      if (result.status === "connected") {
        toast.success(`${result.client.name} is connected`);
        onChanged();
      }
    },
  });
  const pick = useMutation({
    mutationFn: (location: LocationCandidate) =>
      api<Client>(`/clients/${clientId}/match-location`, { method: "POST", body: { accountId: location.accountId, locationId: location.locationId } }),
    onSuccess: (connected) => {
      // The re-check shows the connected state and its toast.
      check.mutate(connected.id);
    },
    onError: (error) => toastError(error),
  });
  const signIn = useMutation({
    mutationFn: () => api<{ url: string }>(`/clients/${clientId}/google-connect`, { method: "POST" }),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) => toastError(error),
  });

  // Runs once each time the dialog opens for a client.
  const started = useRef<string | null>(null);
  const { mutate: runCheck, reset } = check;
  useEffect(() => {
    if (!clientId) {
      started.current = null;
      reset();
      return;
    }
    if (started.current === clientId) return;
    started.current = clientId;
    runCheck(clientId);
  }, [clientId, runCheck, reset]);

  const result = check.data;
  const name = client?.name ?? "this client";

  return (
    <Dialog
      open={client !== null}
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      title={`Connect ${name}`}
      description="We look for this business in your connected Google accounts and in any Manager invitation it has sent."
    >
      {(check.isPending || (check.isIdle && client)) && (
        <LoadingBlock label="Checking Google" className="space-y-3">
          <p className="flex items-center gap-2 text-sm text-muted">
            <Search className="size-4 animate-pulse text-primary" aria-hidden />
            Checking your Google accounts for {name}…
          </p>
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </LoadingBlock>
      )}

      {check.isError && (
        <Notice tone="bad" action={<Button size="sm" variant="secondary" onClick={() => clientId && check.mutate(clientId)}>Try again</Button>}>
          {check.error.message}
        </Notice>
      )}

      {result?.status === "connected" && (
        <div className="space-y-4">
          <Notice tone="good" icon={CheckCircle2} title={`${result.client.name} is connected`}>
            {result.locationTitle ? `Linked to "${result.locationTitle}"` : "Linked to its Business Profile"}
            {result.googleAccountEmail ? ` through ${result.googleAccountEmail}.` : "."} Its first sync is running now.
          </Notice>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Done
            </Button>
            <Button asChild>
              <Link href={`/${result.client.id}/dashboard`}>
                Open dashboard
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      )}

      {result?.status === "choose" && (
        <div className="space-y-4">
          <Notice tone="info" title="Is it one of these?">
            These businesses are close to &quot;{result.client.name}&quot; but not an exact match, so nothing was connected yet. Pick the right one.
          </Notice>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {result.candidates.map((location) => (
              <li key={`${location.accountId}/${location.locationId}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 basis-60">
                  <p className="truncate text-sm font-semibold">{location.title}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                    {location.address && (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin className="size-3 shrink-0" aria-hidden />
                        <span className="truncate">{location.address}</span>
                      </span>
                    )}
                    {location.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="size-3" aria-hidden />
                        {location.phone}
                      </span>
                    )}
                    <span>via {location.googleAccountEmail}</span>
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={pick.isPending}
                  loading={pick.isPending && pick.variables?.locationId === location.locationId}
                  onClick={() => pick.mutate(location)}
                >
                  Connect this one
                </Button>
              </li>
            ))}
          </ul>
          <WaitingActions client={result.client} canSignInAs={result.client.contactEmail} signIn={signIn} onSendGuide={onSendGuide} onRecheck={() => check.mutate(result.client.id)} rechecking={check.isPending} />
        </div>
      )}

      {result?.status === "waiting" && (
        <div className="space-y-4">
          {result.reason === "no_agency" ? (
            <Notice
              tone="warn"
              title="No Google account is connected yet"
              action={
                <Button asChild size="sm" variant="secondary">
                  <Link href="/settings/google">Connect agency account</Link>
                </Button>
              }
            >
              Connect your agency Google account, or sign in below with a Google account that already manages this business.
            </Notice>
          ) : result.reason === "google_error" ? (
            <Notice tone="bad" title="Google didn't answer">
              {result.message ?? "Try again in a minute."}
            </Notice>
          ) : (
            <Notice tone="info" title="Not found in your Google accounts yet">
              {result.agencyEmail ? (
                <>
                  <span className="font-medium break-all">{result.agencyEmail}</span> doesn&apos;t manage &quot;{result.client.name}&quot; yet, and there is no matching invitation.
                </>
              ) : (
                <>None of your connected Google accounts manage &quot;{result.client.name}&quot; yet.</>
              )}{" "}
              It connects by itself once the owner adds you as Manager. We check every 10 minutes.
            </Notice>
          )}
          <WaitingActions client={result.client} canSignInAs={result.canSignInAs} signIn={signIn} onSendGuide={onSendGuide} onRecheck={() => check.mutate(result.client.id)} rechecking={check.isPending} />
        </div>
      )}
    </Dialog>
  );
}

function WaitingActions({
  client,
  canSignInAs,
  signIn,
  onSendGuide,
  onRecheck,
  rechecking,
}: {
  client: Client;
  canSignInAs: string | null;
  signIn: { mutate: () => void; isPending: boolean };
  onSendGuide: (client: Client) => void;
  onRecheck: () => void;
  rechecking: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-line p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Link2 className="size-4 text-primary" aria-hidden />
          Have a Gmail that already manages it?
        </p>
        <p className="mt-1 text-sm text-muted">
          Sign in with a Google account that is Owner or Manager of this Business Profile. We find the business there and connect it straight away.
        </p>
        <Button className="mt-3" size="sm" loading={signIn.isPending} onClick={() => signIn.mutate()}>
          {!signIn.isPending && <LogIn aria-hidden />}
          {canSignInAs ? `Connect with Google as ${canSignInAs}` : "Connect with Google"}
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" size="sm" loading={rechecking} onClick={onRecheck}>
          {!rechecking && <RefreshCw aria-hidden />}
          Check again
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onSendGuide(client)}>
          <Send aria-hidden />
          Ask owner to add me as Manager
        </Button>
      </div>
    </div>
  );
}
