import { createHash } from "node:crypto";
import { DAILY_METRICS, datesBetween } from "@localpilot/core";
import type { Db } from "@localpilot/db";
import { BUSINESS_SCOPE } from "./oauth";
import { GbpError, type ExchangeContext, type GbpAccount, type GbpAdapter, type GbpIdentity, type GbpInvitationItem, type GbpLocation, type GbpMetricRow, type GbpSession, type GbpSessionContext, type GbpReview, type GbpStats, type PhotoUpload, type PostPublish, type ConsentRequest } from "./types";

const ACCOUNT: GbpAccount = { accountId: "mock-agency", name: "Mock Agency Account", type: "PERSONAL" };
const GROUP: GbpAccount = { accountId: "mock-group", name: "Mock Location Group", type: "LOCATION_GROUP" };
export const MOCK_AGENCY_EMAIL = "agency.demo@localpilot.dev";

interface MockLocation extends GbpLocation {
  revoked?: boolean;
}

interface MockState {
  seeded: boolean;
  tokenRevoked: boolean;
  sequence: number;
  locations: MockLocation[];
  invitations: GbpInvitationItem[];
  uploads?: (PhotoUpload & { name: string })[];
  failUploads?: number;
  posts?: (PostPublish & { name: string })[];
  reviews?: Record<string, MockReview[]>;
  replies?: { reviewId: string; comment: string }[];
}

type MockReview = Omit<GbpReview, "createTime"> & { createTime: string };

const SEED_REVIEWS: [string, number, string | null, string | null][] = [
  ["Asha R", 5, "Lovely staff and very quick service.", "Thank you, Asha!"],
  ["Vikram S", 5, "Best in the area, highly recommend.", null],
  ["Meena K", 4, "Good experience overall.", null],
  ["Rahul P", 5, null, null],
  ["Divya N", 2, "Waited a long time and nobody updated me.", null],
];

function seedReviews(locationId: string): MockReview[] {
  return SEED_REVIEWS.map(([reviewerName, rating, comment, replyComment], index) => ({
    reviewId: `${locationId}-seed-${index}`,
    reviewerName,
    rating,
    comment,
    replyComment,
    createTime: new Date(Date.now() - (index + 2) * 86_400_000).toISOString(),
  }));
}

const BASE_METRICS: Record<string, number> = {
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: 14,
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 22,
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: 46,
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: 61,
  CALL_CLICKS: 4,
  BUSINESS_DIRECTION_REQUESTS: 6,
  WEBSITE_CLICKS: 9,
};

function seededLocation(n: number, title: string, city: string, overrides: Partial<GbpLocation> = {}): MockLocation {
  return {
    accountId: ACCOUNT.accountId,
    accountName: ACCOUNT.name,
    locationId: `mock-loc-${n}`,
    title,
    phone: `+9198000000${String(n).padStart(2, "0")}`,
    address: `${n * 7} Main Road, ${city}`,
    placeId: `mock-place-${n}`,
    website: `https://${title.toLowerCase().replace(/[^a-z]+/g, "")}.example.com`,
    description: `${title} serves customers across ${city}. `.repeat(6),
    categories: ["Primary category", "Additional category"],
    services: ["Consultation", "Standard service", "Premium service"],
    serviceAreas: [city],
    hasHours: true,
    attributes: 3,
    ...overrides,
  };
}

/** The built-in demo businesses are numbered 1 to 10; anything created later starts above 100. */
export const SAMPLE_LOCATION_COUNT = 10;
export const sampleLocationIds = (): string[] => Array.from({ length: SAMPLE_LOCATION_COUNT }, (_, i) => `mock-loc-${i + 1}`);
export const isSampleLocationId = (id: string | null | undefined): boolean => !!id && sampleLocationIds().includes(id);

/** Sample businesses are never allowed in production, whatever MOCK_SAMPLE_DATA says. */
export const sampleDataAllowed = (flag: boolean, appEnv: string | undefined): boolean => flag && appEnv !== "production";

/** Strips the demo businesses (and their fake reviews, uploads and posts) from saved mock state. */
export async function removeSampleFromMockState(db: Db, workspaceId: string): Promise<number> {
  let removed = 0;
  await db.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ state: Partial<MockState> }[]>`SELECT state FROM mock_gbp_state WHERE workspace_id = ${workspaceId}::uuid FOR UPDATE`;
    if (!row?.state?.seeded) return;
    const state = row.state as MockState;
    const before = state.locations.length;
    state.locations = state.locations.filter((l) => !isSampleLocationId(l.locationId));
    removed = before - state.locations.length;
    if (state.reviews) for (const id of Object.keys(state.reviews)) if (isSampleLocationId(id)) delete state.reviews[id];
    if (removed) await tx.mockGbpState.update({ where: { workspaceId }, data: { state: state as unknown as object } });
  });
  return removed;
}

