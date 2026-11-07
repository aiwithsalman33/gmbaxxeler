import { AUTO_MIN_RATING, NEGATIVE_MAX_RATING } from "./limits";

export type ReplyMode = "draft_only" | "auto_4_5" | "full_auto";

export type ReviewAction = "ignore" | "draft" | "draft_and_alert" | "auto_reply";

/**
 * 1-3 star reviews never publish on their own, in any mode.
 * auto_4_5 answers reviews with text; full_auto also thanks rating-only reviews.
 */
export function reviewAction(input: { rating: number; hasText: boolean; autoReplyEnabled: boolean; mode: ReplyMode }): ReviewAction {
  if (input.rating <= NEGATIVE_MAX_RATING) return "draft_and_alert";
  if (!input.autoReplyEnabled) return "ignore";
  if (input.mode === "draft_only" || input.rating < AUTO_MIN_RATING) return "draft";
  if (input.mode === "auto_4_5" && !input.hasText) return "draft";
  return "auto_reply";
}

export function replyDelaySeconds(min: number, max: number, random = Math.random()): number {
  return Math.round(min + (max - min) * random);
}
