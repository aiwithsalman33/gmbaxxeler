import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BUSINESS_SCOPE, consentUrl, OAuthError, pkceChallenge, pkcePair, readIdToken, testCredentials } from "./oauth";

const token = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
const claims = { aud: "client", iss: "https://accounts.google.com", exp: 2_000_000_000, sub: "1", email: "A@Gmail.com", email_verified: true };
const reply = (body: object, status: number) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("PKCE", () => {
  it("makes an S256 challenge from a random verifier", () => {
    const { verifier, challenge } = pkcePair();
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(verifier).not.toBe(pkcePair().verifier);
    expect(pkceChallenge(verifier)).toBe(challenge);
  });
});

describe("consentUrl", () => {
  const base = { clientId: "c", redirectUri: "https://x/cb", state: "s", codeChallenge: "ch" };

  it("asks for offline access with consent for the agency account", () => {
    const url = new URL(consentUrl({ ...base, scopes: ["openid", BUSINESS_SCOPE], offline: true, loginHint: "agency@gmail.com" }));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent select_account");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("login_hint")).toBe("agency@gmail.com");
  });

  it("asks for identity only at login", () => {
    const url = new URL(consentUrl({ ...base, scopes: ["openid", "email", "profile"], offline: false }));
    expect(url.searchParams.get("access_type")).toBeNull();
    expect(url.searchParams.get("scope")).not.toContain("business.manage");
  });
});

describe("readIdToken", () => {
  it("reads the identity and lowercases the email", () => {
    expect(readIdToken(token(claims), "client", 1_000_000_000_000)).toMatchObject({ subject: "1", email: "a@gmail.com", emailVerified: true });
  });

  it.each([
    ["wrong audience", { ...claims, aud: "other" }],
    ["wrong issuer", { ...claims, iss: "https://evil.example" }],
    ["expired", { ...claims, exp: 1 }],
    ["no email", { ...claims, email: undefined }],
  ])("rejects %s", (_name, bad) => {
    expect(() => readIdToken(token(bad), "client", 1_000_000_000_000)).toThrow(OAuthError);
  });
});

describe("testCredentials", () => {
  const credentials = { clientId: "c", clientSecret: "s" };

  it("treats a rejected code as proof the client is valid", async () => {
    expect(await testCredentials(reply({ error: "invalid_grant" }, 400), credentials, "https://x")).toBe("valid");
  });

  it("reports a bad client", async () => {
    expect(await testCredentials(reply({ error: "invalid_client" }, 401), credentials, "https://x")).toBe("invalid");
  });
});
