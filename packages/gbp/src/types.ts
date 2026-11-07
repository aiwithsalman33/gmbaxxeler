export type GbpErrorKind = "access_denied" | "auth_revoked" | "rate_limited" | "quota_zero" | "not_configured" | "not_found" | "unavailable";

export class GbpError extends Error {
  constructor(
    public readonly kind: GbpErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "GbpError";
  }
}

export interface GbpAccount {
  accountId: string;
  name: string;
  type: string;
}

export interface GbpInvitationItem {
  name: string;
  accountId: string;
  role: string;
  targetType: string;
  locationName: string | null;
  address: string | null;
  placeId: string | null;
}

export interface GbpLocation {
  accountId: string;
  accountName: string | null;
  locationId: string;
  title: string;
  phone: string | null;
  address: string | null;
  placeId: string | null;
  website: string | null;
  description: string | null;
  categories: string[];
  services: string[];
  serviceAreas: string[];
  hasHours: boolean;
  attributes: number;
}

export interface GbpStats {
  rating: number | null;
  reviewCount: number;
  photoCount: number;
  lastPostAt: Date | null;
  reviewReplyRate: number | null;
}

export interface GbpMetricRow {
  date: string;
  metric: string;
  value: number;
}

export interface PhotoUpload {
  accountId: string;
  locationId: string;
  sourceUrl: string;
  category: string;
}

export interface PostPublish {
  accountId: string;
  locationId: string;
  summary: string;
  ctaType: string;
  ctaUrl: string | null;
  imageUrl: string;
}

export interface GbpReview {
  reviewId: string;
  reviewerName: string;
  rating: number;
  comment: string | null;
  createTime: Date;
  replyComment: string | null;
}

export interface GbpIdentity {
  refreshToken: string | null;
  email: string;
  subject: string;
  name: string | null;
  scopes: string[];
}

/** Calls made on behalf of one connected Google account. */
export interface GbpSession {
  listAccounts(): Promise<GbpAccount[]>;
  listInvitations(accountId: string): Promise<GbpInvitationItem[]>;
  acceptInvitation(name: string): Promise<void>;
  declineInvitation(name: string): Promise<void>;
  listLocations(accountId: string): Promise<GbpLocation[]>;
  getStats(accountId: string, locationId: string): Promise<GbpStats>;
  getDailyMetrics(locationId: string, start: string, end: string): Promise<GbpMetricRow[]>;
  uploadPhoto(upload: PhotoUpload): Promise<{ name: string }>;
  publishPost(post: PostPublish): Promise<{ name: string }>;
  listReviews(accountId: string, locationId: string): Promise<GbpReview[]>;
  replyToReview(accountId: string, locationId: string, reviewId: string, comment: string): Promise<void>;
}

/** Hands out a valid access token. Passing a token Google rejected forces a new one. */
export interface TokenSource {
  get(rejected?: string): Promise<string>;
}

export interface GbpSessionContext {
  workspaceId: string;
  tokens: TokenSource;
}

export interface ExchangeContext {
  workspaceId: string;
  purpose: "agency" | "invite";
  businessName?: string | null;
  codeVerifier: string;
}

export interface ConsentRequest {
  state: string;
  redirectUri: string;
  codeChallenge: string;
  loginHint?: string | null;
}

export interface GbpAdapter {
  readonly name: "mock" | "real";
  authUrl(request: ConsentRequest): Promise<string>;
  exchangeCode(code: string, redirectUri: string, context: ExchangeContext): Promise<GbpIdentity>;
  revoke(refreshToken: string): Promise<void>;
  session(context: GbpSessionContext): GbpSession;
}
