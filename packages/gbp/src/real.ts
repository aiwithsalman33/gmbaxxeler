import { DAILY_METRICS, fillZeroGaps } from "@localpilot/core";
import { RateLimiter } from "./limiter";
import { BUSINESS_SCOPE, consentUrl, exchangeCode, IDENTITY_SCOPES, readIdToken, revokeToken, type GoogleCredentials } from "./oauth";
import { GbpError, type ConsentRequest, type ExchangeContext, type GbpAccount, type GbpAdapter, type GbpIdentity, type GbpInvitationItem, type GbpLocation, type GbpMetricRow, type GbpSession, type GbpSessionContext, type GbpReview, type GbpStats, type PhotoUpload, type PostPublish, type TokenSource } from "./types";

const ACCOUNTS_API = "https://mybusinessaccountmanagement.googleapis.com/v1";
const INFO_API = "https://mybusinessbusinessinformation.googleapis.com/v1";
const PERFORMANCE_API = "https://businessprofileperformance.googleapis.com/v1";
const V4_API = "https://mybusiness.googleapis.com/v4";
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;
const DEFAULT_QPM = 240;
const LOCATION_FIELDS = "name,title,phoneNumbers,storefrontAddress,websiteUri,categories,regularHours,profile,serviceItems,serviceArea,metadata";
const REPLY_SAMPLE = 50;
const STAR_RATINGS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

// These 403s describe our project, not the client's access. Treating them as
// access_denied would flag every client as removed before Google approves the project.
const PROJECT_LEVEL_REASONS = new Set([
  "SERVICE_DISABLED",
  "API_KEY_SERVICE_BLOCKED",
  "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
  "RATE_LIMIT_EXCEEDED",
  "RESOURCE_EXHAUSTED",
]);

export type FetchLike = typeof fetch;

interface GoogleConfig {
  credentials: () => Promise<GoogleCredentials | null>;
  fetch?: FetchLike;
  maxQpm?: number;
  backoffBaseMs?: number;
}

function errorReason(body: unknown): string | null {
  const details = (body as { error?: { details?: { reason?: string }[]; status?: string } })?.error;
  return details?.details?.find((d) => d.reason)?.reason ?? details?.status ?? null;
}

/** Shown on jobs and in Settings when Google has granted this Cloud project no Business Profile quota. */
export const QUOTA_ZERO_MESSAGE = "Google Business Profile API access is not approved for this project";

export function toGbpError(status: number, body: unknown): GbpError {
  const reason = errorReason(body);
  if (status === 401 || (body as { error?: string })?.error === "invalid_grant") {
    return new GbpError("auth_revoked", "Google authorization is no longer valid");
  }
  // A limit of 0 is an unapproved project, so retrying can never help.
  if ((status === 429 || status === 403) && /quota_limit_value"?:\s*"?0"?\b/.test(JSON.stringify(body))) {
    return new GbpError("quota_zero", QUOTA_ZERO_MESSAGE);
  }
  if (status === 429) return new GbpError("rate_limited", "Google rate limit reached");
  if (status === 403) {
    if (reason && PROJECT_LEVEL_REASONS.has(reason)) return new GbpError("unavailable", `Google API project error: ${reason}`);
    return new GbpError("access_denied", "Google denied access to this resource");
  }
  if (status === 404) return new GbpError("not_found", "Google resource not found");
  return new GbpError("unavailable", `Google API returned ${status}`);
}

function formatAddress(address: { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string } | undefined): string | null {
  if (!address) return null;
  return [...(address.addressLines ?? []), address.locality, address.administrativeArea, address.postalCode].filter(Boolean).join(", ") || null;
}

class RealSession implements GbpSession {
  constructor(
    private readonly tokens: TokenSource,
    private readonly http: FetchLike,
    private readonly limiter: RateLimiter,
    private readonly backoffBaseMs: number,
  ) {}

