import { describe, expect, it } from "vitest";
import { capPostText } from "./post-text";
import { replyDelaySeconds, reviewAction, type ReplyMode } from "./review-rules";

const modes: ReplyMode[] = ["draft_only", "auto_4_5", "full_auto"];

describe("reviewAction", () => {
  it("never auto-publishes a 1-3 star review, in any mode or setting", () => {
    for (const mode of modes) {
      for (const autoReplyEnabled of [true, false]) {
        for (const rating of [1, 2, 3]) {
          for (const hasText of [true, false]) {
            expect(reviewAction({ rating, hasText, autoReplyEnabled, mode })).toBe("draft_and_alert");
          }
        }
      }
    }
  });

  it("does nothing for good reviews when auto-reply is off", () => {
    expect(reviewAction({ rating: 5, hasText: true, autoReplyEnabled: false, mode: "full_auto" })).toBe("ignore");
  });

  it("drafts in draft-only mode", () => {
    expect(reviewAction({ rating: 5, hasText: true, autoReplyEnabled: true, mode: "draft_only" })).toBe("draft");
  });

  it("auto-replies to 4-5 stars with text", () => {
    expect(reviewAction({ rating: 4, hasText: true, autoReplyEnabled: true, mode: "auto_4_5" })).toBe("auto_reply");
    expect(reviewAction({ rating: 5, hasText: true, autoReplyEnabled: true, mode: "full_auto" })).toBe("auto_reply");
  });

  it("separates the modes on rating-only reviews", () => {
    expect(reviewAction({ rating: 5, hasText: false, autoReplyEnabled: true, mode: "auto_4_5" })).toBe("draft");
    expect(reviewAction({ rating: 5, hasText: false, autoReplyEnabled: true, mode: "full_auto" })).toBe("auto_reply");
  });
});

describe("replyDelaySeconds", () => {
  it("stays within the range", () => {
    expect(replyDelaySeconds(300, 3600, 0)).toBe(300);
    expect(replyDelaySeconds(300, 3600, 1)).toBe(3600);
  });
});

describe("capPostText", () => {
  it("leaves short text alone", () => {
    expect(capPostText(" Hello. ")).toBe("Hello.");
  });

  it("always respects the cap and ends on a sentence", () => {
    const capped = capPostText("A sentence that repeats nicely here. ".repeat(100));
    expect(capped.length).toBeLessThanOrEqual(1500);
    expect(capped.endsWith(".")).toBe(true);
  });

  it("hard-cuts text with no sentence breaks", () => {
    expect(capPostText("x".repeat(2000)).length).toBe(1500);
  });
});
