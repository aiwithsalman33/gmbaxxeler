import { changePasswordSchema, emailOnlySchema, loginSchema, registerSchema, resetPasswordSchema, tokenSchema } from "@localpilot/contracts";
import { hashPassword, randomToken, sha256, verifyPassword } from "@localpilot/crypto";
import type { AuthTokenKind } from "@localpilot/db";
import { queueEmail } from "@localpilot/services";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { signupAllowed } from "../config";
import { ApiError, type AppContext } from "../context";
import { ACCESS_COOKIE, REFRESH_COOKIE, requireAuth } from "../guards";
import { cookieOptions, REFRESH_PATH, startSession } from "../session";

const VERIFY_TTL_MS = 24 * 3_600_000;
const RESET_TTL_MS = 3_600_000;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MS = 15 * 60_000;
const EMAIL_WINDOW_MS = 60_000;
const SAME_RESPONSE = { ok: true };

/** Sliding counter per address. One API process, so memory is enough. */
class EmailLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly max: number) {}

  allow(email: string, now = Date.now()): boolean {
    const entry = this.hits.get(email);
    if (!entry || entry.resetAt <= now) {
      if (this.hits.size > 10_000) this.hits.clear();
      this.hits.set(email, { count: 1, resetAt: now + EMAIL_WINDOW_MS });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.max;
  }
}

