"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileText, Image as ImageIcon, LayoutDashboard, LogOut, Settings, Star, Upload, Users } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ClientSwitcher, useClients } from "@/components/client-switcher";
import { NotificationBell } from "@/components/notification-bell";
import { ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiFailure } from "@/lib/api";
import type { Me } from "@/lib/types";
import { cn } from "@/lib/utils";

const CLIENT_NAV = [
  { href: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "library", label: "Library", icon: ImageIcon },
  { href: "photos", label: "Photos", icon: Upload },
  { href: "seo-posts", label: "SEO Posts", icon: FileText },
  { href: "reviews", label: "Reviews", icon: Star },
  { href: "knowledge", label: "Knowledge base", icon: BookOpen },
];

const navItem = "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { clientId } = useParams<{ clientId?: string }>();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me") });
  const { data: clients = [] } = useClients();
  const unauthenticated = me.error instanceof ApiFailure && me.error.status === 401;

  useEffect(() => {
    if (unauthenticated) router.replace("/login");
  }, [unauthenticated, router]);

  const fallbackClient = clientId ?? clients.find((client) => client.status === "connected")?.id;

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  if (me.isPending || unauthenticated) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-8">
        <Skeleton className="h-12" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (me.isError) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      </div>
    );
  }

  const links = [
    ...CLIENT_NAV.map((item) => ({ ...item, target: fallbackClient ? `/${fallbackClient}/${item.href}` : "/clients" })),
    { href: "clients", label: "Clients", icon: Users, target: "/clients" },
    { href: "settings", label: "Account Settings", icon: Settings, target: "/settings" },
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-white p-4 md:flex">
        <Link href="/" className="mb-6 px-3 text-lg font-bold text-primary">
          LocalPilot
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {links.map(({ href, label, icon: Icon, target }) => (
            <Link key={href} href={target} className={cn(navItem, pathname.endsWith(`/${href}`) ? "bg-primary-soft text-primary-dark" : "text-muted hover:bg-lavender")}>
              <Icon className="size-5" />
              {label}
            </Link>
          ))}
        </nav>
        <p className="truncate px-3 pb-1 text-xs text-muted">{me.data.workspace.name}</p>
        <button onClick={logout} className={cn(navItem, "cursor-pointer text-muted hover:bg-lavender")}>
          <LogOut className="size-5" />
          Log out
        </button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-lavender/90 px-4 py-3 backdrop-blur md:justify-end md:px-8">
          <Link href="/" className="font-bold text-primary md:hidden">
            LocalPilot
          </Link>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <ClientSwitcher />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 md:px-8 md:pb-10">{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-line bg-white py-1 md:hidden">
        {links.map(({ href, label, icon: Icon, target }) => (
          <Link key={href} href={target} aria-label={label} className={cn("rounded-lg p-2.5", pathname.endsWith(`/${href}`) ? "text-primary" : "text-muted")}>
            <Icon className="size-5" />
          </Link>
        ))}
      </nav>
    </div>
  );
}
