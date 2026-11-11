"use client";

import * as Popover from "@radix-ui/react-popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, BellOff, Info, OctagonAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { NotificationItem } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

const REFRESH_MS = 30_000;

const SEVERITY = {
  info: { icon: Info, style: "bg-primary-50 text-primary" },
  warning: { icon: AlertTriangle, style: "bg-warn-soft text-warn" },
  critical: { icon: OctagonAlert, style: "bg-bad-soft text-bad" },
};

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
      <Popover.Trigger
        aria-label={`Notifications, ${unread} unread`}
        className="relative flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-line bg-white text-ink-soft hover:bg-primary-50 focus-visible:shadow-focus focus-visible:outline-none"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-2xs font-semibold text-white ring-2 ring-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-40 w-96 max-w-[calc(100vw-2rem)] animate-fade-in rounded-xl border border-line bg-white shadow-raised">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Notifications</h2>
            {unread > 0 && (
              <Button size="sm" variant="ghost" loading={readAll.isPending} onClick={() => readAll.mutate()}>
                Mark all read
              </Button>
            )}
          </div>
          <ul className="max-h-[26rem] divide-y divide-line overflow-y-auto">
            {data?.items.map((item) => {
              const { icon: Icon, style } = SEVERITY[item.severity] ?? SEVERITY.info;
              return (
                <li key={item.id} className={cn("flex gap-3 px-4 py-3", !item.readAt && "bg-primary-50/50")}>
                  <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", style)}>
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{item.title}</p>
                    <p className="text-xs text-muted">{item.body}</p>
                    <p className="mt-1 text-2xs text-subtle">{formatDate(item.createdAt)}</p>
                  </div>
                  {!item.readAt && <span aria-label="Unread" className="mt-2 size-2 shrink-0 rounded-full bg-primary" />}
                </li>
              );
            })}
            {!data?.items.length && (
              <li className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <BellOff className="size-6 text-subtle" aria-hidden />
                <p className="text-sm text-muted">You&apos;re all caught up</p>
              </li>
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
