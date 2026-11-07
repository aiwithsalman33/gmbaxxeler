export interface ProfileStrengthInput {
  categories: number;
  description: string | null;
  hasHours: boolean;
  services: number;
  photoCount: number;
  lastPostAt: Date | null;
  reviewReplyRate: number | null;
  website: string | null;
  attributes: number;
}

export interface ChecklistItem {
  key: string;
  label: string;
  weight: number;
  done: boolean;
  hint: string;
}

const MIN_DESCRIPTION_CHARS = 250;
const MIN_PHOTOS = 10;
const RECENT_POST_DAYS = 14;
const MIN_REPLY_RATE = 0.8;

export function computeProfileStrength(
  input: ProfileStrengthInput,
  now = new Date(),
): { score: number; checklist: ChecklistItem[] } {
  const daysSincePost = input.lastPostAt ? (now.getTime() - input.lastPostAt.getTime()) / 86_400_000 : Infinity;
  const checklist: ChecklistItem[] = [
    { key: "categories", label: "Categories", weight: 10, done: input.categories >= 2, hint: "Add a primary and at least one additional category" },
    { key: "description", label: "Description", weight: 15, done: (input.description?.length ?? 0) >= MIN_DESCRIPTION_CHARS, hint: `Write a description of at least ${MIN_DESCRIPTION_CHARS} characters` },
    { key: "hours", label: "Opening hours", weight: 10, done: input.hasHours, hint: "Set regular opening hours" },
    { key: "services", label: "Services", weight: 10, done: input.services >= 3, hint: "List at least 3 services" },
    { key: "photos", label: "Photos", weight: 15, done: input.photoCount >= MIN_PHOTOS, hint: `Reach at least ${MIN_PHOTOS} photos` },
    { key: "posts", label: "Recent posts", weight: 15, done: daysSincePost <= RECENT_POST_DAYS, hint: `Publish a post in the last ${RECENT_POST_DAYS} days` },
    { key: "reviews", label: "Review replies", weight: 15, done: (input.reviewReplyRate ?? 0) >= MIN_REPLY_RATE, hint: "Reply to at least 80% of reviews" },
    { key: "website", label: "Website", weight: 5, done: Boolean(input.website), hint: "Add the website link" },
    { key: "attributes", label: "Attributes", weight: 5, done: input.attributes >= 1, hint: "Fill in business attributes" },
  ];
  const score = checklist.reduce((sum, item) => sum + (item.done ? item.weight : 0), 0);
  return { score, checklist };
}