  private async call<T>(url: string, init?: RequestInit): Promise<T> {
    let token = await this.tokens.get();
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      await this.limiter.acquire();
      const response = await this.http(url, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
      if (response.ok) return (await response.json().catch(() => ({}))) as T;

      const body = await response.json().catch(() => ({}));
      if (response.status === 401 && !refreshed) {
        refreshed = true;
        token = await this.tokens.get(token);
        continue;
      }
      const error = toGbpError(response.status, body);
      if (error.kind !== "rate_limited" || attempt >= MAX_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, this.backoffBaseMs * 2 ** attempt));
    }
  }

  private async paged<T>(url: string, key: string): Promise<T[]> {
    const items: T[] = [];
    let pageToken: string | undefined;
    do {
      const separator = url.includes("?") ? "&" : "?";
      const page: Record<string, unknown> & { nextPageToken?: string } = await this.call(
        pageToken ? `${url}${separator}pageToken=${encodeURIComponent(pageToken)}` : url,
      );
      items.push(...((page[key] as T[] | undefined) ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return items;
  }

  async listAccounts(): Promise<GbpAccount[]> {
    const accounts = await this.paged<{ name: string; accountName?: string; type?: string }>(`${ACCOUNTS_API}/accounts?pageSize=20`, "accounts");
    return accounts.map((a) => ({ accountId: a.name.replace("accounts/", ""), name: a.accountName ?? a.name, type: a.type ?? "ACCOUNT_TYPE_UNSPECIFIED" }));
  }

  async listInvitations(accountId: string): Promise<GbpInvitationItem[]> {
    const { invitations = [] } = await this.call<{
      invitations?: { name: string; role?: string; targetType?: string; targetLocation?: { locationName?: string; address?: string; placeId?: string }; targetAccount?: { accountName?: string } }[];
    }>(`${ACCOUNTS_API}/accounts/${accountId}/invitations`);
    return invitations.map((i) => ({
      name: i.name,
      accountId,
      role: i.role ?? "ADMIN_ROLE_UNSPECIFIED",
      targetType: i.targetType ?? (i.targetLocation ? "LOCATIONS_ONLY" : "ACCOUNTS_ONLY"),
      locationName: i.targetLocation?.locationName ?? i.targetAccount?.accountName ?? null,
      address: i.targetLocation?.address ?? null,
      placeId: i.targetLocation?.placeId ?? null,
    }));
  }

  async acceptInvitation(name: string): Promise<void> {
    await this.call(`${ACCOUNTS_API}/${name}:accept`, { method: "POST", body: "{}" });
  }

  async declineInvitation(name: string): Promise<void> {
    await this.call(`${ACCOUNTS_API}/${name}:decline`, { method: "POST", body: "{}" });
  }

  async listLocations(accountId: string): Promise<GbpLocation[]> {
    const locations = await this.paged<{
      name: string;
      title?: string;
      phoneNumbers?: { primaryPhone?: string };
      storefrontAddress?: Parameters<typeof formatAddress>[0];
      websiteUri?: string;
      categories?: { primaryCategory?: { displayName?: string }; additionalCategories?: { displayName?: string }[] };
      regularHours?: { periods?: unknown[] };
      profile?: { description?: string };
      serviceItems?: { freeFormServiceItem?: { label?: { displayName?: string } }; structuredServiceItem?: { serviceTypeId?: string } }[];
      serviceArea?: { places?: { placeInfos?: { placeName?: string }[] } };
      metadata?: { placeId?: string };
    }>(`${INFO_API}/accounts/${accountId}/locations?pageSize=100&readMask=${LOCATION_FIELDS}`, "locations");

    return locations.map((l) => ({
      accountId,
      accountName: null,
      locationId: l.name.replace("locations/", ""),
      title: l.title ?? l.name,
      phone: l.phoneNumbers?.primaryPhone ?? null,
      address: formatAddress(l.storefrontAddress),
      placeId: l.metadata?.placeId ?? null,
      website: l.websiteUri ?? null,
      description: l.profile?.description ?? null,
      categories: [l.categories?.primaryCategory, ...(l.categories?.additionalCategories ?? [])].flatMap((c) => c?.displayName ?? []),
      services: (l.serviceItems ?? []).flatMap((s) => s.freeFormServiceItem?.label?.displayName ?? s.structuredServiceItem?.serviceTypeId ?? []),
      serviceAreas: (l.serviceArea?.places?.placeInfos ?? []).flatMap((p) => p.placeName ?? []),
      hasHours: (l.regularHours?.periods?.length ?? 0) > 0,
      attributes: 0,
    }));
  }

  async getStats(accountId: string, locationId: string): Promise<GbpStats> {
    const base = `${V4_API}/accounts/${accountId}/locations/${locationId}`;
    const [reviews, media, posts] = await Promise.all([
      this.call<{ averageRating?: number; totalReviewCount?: number; reviews?: { reviewReply?: unknown }[] }>(`${base}/reviews?pageSize=${REPLY_SAMPLE}`),
      this.call<{ totalMediaItemCount?: number }>(`${base}/media?pageSize=1`),
      this.call<{ localPosts?: { createTime?: string }[] }>(`${base}/localPosts?pageSize=1`),
    ]);
    const sample = reviews.reviews ?? [];
    const lastPost = posts.localPosts?.[0]?.createTime;
    return {
      rating: reviews.averageRating ?? null,
      reviewCount: reviews.totalReviewCount ?? 0,
      photoCount: media.totalMediaItemCount ?? 0,
      lastPostAt: lastPost ? new Date(lastPost) : null,
      reviewReplyRate: sample.length ? sample.filter((r) => r.reviewReply).length / sample.length : null,
    };
  }

  async uploadPhoto({ accountId, locationId, sourceUrl, category }: PhotoUpload): Promise<{ name: string }> {
    return this.call(`${V4_API}/accounts/${accountId}/locations/${locationId}/media`, {
      method: "POST",
      body: JSON.stringify({ mediaFormat: "PHOTO", locationAssociation: { category }, sourceUrl }),
    });
  }

  async publishPost({ accountId, locationId, summary, ctaType, ctaUrl, imageUrl }: PostPublish): Promise<{ name: string }> {
    return this.call(`${V4_API}/accounts/${accountId}/locations/${locationId}/localPosts`, {
      method: "POST",
      body: JSON.stringify({
        languageCode: "en",
        topicType: "STANDARD",
        summary,
        // Google says to leave url unset on CALL: the button uses the profile phone.
        callToAction: ctaType === "CALL" ? { actionType: "CALL" } : { actionType: ctaType, url: ctaUrl },
        media: [{ mediaFormat: "PHOTO", sourceUrl: imageUrl }],
      }),
    });
  }

  async listReviews(accountId: string, locationId: string): Promise<GbpReview[]> {
    const reviews = await this.paged<{
      reviewId: string;
      reviewer?: { displayName?: string };
      starRating?: string;
      comment?: string;
      createTime?: string;
      reviewReply?: { comment?: string };
    }>(`${V4_API}/accounts/${accountId}/locations/${locationId}/reviews?pageSize=50`, "reviews");
    return reviews.map((review) => ({
      reviewId: review.reviewId,
      reviewerName: review.reviewer?.displayName ?? "Anonymous",
      rating: STAR_RATINGS[review.starRating ?? ""] ?? 0,
      comment: review.comment ?? null,
      createTime: new Date(review.createTime ?? 0),
      replyComment: review.reviewReply?.comment ?? null,
    }));
  }

  async replyToReview(accountId: string, locationId: string, reviewId: string, comment: string): Promise<void> {
    await this.call(`${V4_API}/accounts/${accountId}/locations/${locationId}/reviews/${reviewId}/reply`, { method: "PUT", body: JSON.stringify({ comment }) });
  }

  async getDailyMetrics(locationId: string, start: string, end: string): Promise<GbpMetricRow[]> {
    const params = new URLSearchParams(DAILY_METRICS.map((metric): [string, string] => ["dailyMetrics", metric]));
    const [startYear, startMonth, startDay] = start.split("-").map(Number) as [number, number, number];
    const [endYear, endMonth, endDay] = end.split("-").map(Number) as [number, number, number];
    params.set("dailyRange.start_date.year", String(startYear));
    params.set("dailyRange.start_date.month", String(startMonth));
    params.set("dailyRange.start_date.day", String(startDay));
    params.set("dailyRange.end_date.year", String(endYear));
    params.set("dailyRange.end_date.month", String(endMonth));
    params.set("dailyRange.end_date.day", String(endDay));

    const body = await this.call<{
      multiDailyMetricTimeSeries?: {
        dailyMetricTimeSeries?: {
          dailyMetric: string;
          timeSeries?: { datedValues?: { date: { year: number; month: number; day: number }; value?: string }[] };
        }[];
      }[];
    }>(`${PERFORMANCE_API}/locations/${locationId}:fetchMultiDailyMetricsTimeSeries?${params}`);

    const rows: GbpMetricRow[] = [];
    for (const group of body.multiDailyMetricTimeSeries ?? []) {
      for (const series of group.dailyMetricTimeSeries ?? []) {
        for (const { date, value } of series.timeSeries?.datedValues ?? []) {
          if (value === undefined) continue;
          const iso = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
          rows.push({ date: iso, metric: series.dailyMetric, value: Number(value) });
        }
      }
    }
    return fillZeroGaps(rows, start);
  }
}

export class RealGbpAdapter implements GbpAdapter {
  readonly name = "real" as const;
  private readonly http: FetchLike;
  private readonly limiter: RateLimiter;

  constructor(private readonly config: GoogleConfig) {
    this.http = config.fetch ?? fetch;
    this.limiter = new RateLimiter(config.maxQpm ?? DEFAULT_QPM);
  }

  private async credentials(): Promise<GoogleCredentials> {
    const credentials = await this.config.credentials();
    if (!credentials) throw new GbpError("not_configured", "Google credentials aren't set");
    return credentials;
  }

  async authUrl({ state, redirectUri, codeChallenge, loginHint }: ConsentRequest): Promise<string> {
    const { clientId } = await this.credentials();
    return consentUrl({ clientId, redirectUri, scopes: [...IDENTITY_SCOPES, BUSINESS_SCOPE], state, codeChallenge, loginHint, offline: true });
  }

  async exchangeCode(code: string, redirectUri: string, context: ExchangeContext): Promise<GbpIdentity> {
    const credentials = await this.credentials();
    const tokens = await exchangeCode(this.http, credentials, { code, redirectUri, codeVerifier: context.codeVerifier });
    if (!tokens.idToken) throw new GbpError("unavailable", "Google didn't return an identity");
    const identity = readIdToken(tokens.idToken, credentials.clientId);
    return { refreshToken: tokens.refreshToken, email: identity.email, subject: identity.subject, name: identity.name, scopes: tokens.scopes };
  }

  revoke(refreshToken: string): Promise<void> {
    return revokeToken(this.http, refreshToken);
  }

  session(context: GbpSessionContext): GbpSession {
    return new RealSession(context.tokens, this.http, this.limiter, this.config.backoffBaseMs ?? BACKOFF_BASE_MS);
  }
}
