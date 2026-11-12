"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, BookOpen, Check, ChevronDown, FileText, Image as ImageIcon, LayoutDashboard, LogOut, Menu as MenuIcon, Monitor, Moon, Settings, Star, Sun, Upload, Users, X } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/brand";
import { ClientSwitcher, useClients } from "@/components/client-switcher";
import { NotificationBell } from "@/components/notification-bell";
import { ErrorState } from "@/components/states";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/widgets";
import { api, ApiFailure } from "@/lib/api";
import { setTheme, useTheme, type ThemeChoice } from "@/lib/theme";
import type { Me } from "@/lib/types";
import { cn } from "@/lib/utils";

export { Logo } from "@/components/brand";

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

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

interface NavLink {
  href: string;
  label: string;
  icon: typeof Users;
  target: string;
}

function NavSection({ title, links, pathname, onNavigate }: { title: string; links: NavLink[]; pathname: string; onNavigate?: () => void }) {
  return (
    <div>
      <p className="mb-2 px-3 text-2xs font-semibold tracking-[0.12em] text-sidebar-muted uppercase">{title}</p>
      <ul className="space-y-1">
        {links.map(({ href, label, icon: Icon, target }) => {
          const active = pathname === `/${href}` || pathname.endsWith(`/${href}`) || pathname.startsWith(`/${href}/`);
          return (
            <li key={href}>
              <Link
                href={target}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:shadow-focus focus-visible:outline-none",
                  active ? "bg-sidebar-active text-sidebar-strong" : "text-sidebar-ink hover:bg-sidebar-hover hover:text-sidebar-strong",
                )}
              >
                {active && <span aria-hidden className="bg-brand absolute top-2 bottom-2 left-0 w-[3px] rounded-full" />}
                <Icon className={cn("size-[18px] shrink-0", active ? "text-primary-600" : "text-sidebar-muted group-hover:text-sidebar-ink")} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Light / dark / system, as a small segmented control for the sidebar. */
function ThemeSwitch() {
  const theme = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-xl border border-sidebar-line bg-sidebar-2 p-1">
      {THEMES.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          title={label}
          onClick={() => setTheme(value)}
          className={cn(
            "flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-2xs font-medium transition-colors focus-visible:shadow-focus focus-visible:outline-none",
            theme === value ? "bg-sidebar text-sidebar-strong shadow-sm" : "text-sidebar-muted hover:text-sidebar-strong",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

function SidebarBody({ clientLinks, agencyLinks, pathname, workspace, onNavigate }: { clientLinks: NavLink[]; agencyLinks: NavLink[]; pathname: string; workspace: string; onNavigate?: () => void }) {
  return (
    <>
      {/* Soft brand glow behind the logo, like the logo file's lighting. */}
      <div aria-hidden className="pointer-events-none absolute -top-24 -left-16 size-64 rounded-full bg-primary-500/15 blur-3xl" />
      <Link href="/" onClick={onNavigate} className="relative mb-8 block rounded-xl px-2 focus-visible:shadow-focus focus-visible:outline-none">
        <Logo tagline />
      </Link>
      <nav aria-label="Main" className="relative -mx-1 flex flex-1 flex-col gap-7 overflow-y-auto px-1">
        <NavSection title="Client" links={clientLinks} pathname={pathname} onNavigate={onNavigate} />
        <NavSection title="Agency" links={agencyLinks} pathname={pathname} onNavigate={onNavigate} />
      </nav>
      <div className="relative mt-4 space-y-3">
        <ThemeSwitch />
        <div className="rounded-xl border border-sidebar-line bg-sidebar-2 px-3 py-2.5">
          <p className="text-2xs font-medium tracking-wide text-sidebar-muted uppercase">Workspace</p>
          <p className="truncate text-sm font-semibold text-sidebar-strong">{workspace}</p>
        </div>
      </div>
    </>
  );
}

function UserMenu({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const display = me.user.name || me.user.email;
  const theme = useTheme();
  return (
    <Menu>
      <MenuTrigger
        aria-label="Account menu"
        className="flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-surface pr-1.5 pl-1 hover:border-primary-300 hover:bg-primary-50 focus-visible:shadow-focus focus-visible:outline-none sm:gap-2 sm:pr-2"
      >
        <Avatar name={display} size="sm" />
        <ChevronDown className="hidden size-4 text-muted sm:block" aria-hidden />
      </MenuTrigger>
      <MenuContent className="w-64">
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
        <MenuLabel>Theme</MenuLabel>
        {THEMES.map(({ value, label, icon: Icon }) => (
          <MenuItem key={value} icon={<Icon />} onSelect={() => setTheme(value)}>
            {label}
            {theme === value && (
              <>
                <Check className="ml-auto text-primary!" aria-hidden />
                <span className="sr-only">(current)</span>
              </>
            )}
          </MenuItem>
        ))}
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
        <div className="hidden w-[17rem] shrink-0 bg-sidebar lg:block" />
        <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-8">
          <Skeleton className="h-10 w-64 max-w-full" />
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }
  if (me.isError) {
    return (
      <div className="mx-auto max-w-xl p-4 sm:p-8">
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      </div>
    );
  }

  const clientLinks = CLIENT_NAV.map((item) => ({ ...item, target: fallbackClient ? `/${fallbackClient}/${item.href}` : "/clients" }));
  const agencyLinks = AGENCY_NAV.map((item) => ({ ...item, target: `/${item.href}` }));
  const body = { clientLinks, agencyLinks, pathname, workspace: me.data.workspace.name };

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only z-50 rounded-lg bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:shadow-raised">
        Skip to content
      </a>

      {/* The column stretches to the page's full height; the panel inside stays pinned while the page scrolls. */}
      <aside className="hidden w-[17rem] shrink-0 border-r border-sidebar-line bg-sidebar lg:block">
        <div className="sticky top-0 flex h-screen flex-col overflow-hidden px-4 py-6">
          <SidebarBody {...body} />
        </div>
      </aside>

      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-black/50 backdrop-blur-[2px] lg:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[17.5rem] max-w-[85vw] animate-slide-in-left flex-col overflow-hidden bg-sidebar px-4 py-6 shadow-raised focus:outline-none lg:hidden">
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Dialog.Description className="sr-only">Main navigation</Dialog.Description>
            <Dialog.Close aria-label="Close navigation" className="absolute top-6 right-3 z-10 cursor-pointer rounded-lg p-1.5 text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-strong">
              <X className="size-5" />
            </Dialog.Close>
            <SidebarBody {...body} onNavigate={() => setMobileOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line bg-surface/80 px-3 backdrop-blur-md sm:gap-3 sm:px-4 md:px-8">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
            className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-ink-soft hover:bg-primary-50 lg:hidden"
          >
            <MenuIcon className="size-5" />
          </button>
          <Link href="/" className="shrink-0 rounded-xl focus-visible:shadow-focus focus-visible:outline-none lg:hidden">
            <Logo compact className="sm:hidden" />
            <Logo className="hidden sm:inline-flex" />
          </Link>
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-3">
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
