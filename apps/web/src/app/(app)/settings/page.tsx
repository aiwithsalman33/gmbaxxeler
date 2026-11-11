"use client";

import { Bell, Building2, Globe, Lock, Sparkles, Users } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { AiSettings } from "./ai-settings";
import { GeneralSettings, GoogleSummary } from "./general-settings";
import { NotificationSettings } from "./notification-settings";
import { SecuritySettings } from "./security-settings";
import { TeamSettings } from "./team-settings";
import { PageHeader } from "@/components/page-header";
import { LoadingBlock, Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { value: "general", label: "General", icon: Building2 },
  { value: "google", label: "Google", icon: Globe },
  { value: "ai", label: "AI", icon: Sparkles },
  { value: "notifications", label: "Notifications", icon: Bell },
  { value: "team", label: "Team", icon: Users },
  { value: "security", label: "Security", icon: Lock },
] as const;
type Tab = (typeof TABS)[number]["value"];

/** The selected tab lives in ?tab=, so links like /settings?tab=ai open the right one. */
function SettingsTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get("tab");
  const tab: Tab = TABS.some((t) => t.value === requested) ? (requested as Tab) : "general";
  const listRef = useRef<HTMLDivElement>(null);

  // On narrow screens the tab bar scrolls sideways; keep the selected tab visible.
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[data-state="active"]');
    const list = listRef.current;
    if (active && list) list.scrollTo({ left: active.offsetLeft - (list.clientWidth - active.offsetWidth) / 2, behavior: "smooth" });
  }, [tab]);

  function select(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "general") next.delete("tab");
    else next.set("tab", value);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <Tabs value={tab} onValueChange={select}>
      <TabsList ref={listRef} aria-label="Settings sections">
        {TABS.map(({ value, label, icon: Icon }) => (
          <TabsTrigger key={value} value={value}>
            <Icon className="size-4" aria-hidden />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="general" className="mt-6">
        <GeneralSettings />
      </TabsContent>
      <TabsContent value="google" className="mt-6">
        <GoogleSummary />
      </TabsContent>
      <TabsContent value="ai" className="mt-6">
        <AiSettings />
      </TabsContent>
      <TabsContent value="notifications" className="mt-6">
        <NotificationSettings />
      </TabsContent>
      <TabsContent value="team" className="mt-6">
        <TeamSettings />
      </TabsContent>
      <TabsContent value="security" className="mt-6">
        <SecuritySettings />
      </TabsContent>
    </Tabs>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Your workspace, connections, AI, alerts and team." />
      <Suspense
        fallback={
          <LoadingBlock label="Loading settings" className="space-y-6">
            <Skeleton className="h-11" />
            <Skeleton className="h-56 rounded-card" />
          </LoadingBlock>
        }
      >
        <SettingsTabs />
      </Suspense>
    </>
  );
}
