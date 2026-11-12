import { parseKey } from "@localpilot/crypto";
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
  // mock exists only for automated tests and local development; production always uses real.
  GBP_ADAPTER: z.enum(["mock", "real"]).default("real"),
  MOCK_SAMPLE_DATA: z.string().default("false").transform((value) => value === "true"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_MAX_QPM: z.coerce.number().int().min(1).default(240),
  AGENCY_GOOGLE_EMAIL: z.string().optional(),
  ENABLE_CLIENT_OAUTH_LINKS: z.string().default("false").transform((value) => value === "true"),
  AUTH_PASSWORD_ENABLED: z.string().default("true").transform((value) => value !== "false"),
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

/** Lists problems by variable name. Values never appear here, so this is safe to log. */
export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment:\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
    this.name = "EnvError";
  }
}

const REQUIREMENTS: Record<string, string> = {
  DATABASE_URL: "must be a full postgres URL. If POSTGRES_PASSWORD has characters like @ : / # ? use one made of letters and numbers",
  JWT_SECRET: "needs at least 32 characters. Generate one with: openssl rand -hex 32",
  ENCRYPTION_KEY: "must be 32 bytes. Generate one with: openssl rand -hex 32",
  APP_URL: "must be a full URL, such as https://gmb.axxeler.in",
  API_URL: "must be a full URL, such as https://gmb.axxeler.in/api",
  PUBLIC_MEDIA_URL: "must be a full URL, such as https://gmb.axxeler.in/media",
};

const DATABASE_URL_SHAPE = /^postgres(ql)?:\/\/[^:/@?#\s]+(:[^:/@?#\s]*)?@[^/@?#\s]+\/[^/?#\s]+/;

function validKey(value: string): boolean {
  try {
    parseKey(value);
    return true;
  } catch {
    return false;
  }
}

function productionProblems(env: Env): string[] {
  const problems: (string | false)[] = [
    env.JWT_SECRET === DEV_JWT_SECRET && "JWT_SECRET is the development default",
    env.ENCRYPTION_KEY === DEV_ENCRYPTION_KEY && "ENCRYPTION_KEY is the development default",
    !DATABASE_URL_SHAPE.test(env.DATABASE_URL) && `DATABASE_URL is invalid: ${REQUIREMENTS.DATABASE_URL}`,
  ];
  return problems.filter((problem) => typeof problem === "string");
}

/** Values production overrode, so startup can say so. Never secrets. */
export const productionOverrides: string[] = [];

/**
 * Production never simulates Google or AI. Older deploys were told to set
 * GBP_ADAPTER=mock and AI_ADAPTER=mock, so those values are replaced, not fatal.
 */
function forceRealInProduction(env: Env): Env {
  productionOverrides.length = 0;
  if (env.APP_ENV !== "production") return env;
  if (env.GBP_ADAPTER === "mock") productionOverrides.push("GBP_ADAPTER=mock is ignored in production; using real Google");
  if (env.AI_ADAPTER === "mock") productionOverrides.push("AI_ADAPTER=mock is ignored in production; using OpenAI");
  if (env.MOCK_SAMPLE_DATA) productionOverrides.push("MOCK_SAMPLE_DATA=true is ignored in production");
  return { ...env, GBP_ADAPTER: "real", AI_ADAPTER: "openai", MOCK_SAMPLE_DATA: false };
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  const problems: string[] = [];
  if (!parsed.success) {
    for (const name of new Set(parsed.error.issues.map((issue) => String(issue.path[0])))) {
      if (!source[name]) problems.push(`${name} is missing`);
      else problems.push(`${name} is invalid${REQUIREMENTS[name] ? `: ${REQUIREMENTS[name]}` : ""}`);
    }
  }
  if (source.ENCRYPTION_KEY && !validKey(source.ENCRYPTION_KEY)) problems.push(`ENCRYPTION_KEY is invalid: ${REQUIREMENTS.ENCRYPTION_KEY}`);
  if (parsed.success && parsed.data.APP_ENV === "production") problems.push(...productionProblems(parsed.data));
  if (problems.length) throw new EnvError([...new Set(problems)]);
  return forceRealInProduction(parsed.data as Env);
}

export function signupAllowed(env: Env, email: string): boolean {
  return env.SIGNUP_ALLOWED_EMAILS.split(",").some((allowed) => allowed.trim().toLowerCase() === email);
}
