"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FlaskConical, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Notice } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast, toastError } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { JobStatus, Readiness } from "@/lib/types";

/** Marks items that went through the mock adapter, so nobody mistakes them for real Google posts. */
export function SimulatedBadge() {
  return (
    <Badge tone="info" title="The mock Google adapter is on. Nothing was sent to Google.">
      <FlaskConical className="size-3" aria-hidden />
      Simulated (mock)
    </Badge>
  );
}

const BLOCKER_LINKS: Partial<Record<Readiness["blockers"][number]["code"], (clientId: string) => { href: string; label: string }>> = {
  folder_empty: (clientId) => ({ href: `/${clientId}/library`, label: "Open Library" }),
  client_not_connected: () => ({ href: "/clients", label: "Open Clients" }),
  worker_offline: () => ({ href: "/settings", label: "Worker status" }),
  api_not_approved: () => ({ href: "/settings/google", label: "Google setup" }),
};

/** Says plainly why scheduled items won't publish, or confirms they will. */
export function ReadinessNotice({ readiness, clientId, className }: { readiness: Readiness | undefined; clientId: string; className?: string }) {
  if (!readiness) return null;
  const stops = readiness.blockers.filter((blocker) => blocker.code !== "needs_approval");
  if (stops.length === 0) {
    return readiness.simulated ? (
      <Notice tone="info" icon={FlaskConical} className={className} title="Ready to publish (simulated)">
        The mock Google adapter is on, so scheduled items complete the full flow and are marked &ldquo;Simulated (mock)&rdquo;. Nothing reaches Google.
      </Notice>
    ) : (
      <Notice tone="good" icon={CheckCircle2} className={className}>
        Ready: scheduled items will publish at their times.
      </Notice>
    );
  }
  return (
    <Notice tone="bad" icon={AlertTriangle} className={className} title={stops.length === 1 ? "Nothing will publish until this is fixed" : `Nothing will publish until these ${stops.length} things are fixed`}>
      <ul className="mt-1 space-y-1.5">
        {stops.map((blocker) => {
          const link = BLOCKER_LINKS[blocker.code]?.(clientId);
          return (
            <li key={blocker.code} className="flex flex-wrap items-baseline gap-x-2">
              <span>{blocker.message}</span>
              {link && (
                <Link href={link.href} className="font-semibold underline underline-offset-2">
                  {link.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </Notice>
  );
}

interface PublishResult {
  status: JobStatus;
  error: string | null;
  simulated: boolean;
}

/**
 * Publishes one queued item straight away, through the same path the worker uses.
 * Asks first, because with the real adapter this posts to the live Google profile.
 */
export function PublishNowButton({
  path,
  label,
  simulated,
  invalidate,
}: {
  /** e.g. `/clients/:id/photos/jobs/:jobId/publish-now` */
  path: string;
  label: string;
  simulated: boolean;
  invalidate: unknown[][];
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const publish = useMutation({
    mutationFn: () => api<PublishResult>(path, { method: "POST" }),
    onSuccess: (result) => {
      setConfirming(false);
      if (result.status === "published") toast.success(result.simulated ? "Published (simulated: nothing was sent to Google)" : "Published to Google");
      else toast.error(result.error ? `Not published: ${result.error}` : `Not published (${result.status.replace(/_/g, " ")})`);
      for (const key of invalidate) queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (error) => {
      setConfirming(false);
      toastError(error);
    },
  });

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} aria-label={`Publish now: ${label}`}>
        <Send aria-hidden />
        <span className="hidden sm:inline">Publish now</span>
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Publish this now?"
        description={
          simulated
            ? "The mock adapter is on, so this runs the full publish flow and marks it Simulated (mock). Nothing is sent to Google."
            : "This publishes to the client's live Google Business Profile right away instead of at its scheduled time."
        }
        confirmLabel="Publish now"
        loading={publish.isPending}
        onConfirm={() => publish.mutate()}
      />
    </>
  );
}