function initialState(sample: boolean): MockState {
  return {
    seeded: true,
    tokenRevoked: false,
    sequence: 100,
    invitations: [],
    locations: !sample ? [] : [
      seededLocation(1, "Sunrise Dental Clinic", "Chennai"),
      seededLocation(2, "Green Leaf Cafe", "Bengaluru", { description: "Fresh coffee.", attributes: 0 }),
      seededLocation(3, "Metro Fitness Studio", "Coimbatore", { website: null, services: [] }),
      seededLocation(4, "Bright Smile Orthodontics", "Madurai", { hasHours: false }),
      seededLocation(5, "Urban Spice Kitchen", "Hyderabad"),
      seededLocation(6, "Lotus Yoga Centre", "Pune"),
      ...["Coastal Auto Care", "Harvest Organic Store", "Pearl Beauty Salon", "Northside Vet Clinic"].map((title, index) =>
        seededLocation(7 + index, title, "Kochi", { accountId: GROUP.accountId, accountName: GROUP.name }),
      ),
    ],
  };
}

function hashNumber(value: string): number {
  return createHash("sha256").update(value).digest().readUInt32BE(0);
}

async function loadState(db: Db, sample: boolean, workspaceId: string): Promise<MockState> {
  const row = await db.mockGbpState.findUnique({ where: { workspaceId } });
  const state = row?.state as unknown as Partial<MockState> | undefined;
  return state?.seeded ? (state as MockState) : initialState(sample);
}

async function saveState(db: Db, workspaceId: string, state: MockState): Promise<void> {
  const json = state as unknown as object;
  await db.mockGbpState.upsert({ where: { workspaceId }, create: { workspaceId, state: json }, update: { state: json } });
}

/** Locks the row, so the API and worker can't overwrite each other's changes. */
async function mutate(db: Db, sample: boolean, workspaceId: string, change: (state: MockState) => void): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`INSERT INTO mock_gbp_state (workspace_id, updated_at) VALUES (${workspaceId}::uuid, now()) ON CONFLICT DO NOTHING`;
    const [row] = await tx.$queryRaw<{ state: Partial<MockState> }[]>`SELECT state FROM mock_gbp_state WHERE workspace_id = ${workspaceId}::uuid FOR UPDATE`;
    const state = row?.state.seeded ? (row.state as MockState) : initialState(sample);
    change(state);
    await tx.mockGbpState.update({ where: { workspaceId }, data: { state: state as unknown as object } });
  });
}

class MockSession implements GbpSession {
  constructor(
    private readonly db: Db,
    private readonly sample: boolean,
    private readonly workspaceId: string,
  ) {}

  private async state(): Promise<MockState> {
    const state = await loadState(this.db, this.sample, this.workspaceId);
    if (state.tokenRevoked) throw new GbpError("auth_revoked", "Mock authorization revoked");
    return state;
  }

  async listAccounts(): Promise<GbpAccount[]> {
    const state = await this.state();
    return state.locations.some((location) => location.accountId === GROUP.accountId) ? [ACCOUNT, GROUP] : [ACCOUNT];
  }

  async listInvitations(accountId: string): Promise<GbpInvitationItem[]> {
    return (await this.state()).invitations.filter((i) => i.accountId === accountId);
  }

  async acceptInvitation(name: string): Promise<void> {
    const state = await this.state();
    const invitation = state.invitations.find((i) => i.name === name);
    if (!invitation) throw new GbpError("not_found", "Invitation not found");
    state.invitations = state.invitations.filter((i) => i.name !== name);
    const n = (state.sequence += 1);
    state.locations.push(
      seededLocation(n, invitation.locationName ?? "Mock Location", "Chennai", {
        address: invitation.address ?? `${n} Main Road, Chennai`,
        placeId: invitation.placeId,
      }),
    );
    await saveState(this.db, this.workspaceId, state);
  }

  async declineInvitation(name: string): Promise<void> {
    const state = await this.state();
    state.invitations = state.invitations.filter((i) => i.name !== name);
    await saveState(this.db, this.workspaceId, state);
  }

