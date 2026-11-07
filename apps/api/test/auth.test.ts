import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ALLOWED_EMAIL, cookiesFrom, createHarness, linkToken, login, PASSWORD, resetDb, type Harness } from "./helpers";

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
beforeEach(async () => {
  await resetDb(h);
  h.mail.length = 0;
});
afterAll(async () => {
  await h.app.close();
  await h.ctx.db.$disconnect();
  vi.useRealTimers();
});

const post = (path: string, payload?: object, cookies?: Record<string, string>) =>
  h.app.inject({ method: "POST", url: `/api/v1/auth${path}`, ...(payload ? { payload } : {}), ...(cookies ? { cookies } : {}) });
const register = (email = ALLOWED_EMAIL, password = PASSWORD) => post("/register", { email, password });
const lastToken = (path: string) => linkToken(h, path);
const verified = async () => {
  await register();
  await post("/verify-email", { token: lastToken("verify-email") });
};
const signIn = (password = PASSWORD, email = ALLOWED_EMAIL) => post("/login", { email, password });

describe("registration", () => {
  it("creates an owner and a workspace, stores only a hash, and sends a verification email", async () => {
    expect((await register()).statusCode).toBe(200);
    const user = await h.ctx.db.user.findFirstOrThrow();
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await h.ctx.db.workspaceMember.findFirst()).toMatchObject({ role: "owner" });
    expect(h.mail[0]).toMatchObject({ to: ALLOWED_EMAIL });
    expect(h.mail[0]!.subject).toContain("Verify");
  });

  it("answers identically for an address that isn't allowed, and creates nothing", async () => {
    const allowed = await register();
    const stranger = await register("stranger@example.com");
    expect(stranger.statusCode).toBe(allowed.statusCode);
    expect(stranger.body).toBe(allowed.body);
    expect(await h.ctx.db.user.count()).toBe(1);
  });

  it("answers identically when the address is already registered", async () => {
    const first = await register();
    await post("/verify-email", { token: lastToken("verify-email") });
    expect((await register()).body).toBe(first.body);
    expect(await h.ctx.db.user.count()).toBe(1);
  });

  it("gives each allowlisted person their own workspace", async () => {
    await register();
    await register("second@example.com");
    expect(await h.ctx.db.workspace.count()).toBe(2);
  });

  it("enforces a 10 character password", async () => {
    expect((await register(ALLOWED_EMAIL, "short")).statusCode).toBe(400);
    expect((await register(ALLOWED_EMAIL, "123456789")).statusCode).toBe(400);
    expect((await register(ALLOWED_EMAIL, "1234567890")).statusCode).toBe(200);
  });

  it("treats email addresses as case-insensitive", async () => {
    await verified();
    expect((await signIn(PASSWORD, "OWNER@Example.com")).statusCode).toBe(200);
  });
});

