import type { Tone } from "@/components/ui/badge";
import type { Review } from "@/lib/types";

/** Where a review's reply stands, worked out from the review and its latest open reply. */
export type ReplyStatus = "needs_reply" | "draft" | "scheduled" | "failed" | "replied";

export const REPLY_STATUS: Record<ReplyStatus, { label: string; tone: Tone }> = {
  needs_reply: { label: "Needs reply", tone: "warn" },
  draft: { label: "Draft to approve", tone: "primary" },
  scheduled: { label: "Reply scheduled", tone: "info" },
  failed: { label: "Reply failed", tone: "bad" },
  replied: { label: "Replied", tone: "good" },
};

export function replyStatus(review: Review): ReplyStatus {
  if (review.replyState === "replied") return "replied";
  const reply = review.replies[0];
  if (!reply) return review.replyState === "draft" ? "draft" : "needs_reply";
  if (reply.status === "failed") return "failed";
  if (reply.status === "scheduled" || reply.status === "publishing") return "scheduled";
  return "draft";
}

/** 1 to 3 stars: never auto-published, always a draft and an alert. */
export const isNegative = (review: Pick<Review, "rating">) => review.rating <= 3;

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function relativeDate(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}