  async listLocations(accountId: string): Promise<GbpLocation[]> {
    return (await this.state()).locations.filter((l) => l.accountId === accountId && !l.revoked);
  }

  private async location(locationId: string): Promise<MockLocation> {
    const location = (await this.state()).locations.find((l) => l.locationId === locationId);
    if (!location) throw new GbpError("not_found", "Location not found");
    if (location.revoked) throw new GbpError("access_denied", "Mock 403: manager access removed");
    return location;
  }

  async uploadPhoto(upload: PhotoUpload): Promise<{ name: string }> {
    await this.location(upload.locationId);
    let name = "";
    let failing = false;
    await mutate(this.db, this.sample, this.workspaceId, (state) => {
      if ((state.failUploads ?? 0) > 0) {
        state.failUploads! -= 1;
        failing = true;
        return;
      }
      state.uploads ??= [];
      name = `accounts/${upload.accountId}/locations/${upload.locationId}/media/${state.uploads.length + 1}`;
      state.uploads.push({ ...upload, name });
    });
    if (failing) throw new GbpError("unavailable", "Mock upload failure");
    return { name };
  }

  async publishPost(post: PostPublish): Promise<{ name: string }> {
    await this.location(post.locationId);
    let name = "";
    let failing = false;
    await mutate(this.db, this.sample, this.workspaceId, (state) => {
      if ((state.failUploads ?? 0) > 0) {
        state.failUploads! -= 1;
        failing = true;
        return;
      }
      state.posts ??= [];
      name = `accounts/${post.accountId}/locations/${post.locationId}/localPosts/${state.posts.length + 1}`;
      state.posts.push({ ...post, name });
    });
    if (failing) throw new GbpError("unavailable", "Mock publish failure");
    return { name };
  }

  async listReviews(_accountId: string, locationId: string): Promise<GbpReview[]> {
    await this.location(locationId);
    let reviews: MockReview[] = [];
    await mutate(this.db, this.sample, this.workspaceId, (state) => {
      state.reviews ??= {};
      state.reviews[locationId] ??= seedReviews(locationId);
      reviews = state.reviews[locationId];
    });
    return reviews.map((review) => ({ ...review, createTime: new Date(review.createTime) }));
  }

  async replyToReview(_accountId: string, locationId: string, reviewId: string, comment: string): Promise<void> {
    await this.location(locationId);
    await mutate(this.db, this.sample, this.workspaceId, (state) => {
      const review = state.reviews?.[locationId]?.find((item) => item.reviewId === reviewId);
      if (review) review.replyComment = comment;
      state.replies ??= [];
      state.replies.push({ reviewId, comment });
    });
  }

  async getStats(_accountId: string, locationId: string): Promise<GbpStats> {
    await this.location(locationId);
    const seed = hashNumber(locationId);
    return {
      rating: 3.8 + (seed % 12) / 10,
      reviewCount: 20 + (seed % 300),
      photoCount: 4 + (seed % 40),
      lastPostAt: new Date(Date.now() - (1 + (seed % 25)) * 86_400_000),
      reviewReplyRate: 0.5 + (seed % 50) / 100,
    };
  }

  async getDailyMetrics(locationId: string, start: string, end: string): Promise<GbpMetricRow[]> {
    await this.location(locationId);
    const seed = (hashNumber(locationId) % 100) / 100 + 0.6;
    return datesBetween(start, end).flatMap((date) => {
      const day = new Date(`${date}T00:00:00Z`);
      const weekly = day.getUTCDay() === 0 || day.getUTCDay() === 6 ? 0.75 : 1.1;
      return DAILY_METRICS.map((metric) => {
        const noise = (hashNumber(`${locationId}|${date}|${metric}`) % 40) / 100 + 0.8;
        return { date, metric, value: Math.round((BASE_METRICS[metric] ?? 1) * seed * weekly * noise) };
      });
    });
  }
}

/** Fake Google backed by Postgres, so the API and worker processes share one state. */
export class MockGbpAdapter implements GbpAdapter {
  readonly name = "mock" as const;

  /** With sample off, the fake account has no businesses until an invitation arrives. */
  email: string;

  constructor(
    private readonly db: Db,
    private readonly sample = false,
    email?: string | null,
  ) {
    this.email = email || MOCK_AGENCY_EMAIL;
  }

