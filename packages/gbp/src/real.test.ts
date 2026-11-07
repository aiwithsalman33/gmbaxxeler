import { describe, expect, it } from "vitest";
import { RealGbpAdapter, toGbpError, type FetchLike } from "./real";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function adapter(api: (url: string) => Response): RealGbpAdapter {
  const http = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("oauth2.googleapis.com/token")) return json({ access_token: "t", expires_in: 3600 });
    return api(url);
  }) as FetchLike;
  return new RealGbpAdapter({ clientId: "id", clientSecret: "secret", fetch: http });
}

describe("toGbpError", () => {
  it("treats a plain 403 as lost access", () => {
    expect(toGbpError(403, { error: { status: "PERMISSION_DENIED" } }).kind).toBe("access_denied");
  });

  it("does not treat an unapproved project as lost client access", () => {
    const body = { error: { details: [{ reason: "SERVICE_DISABLED" }] } };
    expect(toGbpError(403, body).kind).toBe("unavailable");
  });

  it("maps auth, quota and not-found errors", () => {
    expect(toGbpError(401, {}).kind).toBe("auth_revoked");
    expect(toGbpError(429, {}).kind).toBe("rate_limited");
    expect(toGbpError(404, {}).kind).toBe("not_found");
  });
});

describe("RealGbpAdapter session", () => {
  it("parses metrics and sends every verified metric name", async () => {
    let requested = "";
    const session = adapter((url) => {
      requested = url;
      return json({
        multiDailyMetricTimeSeries: [
          {
            dailyMetricTimeSeries: [
              {
                dailyMetric: "CALL_CLICKS",
                timeSeries: { datedValues: [{ date: { year: 2026, month: 1, day: 2 }, value: "4" }, { date: { year: 2026, month: 1, day: 1 } }] },
              },
            ],
          },
        ],
      });
    }).session({ workspaceId: "w", refreshToken: "r" });

    const rows = await session.getDailyMetrics("123", "2026-01-01", "2026-01-05");
    expect(rows).toContainEqual({ date: "2026-01-02", metric: "CALL_CLICKS", value: 4 });
    expect(rows).toContainEqual({ date: "2026-01-01", metric: "CALL_CLICKS", value: 0 });
    expect(rows.some((r) => r.date > "2026-01-02")).toBe(false);
    expect(requested).toContain("dailyMetrics=BUSINESS_IMPRESSIONS_MOBILE_MAPS");
    expect(requested).toContain("dailyMetrics=BUSINESS_DIRECTION_REQUESTS");
  });

  it("uploads a photo through the v4 media endpoint", async () => {
    let url = "";
    let body = "";
    const http = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("oauth2.googleapis.com/token")) return json({ access_token: "t", expires_in: 3600 });
      url = String(input);
      body = String(init?.body);
      return json({ name: "accounts/1/locations/2/media/3" });
    }) as FetchLike;
    const session = new RealGbpAdapter({ clientId: "id", clientSecret: "secret", fetch: http }).session({ workspaceId: "w", refreshToken: "r" });

    const result = await session.uploadPhoto({ accountId: "1", locationId: "2", sourceUrl: "https://x/a.png", category: "EXTERIOR" });
    expect(result.name).toBe("accounts/1/locations/2/media/3");
    expect(url).toBe("https://mybusiness.googleapis.com/v4/accounts/1/locations/2/media");
    expect(JSON.parse(body)).toEqual({ mediaFormat: "PHOTO", locationAssociation: { category: "EXTERIOR" }, sourceUrl: "https://x/a.png" });
  });

  it("publishes a post without a url on Call buttons", async () => {
    const bodies: { callToAction: unknown; summary: string; title?: string }[] = [];
    const http = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("oauth2.googleapis.com/token")) return json({ access_token: "t", expires_in: 3600 });
      bodies.push(JSON.parse(String(init?.body)));
      return json({ name: "accounts/1/locations/2/localPosts/3" });
    }) as FetchLike;
    const session = new RealGbpAdapter({ clientId: "id", clientSecret: "secret", fetch: http }).session({ workspaceId: "w", refreshToken: "r" });
    const post = { accountId: "1", locationId: "2", summary: "Hello", imageUrl: "https://x/a.png" };

    await session.publishPost({ ...post, ctaType: "CALL", ctaUrl: "https://ignored" });
    await session.publishPost({ ...post, ctaType: "LEARN_MORE", ctaUrl: "https://example.com" });
    expect(bodies[0]!.callToAction).toEqual({ actionType: "CALL" });
    expect(bodies[1]!.callToAction).toEqual({ actionType: "LEARN_MORE", url: "https://example.com" });
    expect(bodies[0]!.title).toBeUndefined();
  });

  it("reads reviews and maps star ratings", async () => {
    const session = adapter(() =>
      json({ reviews: [{ reviewId: "r1", starRating: "TWO", comment: "Slow", createTime: "2026-01-02T00:00:00Z", reviewer: { displayName: "Asha" } }] }),
    ).session({ workspaceId: "w", refreshToken: "r" });
    const [review] = await session.listReviews("1", "2");
    expect(review).toMatchObject({ reviewId: "r1", rating: 2, comment: "Slow", reviewerName: "Asha", replyComment: null });
  });

  it("reads location invitations", async () => {
    const session = adapter(() =>
      json({
        invitations: [
          { name: "accounts/1/invitations/2", role: "MANAGER", targetType: "LOCATIONS_ONLY", targetLocation: { locationName: "Acme", address: "1 Road" } },
        ],
      }),
    ).session({ workspaceId: "w", refreshToken: "r" });

    expect(await session.listInvitations("1")).toEqual([
      { name: "accounts/1/invitations/2", accountId: "1", role: "MANAGER", targetType: "LOCATIONS_ONLY", locationName: "Acme", address: "1 Road", placeId: null },
    ]);
  });
});