describe("email verification", () => {
  it("blocks login until verified, then allows it", async () => {
    await register();
    const blocked = await signIn();
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe("email_not_verified");
    expect(blocked.cookies).toHaveLength(0);

    await post("/verify-email", { token: lastToken("verify-email") });
    expect((await signIn()).statusCode).toBe(200);
  });

  it("stores only a hash of the token", async () => {
    await register();
    const token = lastToken("verify-email");
    const stored = await h.ctx.db.authToken.findFirstOrThrow();
    expect(stored.tokenHash).not.toBe(token);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("works once only", async () => {
    await register();
    const token = lastToken("verify-email");
    expect((await post("/verify-email", { token })).statusCode).toBe(200);
    expect((await post("/verify-email", { token })).statusCode).toBe(400);
  });

  it("expires after 24 hours", async () => {
    await register();
    const stored = await h.ctx.db.authToken.findFirstOrThrow();
    const hours = (stored.expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
    await h.ctx.db.authToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await post("/verify-email", { token: lastToken("verify-email") })).statusCode).toBe(400);
  });

  it("resends with a new link and kills the old one", async () => {
    await register();
    const first = lastToken("verify-email");
    expect((await post("/resend-verification", { email: ALLOWED_EMAIL })).statusCode).toBe(200);
    const second = lastToken("verify-email");
    expect(second).not.toBe(first);
    expect((await post("/verify-email", { token: first })).statusCode).toBe(400);
    expect((await post("/verify-email", { token: second })).statusCode).toBe(200);
  });

  it("answers identically when resending for an unknown address", async () => {
    await register();
    const known = await post("/resend-verification", { email: ALLOWED_EMAIL });
    const unknown = await post("/resend-verification", { email: "nobody@example.com" });
    expect(unknown.body).toBe(known.body);
  });
});

describe("login", () => {
  it("sets httpOnly, SameSite=Lax cookies", async () => {
    await verified();
    const response = await signIn();
    expect(response.cookies.every((c) => c.httpOnly && c.sameSite === "Lax")).toBe(true);
  });

  it("marks cookies Secure in production", async () => {
    const prod = await createHarness({ APP_ENV: "production", AI_ADAPTER: "openai", GBP_ADAPTER: "real", GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret", MAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.example.com", SMTP_USER: "u", SMTP_PASS: "p", MAIL_FROM: "x@example.com", SEED_ADMIN_EMAIL: "", SEED_ADMIN_PASSWORD: "" });
    const email = ALLOWED_EMAIL;
    const { hashPassword } = await import("@localpilot/crypto");
    const user = await h.ctx.db.user.create({ data: { email, passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date() } });
    const workspace = await h.ctx.db.workspace.create({ data: { name: "W", ownerId: user.id } });
    await h.ctx.db.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "owner" } });
    const response = await prod.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email, password: PASSWORD } });
    expect(response.cookies.every((c) => c.secure)).toBe(true);
    await prod.app.close();
    await prod.ctx.db.$disconnect();
  });

  it("uses one message for a wrong password and an unknown address", async () => {
    await verified();
    const wrong = await signIn("wrong-password-1");
    const unknown = await signIn(PASSWORD, "nobody@example.com");
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(unknown.body).toBe(wrong.body);
  });

  it("locks the account for 15 minutes after 5 wrong passwords", async () => {
    await verified();
    for (let i = 0; i < 5; i++) expect((await signIn("wrong-password-1")).statusCode).toBe(401);

    const user = await h.ctx.db.user.findFirstOrThrow();
    const minutes = (user.lockedUntil!.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14.9);
    expect(minutes).toBeLessThanOrEqual(15);

    const locked = await signIn();
    expect(locked.statusCode).toBe(401);
    expect(locked.cookies).toHaveLength(0);
    expect(locked.body).toBe((await signIn(PASSWORD, "nobody@example.com")).body);
  });

  it("unlocks after the 15 minutes pass", async () => {
    await verified();
    for (let i = 0; i < 5; i++) await signIn("wrong-password-1");
    await h.ctx.db.user.updateMany({ data: { lockedUntil: new Date(Date.now() - 1000) } });
    expect((await signIn()).statusCode).toBe(200);
  });

  it("resets the count after a successful login", async () => {
    await verified();
    for (let i = 0; i < 4; i++) await signIn("wrong-password-1");
    expect((await signIn()).statusCode).toBe(200);
    for (let i = 0; i < 4; i++) await signIn("wrong-password-1");
    expect((await signIn()).statusCode).toBe(200);
  });

  it("rate limits by IP and by email", async () => {
    const limited = await createHarness({ LOGIN_RATE_LIMIT_MAX: "3" });
    const attempt = (email: string) => limited.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email, password: PASSWORD } });
    expect((await attempt("a@example.com")).statusCode).toBe(401);
    expect((await attempt("a@example.com")).statusCode).toBe(401);
    expect((await attempt("a@example.com")).statusCode).toBe(401);
    expect((await attempt("a@example.com")).statusCode).toBe(429);
    await limited.app.close();
    await limited.ctx.db.$disconnect();
  });
});

describe("real client IPs behind the proxies", () => {
  it("can't be dodged by faking X-Forwarded-For", async () => {
    const limited = await createHarness({ LOGIN_RATE_LIMIT_MAX: "2", TRUST_PROXY_HOPS: "2" });
    const attempt = (fake: string, email: string) =>
      limited.app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        remoteAddress: "172.18.0.5",
        headers: { "x-forwarded-for": `${fake}, 203.0.113.9, 172.18.0.2` },
        payload: { email, password: PASSWORD },
      });
    expect((await attempt("1.1.1.1", "a@example.com")).statusCode).toBe(401);
    expect((await attempt("2.2.2.2", "b@example.com")).statusCode).toBe(401);
    expect((await attempt("3.3.3.3", "c@example.com")).statusCode).toBe(429);
    await limited.app.close();
    await limited.ctx.db.$disconnect();
  });
});

describe("password reset", () => {
  it("always gives the same response", async () => {
    await verified();
    const known = await post("/forgot-password", { email: ALLOWED_EMAIL });
    const unknown = await post("/forgot-password", { email: "nobody@example.com" });
    expect(unknown.statusCode).toBe(known.statusCode);
    expect(unknown.body).toBe(known.body);
  });

  it("changes the password, ends sessions, and works once", async () => {
    await verified();
    const session = cookiesFrom(await signIn());
    await post("/forgot-password", { email: ALLOWED_EMAIL });
    const token = lastToken("reset-password");
    expect((await post("/reset-password", { token, password: "a-brand-new-password" })).statusCode).toBe(200);

    expect((await signIn()).statusCode).toBe(401);
    expect((await signIn("a-brand-new-password")).statusCode).toBe(200);
    expect((await post("/refresh", undefined, { lp_refresh: session.lp_refresh! })).statusCode).toBe(401);
    expect((await post("/reset-password", { token, password: "another-new-password" })).statusCode).toBe(400);
  });

  it("expires after 1 hour", async () => {
    await verified();
    await post("/forgot-password", { email: ALLOWED_EMAIL });
    const stored = await h.ctx.db.authToken.findFirstOrThrow({ where: { kind: "reset_password" } });
    expect((stored.expiresAt.getTime() - Date.now()) / 3_600_000).toBeLessThanOrEqual(1);
    await h.ctx.db.authToken.updateMany({ where: { kind: "reset_password" }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await post("/reset-password", { token: lastToken("reset-password"), password: "a-brand-new-password" })).statusCode).toBe(400);
  });

  it("doesn't accept a verification link as a reset link", async () => {
    await register();
    expect((await post("/reset-password", { token: lastToken("verify-email"), password: "a-brand-new-password" })).statusCode).toBe(400);
  });

  it("lets an older account with no password set one, which also verifies it", async () => {
    const user = await h.ctx.db.user.create({ data: { email: "old@example.com" } });
    const workspace = await h.ctx.db.workspace.create({ data: { name: "W", ownerId: user.id } });
    await h.ctx.db.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "owner" } });
    expect((await signIn(PASSWORD, "old@example.com")).statusCode).toBe(401);
    await post("/forgot-password", { email: "old@example.com" });
    await post("/reset-password", { token: lastToken("reset-password"), password: PASSWORD });
    expect((await signIn(PASSWORD, "old@example.com")).statusCode).toBe(200);
  });

  it("clears a lockout", async () => {
    await verified();
    for (let i = 0; i < 5; i++) await signIn("wrong-password-1");
    await post("/forgot-password", { email: ALLOWED_EMAIL });
    await post("/reset-password", { token: lastToken("reset-password"), password: "a-brand-new-password" });
    expect((await signIn("a-brand-new-password")).statusCode).toBe(200);
  });
});

