import { Badge, type Tone } from "@/components/ui/badge";
import type { JobStatus } from "@/lib/types";

const STATUS: Record<JobStatus, { label: string; tone: Tone }> = {
  scheduled: { label: "Scheduled", tone: "primary" },
  publishing: { label: "Publishing", tone: "info" },
  published: { label: "Published", tone: "good" },
  failed: { label: "Failed", tone: "bad" },
  dead: { label: "Failed, retries used", tone: "bad" },
  skipped: { label: "Skipped", tone: "neutral" },
  needs_images: { label: "Needs images", tone: "warn" },
  awaiting_approval: { label: "Needs approval", tone: "warn" },
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const { label, tone } = STATUS[status];
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}
