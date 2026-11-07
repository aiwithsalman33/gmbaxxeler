"use client";

import * as Popover from "@radix-ui/react-popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { NotificationItem } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

const REFRESH_MS = 30_000;

export function NotificationBell() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ items: NotificationItem[]; unread: number }>("/notifications"),
    refetchInterval: REFRESH_MS,
  });
  const readAll = useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const unread = data?.unread ?? 0;

  return (
    <Popover.Root>
      <Popover.Trigger aria-label={`Notifications, ${unread} unread`} className="relative flex size-10 cursor-pointer items-center justify-center rounded-xl border border-line bg-white hover:bg-lavender">
        <Bell className="size-5 text-muted" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-white">{unread}</span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-30 w-96 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-white p-3 shadow-card">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold">Notifications</h2>
            {unread > 0 && (
              <Button size="sm" variant="ghost" onClick={() => readAll.mutate()}>
                Mark all read
              </Button>
            )}
          </div>
          <ul className="max-h-96 space-y-1 overflow-y-auto">
            {data?.items.map((item) => (
              <li key={item.id} className={cn("rounded-lg px-2 py-2", !item.readAt && "bg-lavender")}>
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted">{item.body}</p>
                <p className="mt-1 text-[11px] text-muted">{formatDate(item.createdAt)}</p>
              </li>
            ))}
            {!data?.items.length && <li className="px-2 py-6 text-center text-sm text-muted">Nothing yet</li>}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