describe("change password", () => {
  it("needs the current password", async () => {
    const cookies = await login(h);
    const wrong = await post("/change-password", { currentPassword: "not-the-password", newPassword: "a-brand-new-password" }, cookies);
    expect(wrong.statusCode).toBe(400);
    const right = await post("/change-password", { currentPassword: PASSWORD, newPassword: "a-brand-new-password" }, cookies);
    expect(right.statusCode).toBe(200);
    expect((await signIn("a-brand-new-password")).statusCode).toBe(200);
  });

  it("needs a session", async () => {
    expect((await post("/change-password", { currentPassword: PASSWORD, newPassword: "a-brand-new-password" })).statusCode).toBe(401);
  });
});

describe("sessions", () => {
  it("returns the user from /me, with no password hash", async () => {
    const cookies = await login(h);
    const me = await h.app.inject({ method: "GET", url: "/api/v1/me", cookies });
    expect(me.json()).toMatchObject({ role: "owner", user: { email: ALLOWED_EMAIL } });
    expect(me.body).not.toContain("argon2");
  });

  it("rotates the refresh token and rejects the old one", async () => {
    const cookies = await login(h);
    const refresh = (lp_refresh: string) => post("/refresh", undefined, { lp_refresh });
    const first = await refresh(cookies.lp_refresh!);
    expect(first.statusCode).toBe(200);
    expect(cookiesFrom(first).lp_refresh).not.toBe(cookies.lp_refresh);
    expect((await refresh(cookies.lp_refresh!)).statusCode).toBe(401);
  });

  it("ends the session on logout", async () => {
    const cookies = await login(h);
    await post("/logout", undefined, cookies);
    expect((await post("/refresh", undefined, { lp_refresh: cookies.lp_refresh! })).statusCode).toBe(401);
  });

  it("rejects requests with no session", async () => {
    expect((await h.app.inject({ method: "GET", url: "/api/v1/clients" })).statusCode).toBe(401);
  });
});

describe("password switch", () => {
  it("turns password routes off, and keeps sessions working", async () => {
    const off = await createHarness({ AUTH_PASSWORD_ENABLED: "false" });
    expect((await off.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: ALLOWED_EMAIL, password: PASSWORD } })).statusCode).toBe(404);
    expect((await off.app.inject({ method: "POST", url: "/api/v1/auth/logout" })).statusCode).toBe(200);
    expect((await off.app.inject({ method: "GET", url: "/api/v1/auth/options" })).json().password).toBe(false);
    await off.app.close();
    await off.ctx.db.$disconnect();
  });
});

describe("mobile login", () => {
  it("no longer exists", async () => {
    expect((await post("/otp/request", { email: ALLOWED_EMAIL })).statusCode).toBe(404);
    expect((await post("/otp/verify", { email: ALLOWED_EMAIL, code: "123456" })).statusCode).toBe(404);
  });
});

describe("seed admin", () => {
  it("creates a verified owner once and never changes the password", async () => {
    const { seedAdmin } = await import("../src/seed");
    const seeded = await createHarness({ SEED_ADMIN_EMAIL: "Admin@Example.com", SEED_ADMIN_PASSWORD: "seed-password-123" });
    await seedAdmin(seeded.ctx);
    expect((await signIn("seed-password-123", "admin@example.com")).statusCode).toBe(200);

    const again = await createHarness({ SEED_ADMIN_EMAIL: "admin@example.com", SEED_ADMIN_PASSWORD: "different-password" });
    await seedAdmin(again.ctx);
    expect((await signIn("seed-password-123", "admin@example.com")).statusCode).toBe(200);
    for (const harness of [seeded, again]) {
      await harness.app.close();
      await harness.ctx.db.$disconnect();
    }
  });
});
