export type ClientStatus = "invited" | "waiting_for_access" | "connected" | "reconnect_required" | "access_removed" | "paused" | "removed";

export interface Client {
  id: string;
  name: string;
  status: ClientStatus;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
  notes: string | null;
  invitedAt: string | null;
  guideSentAt: string | null;
  connectedAt: string | null;
  matchMethod: string | null;
  aiRenameEnabled: boolean;
  timezone: string;
  stats?: { strengthScore: number; rating: number | null } | null;
  /** One of the built-in sample businesses; never real Google data. */
  demo?: boolean;
}

export interface Guide {
  subject: string;
  text: string;
  agencyEmail: string | null;
  whatsappUrl: string | null;
  channels: string[];
}

export interface Invitation {
  id: string;
  locationName: string | null;
  address: string | null;
  status: string;
  role: string;
  targetType: string;
  matchReason: string | null;
  suggestedClientId: string | null;
}

export interface GbpLocation {
  accountId: string;
  accountName: string | null;
  locationId: string;
  title: string;
  address: string | null;
  phone: string | null;
  categories: string[];
  clientId: string | null;
}

export interface Connection {
  id: string;
  googleAccountEmail: string;
  status: string;
  source: string;
  scopes: string[];
  lastSyncedAt: string | null;
  accountsCount: number;
  locationsCount: number;
  lastError: string | null;
  needsConfirmation: boolean;
}

export interface GoogleCredentials {
  source: "settings" | "env" | "none";
  clientId: string | null;
  maskedSecret: string | null;
  status: "valid" | "invalid" | "unknown";
  redirectUris: string[];
}

export interface GoogleStatus {
  adapter: "mock" | "real";
  credentialsSet: boolean;
  agencyConnected: boolean;
  apiAccess: "approved" | "not_approved" | "unknown";
  expectedAgencyEmail: string | null;
  clientOauthLinks: boolean;
}

export interface Me {
  user: { id: string; email: string; name: string | null };
  workspace: { id: string; name: string; timezone: string };
  role: string;
}

export interface Totals {
  views: number;
  calls: number;
  directions: number;
  websiteClicks: number;
}

export interface Dashboard {
  client: { id: string; name: string; status: ClientStatus; onboarded: boolean };
  basics: { name: string; address: string | null; rating: number | null; reviewCount: number; photoCount: number; lastPostAt: string | null };
  strength: { score: number; checklist: { key: string; label: string; done: boolean; hint: string; weight: number }[] };
  metrics: { current: Totals; previous: Totals; series: (Totals & { date: string })[]; rangeStart: string | null; rangeEnd: string | null };
  syncedAt: string | null;
}

export type FolderKind = "photos" | "seo_images";

export interface LibraryImage {
  id: string;
  publicUrl: string;
  originalName: string;
  bytes: number;
  width: number;
  height: number;
  tags: string[];
  usageCount: number;
  lastUsedAt: string | null;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  readAt: string | null;
  createdAt: string;
}

export const PHOTO_CATEGORIES = ["ADDITIONAL", "EXTERIOR", "INTERIOR", "PRODUCT", "AT_WORK", "FOOD_AND_DRINK", "MENU", "COMMON_AREA", "ROOMS", "TEAMS"];

export const CATEGORY_LABELS: Record<string, string> = {
  ADDITIONAL: "Additional",
  EXTERIOR: "Exterior",
  INTERIOR: "Interior",
  PRODUCT: "Product",
  AT_WORK: "At work",
  FOOD_AND_DRINK: "Food and drink",
  MENU: "Menu",
  COMMON_AREA: "Common area",
  ROOMS: "Rooms",
  TEAMS: "Team",
};

export type JobStatus = "scheduled" | "publishing" | "published" | "failed" | "dead" | "skipped" | "needs_images" | "awaiting_approval";

export interface PhotoSchedule {
  weekdays: number[];
  localTime: string;
  timezone: string;
  countPerDay: number;
  defaultCategory: string;
  enabled: boolean;
}

export interface PhotoJob {
  id: string;
  runAt: string;
  status: JobStatus;
  attempts: number;
  error: string | null;
  category: string | null;
  image: { id: string; publicUrl: string; originalName: string; seoName: string | null } | null;
  logs?: { originalName: string | null; newName: string | null; meta: unknown }[];
  /** Published through the mock adapter: nothing reached Google. */
  simulated?: boolean;
}

export const CTA_LABELS: Record<string, string> = { LEARN_MORE: "Learn more", BOOK: "Book", ORDER: "Order", SHOP: "Shop", SIGN_UP: "Sign up", CALL: "Call" };

export interface Post {
  id: string;
  summary: string;
  ctaType: string;
  ctaUrl: string | null;
  aiGenerated: boolean;
  approvedAt: string | null;
}

export interface PostJob {
  id: string;
  runAt: string;
  status: JobStatus;
  error: string | null;
  post: Post | null;
  image: { id: string; publicUrl: string; originalName: string } | null;
  simulated?: boolean;
}

export type BlockerCode = "client_not_connected" | "schedule_off" | "no_schedule" | "folder_empty" | "worker_offline" | "api_not_approved" | "needs_approval";

export interface Readiness {
  ready: boolean;
  simulated: boolean;
  blockers: { code: BlockerCode; message: string; count?: number }[];
}

export interface WorkerHealth {
  status: "online" | "offline" | "never_started";
  lastBeatAt: string | null;
  startedAt: string | null;
  lastRunAt: string | null;
  adapter: string | null;
  adapterInUse: "mock" | "real";
  jobs: { name: string; lastStartedAt: string | null; lastFinishedAt: string | null; lastDurationMs: number | null; lastError: string | null; runs: number; failures: number }[];
}

export interface ReviewReply {
  id: string;
  text: string;
  status: string;
  publishAt: string | null;
  error: string | null;
}

export interface Review {
  id: string;
  rating: number;
  text: string | null;
  reviewerName: string;
  reviewedAt: string;
  replyState: "unreplied" | "draft" | "replied";
  replyText: string | null;
  replies: ReviewReply[];
}

export interface ReviewSettings {
  autoReplyEnabled: boolean;
  replyBrain: string | null;
  mode: "draft_only" | "auto_4_5" | "full_auto";
  delayMinS: number;
  delayMaxS: number;
}