export function authRoutes(ctx: AppContext) {
  const { db, deps, env } = ctx;
  const emailLimiter = new EmailLimiter(env.LOGIN_RATE_LIMIT_MAX);
  const cookieBase = cookieOptions(ctx);
  const badLogin = () => new ApiError(401, "invalid_credentials", "Email or password is incorrect");
  const badToken = () => new ApiError(400, "invalid_token", "This link is invalid or has expired");
  // Checked for unknown addresses too, so response time doesn't reveal who has an account.
  const decoyHash = hashPassword(randomToken());

  /** Only the hash is stored. Older links of the same kind stop working. */
  async function issueToken(userId: string, kind: AuthTokenKind, ttlMs: number): Promise<string> {
    const token = randomToken();
    await db.authToken.updateMany({ where: { userId, kind, usedAt: null }, data: { usedAt: new Date() } });
    await db.authToken.create({ data: { userId, kind, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) } });
    return token;
  }

  /** Atomic, so one link can't be used twice even by parallel requests. */
  async function consumeToken(token: string, kind: AuthTokenKind): Promise<string> {
    const tokenHash = sha256(token);
    const { count } = await db.authToken.updateMany({ where: { tokenHash, kind, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (count === 0) throw badToken();
    return (await db.authToken.findUniqueOrThrow({ where: { tokenHash } })).userId;
  }

  async function sendVerification(user: { id: string; email: string }): Promise<void> {
    const token = await issueToken(user.id, "verify_email", VERIFY_TTL_MS);
    await queueEmail(deps, { template: "verify_email", to: user.email, transactional: true, data: { link: `${env.APP_URL}/verify-email?token=${token}` } });
  }

  return async (base: FastifyInstance) => {
    const app = base.withTypeProvider<ZodTypeProvider>();
    const limit = { rateLimit: { max: env.LOGIN_RATE_LIMIT_MAX, timeWindow: "1 minute" } };

    if (env.AUTH_PASSWORD_ENABLED) {
    app.post("/register", { schema: { body: registerSchema }, config: limit }, async (request) => {
      const { email, password, name } = request.body;
      const passwordHash = await hashPassword(password);
      if (!signupAllowed(env, email)) return SAME_RESPONSE;

      const existing = await db.user.findUnique({ where: { email } });
      if (existing) {
        if (!existing.emailVerifiedAt) await sendVerification(existing);
        return SAME_RESPONSE;
      }
      const user = await db.$transaction(async (tx) => {
        const created = await tx.user.create({ data: { email, passwordHash, name } });
        const workspace = await tx.workspace.create({ data: { name: "My Agency", ownerId: created.id } });
        await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: created.id, role: "owner" } });
        return created;
      });
      await sendVerification(user);
      return SAME_RESPONSE;
    });

    app.post("/login", { schema: { body: loginSchema }, config: limit }, async (request, reply) => {
      const { email, password } = request.body;
      if (!emailLimiter.allow(email)) throw new ApiError(429, "rate_limited", "Too many attempts. Please wait a minute.");

      const user = await db.user.findUnique({ where: { email } });
      const locked = Boolean(user?.lockedUntil && user.lockedUntil > new Date());
      const valid = await verifyPassword(user?.passwordHash ?? (await decoyHash), password);
      if (!user || !user.passwordHash || locked) throw badLogin();

      if (!valid) {
        const { failedLoginCount } = await db.user.update({ where: { id: user.id }, data: { failedLoginCount: { increment: 1 } } });
        if (failedLoginCount >= MAX_FAILED_LOGINS) {
          await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } });
        }
        throw badLogin();
      }
      // Reached only with the right password, so this reveals nothing to a stranger.
      if (!user.emailVerifiedAt) throw new ApiError(403, "email_not_verified", "Verify your email before logging in");

      await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
      await startSession(ctx, user.id, request, reply);
      return { ok: true };
    });

    app.post("/verify-email", { schema: { body: tokenSchema }, config: limit }, async (request) => {
      const userId = await consumeToken(request.body.token, "verify_email");
      await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
      return { ok: true };
    });

    app.post("/resend-verification", { schema: { body: emailOnlySchema }, config: limit }, async (request) => {
      const user = await db.user.findUnique({ where: { email: request.body.email } });
      if (user && !user.emailVerifiedAt) await sendVerification(user);
      return SAME_RESPONSE;
    });

    app.post("/forgot-password", { schema: { body: emailOnlySchema }, config: limit }, async (request) => {
      const user = await db.user.findUnique({ where: { email: request.body.email } });
      if (user) {
        const token = await issueToken(user.id, "reset_password", RESET_TTL_MS);
        await queueEmail(deps, { template: "reset_password", to: user.email, transactional: true, data: { link: `${env.APP_URL}/reset-password?token=${token}` } });
      }
      return SAME_RESPONSE;
    });

    app.post("/reset-password", { schema: { body: resetPasswordSchema }, config: limit }, async (request) => {
      const passwordHash = await hashPassword(request.body.password);
      const userId = await consumeToken(request.body.token, "reset_password");
      const now = new Date();
      const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
      // Receiving the reset link proves the address, which is how older accounts get verified.
      await db.user.update({
        where: { id: userId },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null, emailVerifiedAt: user.emailVerifiedAt ?? now },
      });
      await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
      return { ok: true };
    });

    app.post("/change-password", { schema: { body: changePasswordSchema }, config: limit, preHandler: requireAuth(ctx) }, async (request, reply) => {
      const user = await db.user.findUniqueOrThrow({ where: { id: request.auth.userId } });
      if (!user.passwordHash || !(await verifyPassword(user.passwordHash, request.body.currentPassword))) {
        throw new ApiError(400, "wrong_password", "Your current password is incorrect");
      }
      await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(request.body.newPassword) } });
      await db.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await startSession(ctx, user.id, request, reply);
      return { ok: true };
    });

    }

    app.post("/refresh", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
      const token = request.cookies[REFRESH_COOKIE];
      const session = token ? await db.session.findUnique({ where: { refreshTokenHash: sha256(token) } }) : null;
      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        throw new ApiError(401, "unauthenticated", "Please log in");
      }
      await db.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      await startSession(ctx, session.userId, request, reply);
      return { ok: true };
    });

    app.post("/logout", async (request, reply) => {
      const token = request.cookies[REFRESH_COOKIE];
      if (token) {
        await db.session.updateMany({ where: { refreshTokenHash: sha256(token) }, data: { revokedAt: new Date() } });
      }
      reply.clearCookie(ACCESS_COOKIE, { ...cookieBase, path: "/" }).clearCookie(REFRESH_COOKIE, { ...cookieBase, path: REFRESH_PATH });
      return { ok: true };
    });
  };
}
