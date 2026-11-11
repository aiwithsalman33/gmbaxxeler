"use client";

import { AlertTriangle, BookOpen, KeyRound, UserX } from "lucide-react";
import Link from "next/link";
import { Notice } from "@/components/states";
import { Button } from "@/components/ui/button";
import type { ClientStatus } from "@/lib/types";

const MESSAGES: Partial<Record<ClientStatus, { text: string; action: string; href: string; tone: "warn" | "bad"; icon: typeof AlertTriangle }>> = {
  reconnect_required: { text: "Google access expired for this client.", action: "Reconnect", href: "/settings/google", tone: "bad", icon: KeyRound },
  access_removed: { text: "The client removed the agency's access on Google.", action: "Send guide again", href: "/clients", tone: "bad", icon: UserX },
  invited: { text: "This client hasn't given access yet.", action: "View guide", href: "/clients", tone: "warn", icon: AlertTriangle },
  waiting_for_access: { text: "Waiting for the client to add the agency as Manager.", action: "View status", href: "/clients", tone: "warn", icon: AlertTriangle },
};

export function ClientBanner({ status, needsKnowledge, clientId }: { status: ClientStatus; needsKnowledge?: boolean; clientId?: string }) {
  const message =
    MESSAGES[status] ??
    (needsKnowledge
      ? { text: "Fill in the knowledge base so AI posts and replies sound like this business.", action: "Set it up", href: `/${clientId}/knowledge`, tone: "warn" as const, icon: BookOpen }
      : undefined);
  if (!message) return null;
  return (
    <Notice
      tone={message.tone}
      icon={message.icon}
      className="mb-6 items-center"
      action={
        <Button asChild size="sm" variant="secondary">
          <Link href={message.href}>{message.action}</Link>
        </Button>
      }
    >
      {message.text}
    </Notice>
  );
}