  async authUrl({ state, redirectUri }: ConsentRequest): Promise<string> {
    return `${redirectUri}?code=mock-code&state=${encodeURIComponent(state)}`;
  }

  async exchangeCode(_code: string, _redirectUri: string, context: ExchangeContext): Promise<GbpIdentity> {
    const scopes = [BUSINESS_SCOPE];
    if (context.purpose === "invite") {
      let n = 0;
      await mutate(this.db, this.sample, context.workspaceId, (state) => {
        n = state.sequence += 1;
        state.locations.push(seededLocation(n, context.businessName ?? "Invited Client Business", "Chennai"));
      });
      return { refreshToken: `mock-client-token-${n}`, email: `client-${n}@example.com`, subject: `mock-client-${n}`, name: null, scopes };
    }
    await mutate(this.db, this.sample, context.workspaceId, (state) => {
      state.tokenRevoked = false;
    });
    return { refreshToken: "mock-refresh-token", email: this.email, subject: "mock-agency-subject", name: "Mock Agency", scopes };
  }

  async revoke(): Promise<void> {}

  session(context: GbpSessionContext): GbpSession {
    return new MockSession(this.db, this.sample, context.workspaceId);
  }

  /** Simulates a client adding the agency Gmail under People and access. */
  async simulateInvitation(workspaceId: string, input: { locationName: string; address?: string | null }): Promise<string> {
    let name = "";
    await mutate(this.db, this.sample, workspaceId, (state) => {
      const n = (state.sequence += 1);
      name = `accounts/${ACCOUNT.accountId}/invitations/${n}`;
      state.invitations.push({
        name,
        accountId: ACCOUNT.accountId,
        role: "MANAGER",
        targetType: "LOCATIONS_ONLY",
        locationName: input.locationName,
        address: input.address ?? null,
        placeId: `mock-place-${n}`,
      });
    });
    return name;
  }

  /** One invitation that matches a pending client exactly, and one that can't be matched safely. */
  async simulateSampleInvitations(workspaceId: string, clean: { locationName: string; address: string | null }): Promise<void> {
    await this.simulateInvitation(workspaceId, clean);
    await this.simulateInvitation(workspaceId, { locationName: `${clean.locationName} Branch`, address: null });
  }

  /** Simulates the client removing the agency, so the next sync gets a 403. */
  async simulateRevokeLocation(workspaceId: string, locationId: string): Promise<void> {
    await mutate(this.db, this.sample, workspaceId, (state) => {
      const location = state.locations.find((l) => l.locationId === locationId);
      if (location) location.revoked = true;
    });
  }

  async simulateRestoreLocation(workspaceId: string, locationId: string): Promise<void> {
    await mutate(this.db, this.sample, workspaceId, (state) => {
      const location = state.locations.find((l) => l.locationId === locationId);
      if (location) location.revoked = false;
    });
  }

  async simulateUploadFailures(workspaceId: string, count: number): Promise<void> {
    await mutate(this.db, this.sample, workspaceId, (state) => {
      state.failUploads = count;
    });
  }

  async listPosts(workspaceId: string): Promise<(PostPublish & { name: string })[]> {
    return (await loadState(this.db, this.sample, workspaceId)).posts ?? [];
  }

  async listReplies(workspaceId: string): Promise<{ reviewId: string; comment: string }[]> {
    return (await loadState(this.db, this.sample, workspaceId)).replies ?? [];
  }

  /** Simulates a customer leaving a new review. */
  async simulateReview(workspaceId: string, locationId: string, input: { rating: number; text: string | null; name?: string }): Promise<string> {
    let reviewId = "";
    await mutate(this.db, this.sample, workspaceId, (state) => {
      reviewId = `${locationId}-new-${(state.sequence += 1)}`;
      state.reviews ??= {};
      state.reviews[locationId] ??= seedReviews(locationId);
      state.reviews[locationId].unshift({ reviewId, reviewerName: input.name ?? "New Customer", rating: input.rating, comment: input.text, replyComment: null, createTime: new Date().toISOString() });
    });
    return reviewId;
  }

  async listUploads(workspaceId: string): Promise<(PhotoUpload & { name: string })[]> {
    return (await loadState(this.db, this.sample, workspaceId)).uploads ?? [];
  }

  async simulateTokenRevoked(workspaceId: string): Promise<void> {
    await mutate(this.db, this.sample, workspaceId, (state) => {
      state.tokenRevoked = true;
    });
  }
}

