import { POST_MAX_CHARS } from "./limits";

/** Cuts at a sentence end, so an over-long post never stops mid-thought. */
export function capPostText(text: string, max = POST_MAX_CHARS): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "), cut.lastIndexOf(".\n"));
  return end > max / 2 ? cut.slice(0, end + 1).trim() : cut.trim();
}
