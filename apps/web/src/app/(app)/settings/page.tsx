"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AiSettings } from "./ai-settings";
import { NotificationSettings } from "./notification-settings";
import { SecuritySettings } from "./security-settings";
import { TeamSettings } from "./team-settings";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { Me } from "@/lib/types";

export default function SettingsPage() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me") });
  return (
    <>
      <PageHeader title="Account Settings" subtitle={me.data?.workspace.name} />
      <div className="space-y-6">
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Google</CardTitle>
            <p className="mt-1 text-sm text-muted">Credentials, the agency account and setup status.</p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/settings/google">Open Google settings</Link>
          </Button>
        </Card>

        <AiSettings />
        <NotificationSettings />
        <TeamSettings />
        <SecuritySettings />

        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Failed jobs</CardTitle>
            <p className="mt-1 text-sm text-muted">Review and retry uploads that didn&apos;t go through.</p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/admin/failed-jobs">View failed jobs</Link>
          </Button>
        </Card>
      </div>
    </>
  );
}
