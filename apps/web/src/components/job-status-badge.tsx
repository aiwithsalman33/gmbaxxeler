import type { JobStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS: Record<JobStatus, { label: string; style: string }> = {
  scheduled: { label: "Scheduled", style: "bg-primary-soft text-primary-dark" },
  publishing: { label: "Publishing", style: "bg-primary-soft text-primary-dark" },
  published: { label: "Published", style: "bg-green-50 text-good" },
  failed: { label: "Failed", style: "bg-red-50 text-bad" },
  dead: { label: "Failed, retries used", style: "bg-red-50 text-bad" },
  skipped: { label: "Skipped", style: "bg-gray-100 text-muted" },
  needs_images: { label: "Needs images", style: "bg-amber-50 text-warn" },
  awaiting_approval: { label: "Needs approval", style: "bg-amber-50 text-warn" },
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const { label, style } = STATUS[status];
  return <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", style)}>{label}</span>;
}
