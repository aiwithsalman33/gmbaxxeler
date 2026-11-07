import type { ClientStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS: Record<ClientStatus, { label: string; style: string }> = {
  invited: { label: "Invited", style: "bg-primary-soft text-primary-dark" },
  waiting_for_access: { label: "Waiting for access", style: "bg-amber-50 text-warn" },
  connected: { label: "Connected", style: "bg-green-50 text-good" },
  reconnect_required: { label: "Reconnect required", style: "bg-red-50 text-bad" },
  access_removed: { label: "Access removed", style: "bg-red-50 text-bad" },
  paused: { label: "Paused", style: "bg-gray-100 text-muted" },
  removed: { label: "Removed", style: "bg-gray-100 text-muted" },
};

export function StatusBadge({ status }: { status: ClientStatus }) {
  const { label, style } = STATUS[status];
  return <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", style)}>{label}</span>;
}
