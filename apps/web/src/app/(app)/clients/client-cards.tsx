"use client";

import { ArrowRight, Check, LayoutDashboard, Mail, MoreHorizontal, Pause, Phone, Play, Send, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment } from "react";
import { DemoBadge, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Avatar, ProgressBar, Stars } from "@/components/ui/widgets";
import type { Client } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

export interface ClientActions {
  onGuide: (client: Client) => void;
  onPause: (client: Client, paused: boolean) => void;
  onRemove: (client: Client) => void;
  /** Mock mode only. */
  onSimulate?: (client: Client) => void;
}

/** Added → Guide sent → Access granted → Connected, derived from the client's own timestamps. */
export function onboardingSteps(client: Client) {
  const connected = client.status === "connected" || client.status === "paused" || Boolean(client.connectedAt);
  const guideSent = Boolean(client.guideSentAt) || client.status === "waiting_for_access" || connected;
  return [
    { label: "Added", done: true, date: client.invitedAt },
    { label: "Guide sent", done: guideSent, date: client.guideSentAt },
    { label: "Access granted", done: connected, date: null },
    { label: "Connected", done: connected, date: client.connectedAt },
  ];
}

function OnboardingProgress({ client }: { client: Client }) {
  const steps = onboardingSteps(client);
  const current = steps.findIndex((step) => !step.done);
  return (
    <ol aria-label={`Onboarding for ${client.name}`} className="flex items-center">
      {steps.map((step, index) => {
        const isCurrent = index === current;
        return (
          <Fragment key={step.label}>
            {index > 0 && <li aria-hidden className={cn("h-0.5 min-w-3 flex-1 rounded-full", step.done ? "bg-primary" : "bg-line-strong")} />}
            <li className="flex shrink-0 flex-col items-center gap-1.5" aria-current={isCurrent ? "step" : undefined}>
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-2xs font-semibold",
                  step.done ? "bg-primary text-white" : isCurrent ? "bg-white text-primary ring-2 ring-primary" : "bg-white text-subtle ring-1 ring-line-strong",
                )}
              >
                {step.done ? <Check className="size-3.5" aria-hidden /> : index + 1}
              </span>
              <span className={cn("text-2xs font-medium whitespace-nowrap", step.done ? "text-ink-soft" : isCurrent ? "text-primary-700" : "text-subtle")}>
                {step.label}
                <span className="sr-only">{step.done ? " (done)" : isCurrent ? " (next)" : " (to do)"}</span>
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

/** One client still waiting for Manager access, with progress and the guide actions. */
export function PendingClientRow({ client, actions }: { client: Client; actions: ClientActions }) {
  const contact = client.contactPhone ?? client.contactEmail;
  return (
    <li className="grid gap-4 py-4 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)_auto] md:items-center md:gap-6">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={client.name} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">{client.name}</p>
            <StatusBadge status={client.status} />
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
            {contact && (client.contactPhone ? <Phone className="size-3 shrink-0" aria-hidden /> : <Mail className="size-3 shrink-0" aria-hidden />)}
            <span className="truncate">{contact ?? "No contact details"}</span>
            {client.guideSentAt && <span className="hidden whitespace-nowrap sm:inline">· Guide sent {formatDate(client.guideSentAt)}</span>}
          </p>
        </div>
      </div>
      <OnboardingProgress client={client} />
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <Button size="sm" variant={client.guideSentAt ? "secondary" : "primary"} onClick={() => actions.onGuide(client)}>
          <Send aria-hidden />
          {client.guideSentAt ? "Resend guide" : "Send guide"}
        </Button>
        {actions.onSimulate && (
          <Button size="sm" variant="ghost" onClick={() => actions.onSimulate?.(client)}>
            <Wand2 aria-hidden />
            Simulate invite
          </Button>
        )}
        <ClientMenu client={client} actions={actions} />
      </div>
    </li>
  );
}

function ClientMenu({ client, actions }: { client: Client; actions: ClientActions }) {
  const canPause = client.status === "connected";
  const canResume = client.status === "paused";
  const pending = client.status === "invited" || client.status === "waiting_for_access";
  const router = useRouter();
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${client.name}`}>
          <MoreHorizontal aria-hidden />
        </Button>
      </MenuTrigger>
      <MenuContent>
        {!pending && (
          <MenuItem icon={<LayoutDashboard />} onSelect={() => router.push(`/${client.id}/dashboard`)}>
            Open dashboard
          </MenuItem>
        )}
        {!pending && client.status !== "connected" && client.status !== "paused" && (
          <MenuItem icon={<Send />} onSelect={() => actions.onGuide(client)}>
            Send access guide
          </MenuItem>
        )}
        {canPause && (
          <MenuItem icon={<Pause />} onSelect={() => actions.onPause(client, true)}>
            Pause automations
          </MenuItem>
        )}
        {canResume && (
          <MenuItem icon={<Play />} onSelect={() => actions.onPause(client, false)}>
            Resume automations
          </MenuItem>
        )}
        {!pending && <MenuSeparator />}
        <MenuItem danger icon={<Trash2 />} onSelect={() => actions.onRemove(client)}>
          Remove client
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

export function ClientCard({ client, actions }: { client: Client; actions: ClientActions }) {
  const strength = client.stats?.strengthScore ?? null;
  const rating = client.stats?.rating ?? null;
  return (
    <li className="group relative flex flex-col rounded-card border border-line bg-white p-5 shadow-card transition-[border-color,box-shadow] focus-within:border-primary-300 hover:border-primary-300 hover:shadow-raised">
      <div className="flex items-start gap-3">
        <Avatar name={client.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-ink">
            <Link href={`/${client.id}/dashboard`} className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none">
              {client.name}
            </Link>
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted">{client.address ?? "No address on file"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={client.status} />
            {client.demo && <DemoBadge />}
          </div>
        </div>
        <div className="relative z-10 -mt-1 -mr-1">
          <ClientMenu client={client} actions={actions} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
        <div>
          <p className="text-2xs font-semibold tracking-wide text-subtle uppercase">Profile strength</p>
          {strength === null ? (
            <p className="mt-1.5 text-sm text-muted">After first sync</p>
          ) : (
            <>
              <p className="mt-1 text-sm font-semibold tabular-nums">
                {strength}
                <span className="font-normal text-muted"> / 100</span>
              </p>
              <ProgressBar value={strength} label={`Profile strength for ${client.name}`} className="mt-1.5" />
            </>
          )}
        </div>
        <div>
          <p className="text-2xs font-semibold tracking-wide text-subtle uppercase">Rating</p>
          {rating === null ? (
            <p className="mt-1.5 text-sm text-muted">No reviews yet</p>
          ) : (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-sm font-semibold tabular-nums">{rating.toFixed(1)}</span>
              <Stars rating={rating} />
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 flex items-center gap-1 text-xs font-medium text-primary opacity-80 transition-opacity group-hover:opacity-100" aria-hidden>
        Open dashboard
        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </p>
    </li>
  );
}
