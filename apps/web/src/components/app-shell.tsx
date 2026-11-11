"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, BookOpen, ChevronDown, FileText, Image as ImageIcon, LayoutDashboard, LogOut, Menu as MenuIcon, Settings, Star, Upload, Users, X } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ClientSwitcher, useClients } from "@/components/client-switcher";
import { NotificationBell } from "@/components/notification-bell";
import { ErrorState } from "@/components/states";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/widgets";
import { api, ApiFailure } from "@/lib/api";
import type { Me } from "@/lib/types";
import { cn } from "@/lib/utils";

const CLIENT_NAV = [
  { href: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "library", label: "Library", icon: ImageIcon },
  { href: "photos", label: "Photos", icon: Upload },
  { href: "seo-posts", label: "SEO Posts", icon: FileText },
  { href: "reviews", label: "Reviews", icon: Star },
  { href: "knowledge", label: "Knowledge", icon: BookOpen },
];

const AGENCY_NAV = [
  { href: "clients", label: "Clients", icon: Users },
  { href: "settings", label: "Settings", icon: Settings },
];

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-[17px] font-bold tracking-tight text-ink", className)}>
      <span aria-hidden className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-sm shadow-primary/30">
        <svg viewBox="0 0 24 24" className="size-4.5 text-white" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
      </span>
      LocalPilot
    </span>
  );
}

interface NavLink {
  href: string;
  label: string;
  icon: typeof Users;
  target: string;
}

function NavSection({ title, links, pathname, onNavigate }: { title: string; links: NavLink[]; pathname: string; onNavigate?: () => void }) {
  return (
    <div>
      <p className="mb-1.5 px-3 text-2xs font-semibold tracking-wider text-subtle uppercase">{title}</p>
      <ul className="space-y-0.5">
        {links.map(({ href, label, icon: Icon, target }) => {
          const active = pathname === `/${href}` || pathname.endsWith(`/${href}`) || pathname.startsWith(`/${href}/`);
          return (
            <li key={href}>
              <Link
                href={target}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:shadow-focus focus-visible:outline-none",
                  active ? "bg-primary-50 text-primary-700" : "text-ink-soft hover:bg-lavender hover:text-ink",
                )}
              >
                <Icon className={cn("size-[18px] shrink-0", active ? "text-primary" : "text-subtle group-hover:text-muted")} aria-hidden />
                {label}
                {active && <span aria-hidden className="ml-auto h-5 w-1 rounded-full bg-primary" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SidebarBody({ clientLinks, agencyLinks, pathname, workspace, onNavigate }: { clientLinks: NavLink[]; agencyLinks: NavLink[]; pathname: string; workspace: string; onNavigate?: () => void }) {
  return (
    <>
      <Link href="/" onClick={onNavigate} className="mb-8 block rounded-xl px-2 focus-visible:shadow-focus focus-visible:outline-none">
        <Logo />
      </Link>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-6 overflow-y-auto">
        <NavSection title="Client" links={clientLinks} pathname={pathname} onNavigate={onNavigate} />
        <NavSection title="Agency" links={agencyLinks} pathname={pathname} onNavigate={onNavigate} />
      </nav>
      <div className="mt-4 rounded-xl border border-line bg-lavender/70 px-3 py-2.5">
        <p className="text-2xs font-medium tracking-wide text-subtle uppercase">Workspace</p>
        <p className="truncate text-sm font-semibold text-ink">{workspace}</p>
      </div>
    </>
  );
}

function UserMenu({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const display = me.user.name || me.user.email;
  return (
    <Menu>
      <MenuTrigger
        aria-label="Account menu"
        className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-line bg-white pr-2 pl-1 hover:bg-primary-50 focus-visible:shadow-focus focus-visible:outline-none"
      >
        <Avatar name={display} size="sm" />
        <ChevronDown className="size-4 text-muted" aria-hidden />
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>
          <span className="block truncate font-semibold text-ink">{me.user.name || "Signed in"}</span>
          <span className="block truncate">{me.user.email}</span>
        </MenuLabel>
        <MenuSeparator />
        <MenuItem asChild icon={<Settings />}>
          <Link href="/settings">Settings</Link>
        </MenuItem>
        <MenuItem asChild icon={<Users />}>
          <Link href="/clients">Clients</Link>
        </MenuItem>
        <MenuItem asChild icon={<AlertOctagon />}>
          <Link href="/admin/failed-jobs">Failed jobs</Link>
        </MenuItem>
        <MenuSeparator />
        <MenuItem danger icon={<LogOut />} onSelect={onLogout}>
          Log out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { clientId } = useParams<{ clientId?: string }>();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me") });
  const { data: clients = [] } = useClients();
  const [mobileOpen, setMobileOpen] = useState(false);
  const unauthenticated = me.error instanceof ApiFailure && me.error.status === 401;

  useEffect(() => {
    if (unauthenticated) router.replace("/login");
  }, [unauthenticated, router]);

  const fallbackClient = clientId ?? clients.find((client) => client.status === "connected")?.id;

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  }

  if (me.isPending || unauthenticated) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-64 shrink-0 border-r border-line bg-white lg:block" />
        <div className="mx-auto w-full max-w-6xl space-y-4 p-8">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
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

  const clientLinks = CLIENT_NAV.map((item) => ({ ...item, target: fallbackClient ? `/${fallbackClient}/${item.href}` : "/clients" }));
  const agencyLinks = AGENCY_NAV.map((item) => ({ ...item, target: `/${item.href}` }));
  const body = { clientLinks, agencyLinks, pathname, workspace: me.data.workspace.name };

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only z-50 rounded-lg bg-white px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:shadow-raised">
        Skip to content
      </a>

      {/* The column stretches to the page's full height; the panel inside stays pinned while the page scrolls. */}
      <aside className="hidden w-64 shrink-0 border-r border-line bg-white lg:block">
        <div className="sticky top-0 flex h-screen flex-col px-4 py-5">
          <SidebarBody {...body} />
        </div>
      </aside>

      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-ink/40 lg:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] animate-slide-in-left flex-col bg-white px-4 py-5 shadow-raised focus:outline-none lg:hidden">
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Dialog.Description className="sr-only">Main navigation</Dialog.Description>
            <Dialog.Close aria-label="Close navigation" className="absolute top-5 right-4 cursor-pointer rounded-lg p-1.5 text-muted hover:bg-lavender">
              <X className="size-5" />
            </Dialog.Close>
            <SidebarBody {...body} onNavigate={() => setMobileOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line bg-white/85 px-4 backdrop-blur-md sm:gap-3 md:px-8">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
            className="flex size-10 cursor-pointer items-center justify-center rounded-xl text-ink-soft hover:bg-lavender lg:hidden"
          >
            <MenuIcon className="size-5" />
          </button>
          <Link href="/" className="hidden sm:block lg:hidden">
            <Logo />
          </Link>
          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
            <ClientSwitcher />
            <NotificationBell />
            <UserMenu me={me.data} onLogout={logout} />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 py-6 sm:py-8 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
