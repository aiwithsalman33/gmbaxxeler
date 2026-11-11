"use client";

import * as Popover from "@radix-ui/react-popover";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CLIENT_STATUS } from "@/components/status-badge";
import { StatusDot } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/widgets";
import { api } from "@/lib/api";
import type { Client } from "@/lib/types";
import { cn } from "@/lib/utils";

export function useClients() {
  return useQuery({ queryKey: ["clients"], queryFn: () => api<Client[]>("/clients") });
}

export const ACTIVE_CLIENT_KEY = "localpilot.activeClient";

export function ClientSwitcher() {
  const { clientId } = useParams<{ clientId?: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { data: clients = [], isPending } = useClients();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const active = clients.find((client) => client.id === clientId);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? clients.filter((client) => client.name.toLowerCase().includes(term)) : clients;
  }, [clients, search]);

  function select(id: string) {
    setOpen(false);
    setSearch("");
    try {
      localStorage.setItem(ACTIVE_CLIENT_KEY, id);
    } catch {
      // Storage can be blocked. The URL still holds the active client.
    }
    const section = clientId ? pathname.split("/").slice(2).join("/") : "dashboard";
    router.push(`/${id}/${section || "dashboard"}`);
  }

  // Arrow keys move through results while focus stays in the search box.
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = Math.max(0, Math.min(filtered.length - 1, highlight + (event.key === "ArrowDown" ? 1 : -1)));
      setHighlight(next);
      listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && filtered[highlight]) {
      event.preventDefault();
      select(filtered[highlight].id);
    }
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setHighlight(0);
      }}
    >
      <Popover.Trigger
        aria-label={active ? `Active client: ${active.name}. Switch client` : "Switch client"}
        className="flex h-10 w-44 min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-2 text-sm font-medium hover:border-primary-300 hover:bg-primary-50 focus-visible:shadow-focus focus-visible:outline-none sm:w-64"
      >
        {active ? (
          <span className="relative">
            <Avatar name={active.name} size="sm" />
            <StatusDot tone={CLIENT_STATUS[active.status].tone} className="absolute -right-0.5 -bottom-0.5 size-2.5" />
          </span>
        ) : (
          <span aria-hidden className="size-7 shrink-0 rounded-full border border-dashed border-line-strong" />
        )}
        <span className="min-w-0 flex-1 truncate text-left">{active?.name ?? (isPending ? "Loading clients…" : "Select a client")}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-40 w-80 max-w-[calc(100vw-2rem)] animate-fade-in rounded-xl border border-line bg-white p-2 shadow-raised">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls="client-switcher-list"
              aria-activedescendant={filtered[highlight] ? `client-option-${filtered[highlight].id}` : undefined}
              aria-label="Search clients"
              placeholder="Search clients"
              value={search}
              onKeyDown={onKeyDown}
              onChange={(event) => {
                setSearch(event.target.value);
                setHighlight(0);
              }}
              className="h-10 w-full rounded-lg border border-line-strong bg-white pr-3 pl-9 text-sm placeholder:text-subtle focus:border-primary focus:shadow-focus focus:outline-none"
            />
          </div>
          <p className="px-2 pb-1 text-2xs font-semibold tracking-wider text-subtle uppercase">
            {filtered.length} {filtered.length === 1 ? "client" : "clients"}
          </p>
          <ul id="client-switcher-list" role="listbox" aria-label="Clients" ref={listRef} className="max-h-72 overflow-y-auto">
            {filtered.map((client, index) => {
              const status = CLIENT_STATUS[client.status];
              return (
                <li
                  key={client.id}
                  id={`client-option-${client.id}`}
                  role="option"
                  aria-selected={client.id === clientId}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => select(client.id)}
                  className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm", index === highlight && "bg-primary-50")}
                >
                  <span className="relative">
                    <Avatar name={client.name} size="sm" />
                    <StatusDot tone={status.tone} label={status.label} className="absolute -right-0.5 -bottom-0.5 size-2.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{client.name}</span>
                    <span className="block truncate text-2xs text-muted">
                      {status.label}
                      {client.demo ? " · Demo data" : ""}
                    </span>
                  </span>
                  {client.id === clientId && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
                </li>
              );
            })}
            {filtered.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted">No clients match &ldquo;{search}&rdquo;</li>}
          </ul>
          <div className="mt-1 border-t border-line pt-1">
            <Link href="/clients" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50">
              <Plus className="size-4" aria-hidden />
              Manage clients
            </Link>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
