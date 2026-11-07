import { z } from "zod";

const DEV_JWT_SECRET = "dev-only-jwt-secret-change-me-0123456789";
const DEV_ENCRYPTION_KEY = "ZGV2LW9ubHktZW5jcnlwdGlvbi1rZXktMzItYnl0ZXM=";

const envSchema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(1),
  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  PUBLIC_MEDIA_URL: z.string().url(),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(2),
  SIGNUP_ALLOWED_EMAILS: z.string().default(""),
  SEED_ADMIN_EMAIL: z.string().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  GBP_ADAPTER: z.enum(["mock", "real"]).default("mock"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  MINIO_ENDPOINT: z.string().url(),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().default("localpilot"),
  MAIL_PROVIDER: z.enum(["smtp", "dev"]).default("dev"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_SECURE: z.string().default("true").transform((value) => value === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  MAIL_DAILY_CAP: z.coerce.number().int().min(1).default(300),
  WHATSAPP_WEBHOOK_URL: z.string().optional(),
  SMS_WEBHOOK_URL: z.string().optional(),
  AI_ADAPTER: z.enum(["mock", "openai"]).default("openai"),
  RATE_LIMIT_MAX: z.coerce.number().default(300),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().default(10),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const env = envSchema.parse(source);
  if (env.APP_ENV === "production") {
    const problems = [
      env.MAIL_PROVIDER === "dev" && "MAIL_PROVIDER cannot be dev",
      (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.MAIL_FROM) && "SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM are required",
      env.AI_ADAPTER === "mock" && "AI_ADAPTER cannot be mock",
      env.JWT_SECRET === DEV_JWT_SECRET && "JWT_SECRET is the development default",
      env.ENCRYPTION_KEY === DEV_ENCRYPTION_KEY && "ENCRYPTION_KEY is the development default",
    ].filter(Boolean);
    if (problems.length) throw new Error(`Unsafe production config: ${problems.join("; ")}`);
  }
  return env;
}

export function signupAllowed(env: Env, email: string): boolean {
  return env.SIGNUP_ALLOWED_EMAILS.split(",").some((allowed) => allowed.trim().toLowerCase() === email);
}
