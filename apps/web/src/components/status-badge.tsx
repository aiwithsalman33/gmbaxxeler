import { Badge, type Tone } from "@/components/ui/badge";
import type { ClientStatus } from "@/lib/types";

export const CLIENT_STATUS: Record<ClientStatus, { label: string; tone: Tone }> = {
  invited: { label: "Invited", tone: "primary" },
  waiting_for_access: { label: "Waiting for access", tone: "warn" },
  connected: { label: "Connected", tone: "good" },
  reconnect_required: { label: "Reconnect required", tone: "bad" },
  access_removed: { label: "Access removed", tone: "bad" },
  paused: { label: "Paused", tone: "neutral" },
  removed: { label: "Removed", tone: "neutral" },
};

export function StatusBadge({ status }: { status: ClientStatus }) {
  const { label, tone } = CLIENT_STATUS[status];
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}

export function DemoBadge() {
  return (
    <Badge tone="warn" title="A built-in sample business, not real Google data">
      Demo data
    </Badge>
  );
}
