"use client";

import * as Popover from "@radix-ui/react-popover";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
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

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label="Switch client"
        className="flex h-10 w-48 cursor-pointer items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 text-sm font-medium hover:bg-lavender sm:w-64"
      >
        <span className="truncate">{active?.name ?? (isPending ? "Loading clients" : "Select a client")}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-30 w-80 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-white p-2 shadow-card">
          <div className="relative mb-2">
            <Search className="absolute top-3 left-3 size-4 text-muted" />
            <Input autoFocus placeholder="Search clients" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
          </div>
          <ul className="max-h-72 overflow-y-auto">
            {filtered.map((client) => (
              <li key={client.id}>
                <button
                  onClick={() => select(client.id)}
                  className={cn("flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-lavender", client.id === clientId && "bg-lavender")}
                >
                  <Check className={cn("size-4 shrink-0 text-primary", client.id !== clientId && "invisible")} />
                  <span className="min-w-0 flex-1 truncate">{client.name}</span>
                  {client.status !== "connected" && <StatusBadge status={client.status} />}
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-2 py-4 text-center text-sm text-muted">No clients found</li>}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
