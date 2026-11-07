export interface FakeGoogleOptions {
  scopes?: string[];
  noRefreshToken?: boolean;
  quotaZero?: boolean;
  email?: string;
  subject?: string;
  emailVerified?: boolean;
}

const BUSINESS = "https://www.googleapis.com/auth/business.manage";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Stands in for Google's OAuth and Business Profile endpoints. */
export function createFakeGoogle(options: FakeGoogleOptions = {}) {
  const fake = {
    options,
    revokedRefresh: false,
    refreshCount: 0,
    revokedTokens: [] as string[],
    verifiers: [] as string[],
    requests: [] as string[],
    accounts: [
      { name: "accounts/1", accountName: "Baranikumar", type: "PERSONAL" },
      { name: "accounts/2", accountName: "Client Group", type: "LOCATION_GROUP" },
    ],
    locations: {
      "1": Array.from({ length: 6 }, (_, n) => ({ name: `locations/1${n}`, title: `Personal Business ${n}`, categories: { primaryCategory: { displayName: "Dentist" } } })),
      "2": Array.from({ length: 4 }, (_, n) => ({ name: `locations/2${n}`, title: `Group Business ${n}`, categories: { primaryCategory: { displayName: "Cafe" } } })),
    } as Record<string, object[]>,
    invitations: [] as object[],
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      fake.requests.push(url);
      if (url.includes("oauth2.googleapis.com/revoke")) {
        fake.revokedTokens.push(new URL(url).searchParams.get("token") ?? "");
        return json({});
      }
      if (url.includes("oauth2.googleapis.com/token")) {
        const body = new URLSearchParams(String(init?.body));
        if (body.get("client_secret") === "wrong") return json({ error: "invalid_client" }, 401);
        if (body.get("code") === "credential-check") return json({ error: "invalid_grant" }, 400);
        if (body.get("grant_type") === "refresh_token") {
          if (fake.revokedRefresh) return json({ error: "invalid_grant" }, 400);
          fake.refreshCount += 1;
          await new Promise((resolve) => setTimeout(resolve, 20));
          return json({ access_token: `access-${fake.refreshCount}`, expires_in: 3600 });
        }
        fake.verifiers.push(body.get("code_verifier") ?? "");
        const claims = {
          aud: body.get("client_id"),
          iss: "https://accounts.google.com",
          exp: Math.floor(Date.now() / 1000) + 3600,
          sub: options.subject ?? "subject-1",
          email: options.email ?? "baranikumargd2@gmail.com",
          email_verified: options.emailVerified ?? true,
          name: "Test User",
        };
        return json({
          access_token: "access-0",
          ...(options.noRefreshToken ? {} : { refresh_token: "refresh-1" }),
          expires_in: 3600,
          scope: (options.scopes ?? ["openid", "email", "profile", BUSINESS]).join(" "),
          id_token: `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`,
        });
      }
      if (options.quotaZero) return json({ error: { code: 429, status: "RESOURCE_EXHAUSTED", details: [{ reason: "RATE_LIMIT_EXCEEDED", metadata: { quota_limit_value: "0" } }] } }, 429);
      if (url.includes("/invitations")) return json({ invitations: fake.invitations });
      const locations = /accounts\/(\d+)\/locations\?/.exec(url);
      if (locations) {
        const all = fake.locations[locations[1]!] ?? [];
        const page = Number(new URL(url).searchParams.get("pageToken") ?? 0);
        const next = page + 3;
        return json({ locations: all.slice(page, next), ...(next < all.length ? { nextPageToken: String(next) } : {}) });
      }
      if (url.includes("/v1/accounts")) {
        const page = new URL(url).searchParams.get("pageToken");
        return page ? json({ accounts: [fake.accounts[1]] }) : json({ accounts: [fake.accounts[0]], nextPageToken: "more" });
      }
      return json({});
    }) as typeof fetch,
  };
  return fake;
}
