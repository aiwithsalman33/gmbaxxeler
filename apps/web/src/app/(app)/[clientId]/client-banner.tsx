"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ClientStatus } from "@/lib/types";

const MESSAGES: Partial<Record<ClientStatus, { text: string; action: string; href: string }>> = {
  reconnect_required: { text: "Google access expired for this client.", action: "Reconnect", href: "/settings" },
  access_removed: { text: "The client removed the agency's access on Google.", action: "Send guide again", href: "/clients" },
  invited: { text: "This client hasn't given access yet.", action: "View guide", href: "/clients" },
  waiting_for_access: { text: "Waiting for the client to add the agency as Manager.", action: "View status", href: "/clients" },
};

export function ClientBanner({ status, needsKnowledge, clientId }: { status: ClientStatus; needsKnowledge?: boolean; clientId?: string }) {
  const message = MESSAGES[status] ?? (needsKnowledge ? { text: "Fill in the knowledge base so AI posts and replies sound like this business.", action: "Set it up", href: `/${clientId}/knowledge` } : undefined);
  if (!message) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-warn">
      <AlertTriangle className="size-4 shrink-0" />
      <span className="flex-1">{message.text}</span>
      <Button asChild size="sm" variant="secondary">
        <Link href={message.href}>{message.action}</Link>
      </Button>
    </div>
  );
}
