import { describe, expect, it } from "vitest";
import { createMailProvider, DevMailProvider, MailOffProvider, SmtpProvider } from "@localpilot/notify";
import { EnvError, loadEnv } from "../src/config";
import { failureLine } from "../src/startup";

const valid = {
  APP_ENV: "production",
  DATABASE_URL: "postgresql://localpilot:db-password-value@postgres:5432/localpilot",
  JWT_SECRET: "a".repeat(64),
  ENCRYPTION_KEY: "ab".repeat(32),
  APP_URL: "https://gmb.axxeler.in",
  API_URL: "https://gmb.axxeler.in/api",
  PUBLIC_MEDIA_URL: "https://gmb.axxeler.in/media",
  MINIO_ENDPOINT: "http://minio:9000",
  MINIO_ACCESS_KEY: "localpilot",
  MINIO_SECRET_KEY: "minio-secret-value",
  MAIL_PROVIDER: "smtp",
  SMTP_HOST: "smtp.gmail.com",
  SMTP_USER: "user@gmail.com",
  SMTP_PASS: "smtp-secret-value",
  MAIL_FROM: "x@gmail.com",
  AI_ADAPTER: "openai",
  GBP_ADAPTER: "real",
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "google-secret-value",
};

function problems(source: Record<string, string | undefined>): string[] {
  try {
    loadEnv(source);
    return [];
  } catch (error) {
    if (error instanceof EnvError) return error.problems;
    throw error;
  }
}

const minimal = {
  APP_ENV: "production",
  DATABASE_URL: valid.DATABASE_URL,
  JWT_SECRET: valid.JWT_SECRET,
  ENCRYPTION_KEY: valid.ENCRYPTION_KEY,
  APP_URL: valid.APP_URL,
  API_URL: valid.API_URL,
  PUBLIC_MEDIA_URL: valid.PUBLIC_MEDIA_URL,
  MINIO_ENDPOINT: valid.MINIO_ENDPOINT,
  MINIO_ACCESS_KEY: valid.MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY: valid.MINIO_SECRET_KEY,
};

describe("environment validation", () => {
  it("accepts a complete production setup", () => {
    expect(problems(valid)).toEqual([]);
  });

  it("lists every problem at once", () => {
    const found = problems({ ...valid, JWT_SECRET: undefined, ENCRYPTION_KEY: undefined, APP_URL: undefined, SMTP_PASS: undefined });
    expect(found.join("\n")).toContain("JWT_SECRET is missing");
    expect(found.join("\n")).toContain("ENCRYPTION_KEY is missing");
    expect(found.join("\n")).toContain("APP_URL is missing");
  });

  it("explains placeholder secrets and how to fix them", () => {
    const found = problems({ ...valid, JWT_SECRET: "change-me", ENCRYPTION_KEY: "change-me" }).join("\n");
    expect(found).toContain("JWT_SECRET is invalid");
    expect(found).toContain("ENCRYPTION_KEY is invalid");
    expect(found).toContain("openssl rand -hex 32");
  });

  it("never prints a value", () => {
    const secrets = { JWT_SECRET: "short-jwt-secret", ENCRYPTION_KEY: "not-a-real-key-value", APP_URL: "not-a-url-value", SMTP_PASS: "" };
    const found = problems({ ...valid, ...secrets }).join("\n");
    for (const value of ["short-jwt-secret", "not-a-real-key-value", "not-a-url-value", "db-password-value", "minio-secret-value"]) {
      expect(found).not.toContain(value);
    }
  });

  it("flags leftover placeholders in production", () => {
    const found = problems({ ...valid, MINIO_SECRET_KEY: "change-me", DATABASE_URL: "postgresql://u:change-me@postgres:5432/d" }).join("\n");
    expect(found).toContain("MINIO_SECRET_KEY is still the placeholder");
    expect(found).toContain("POSTGRES_PASSWORD is still the placeholder");
  });

  it("starts with no Google credentials", () => {
    expect(problems({ ...valid, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" })).toEqual([]);
  });

  it("allows mock mode in production, but not mock AI with real Google", () => {
    expect(problems({ ...valid, GBP_ADAPTER: "mock", AI_ADAPTER: "mock" })).toEqual([]);
    expect(problems({ ...valid, GBP_ADAPTER: "real", AI_ADAPTER: "mock" }).join("\n")).toContain("AI_ADAPTER cannot be mock");
  });

  it("starts in production with no SMTP, Google or OpenAI settings", () => {
    expect(problems(minimal)).toEqual([]);
    expect(problems({ ...minimal, MAIL_PROVIDER: "dev", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "", MAIL_FROM: "" })).toEqual([]);
  });

  it("explains a database password that breaks the URL, without printing it", () => {
    const found = problems({ ...minimal, DATABASE_URL: "postgresql://localpilot:pa/ss#word@postgres:5432/localpilot" }).join("\n");
    expect(found).toContain("DATABASE_URL is invalid");
    expect(found).toContain("POSTGRES_PASSWORD");
    expect(found).not.toContain("pa/ss#word");
  });
});

describe("mail settings", () => {
  const base = { port: 465, secure: true, log: () => undefined };
  const smtp = { host: "smtp.example.com", user: "u", pass: "smtp-secret-value", from: "x@example.com" };

  it("never prints mail in production, and names what's missing", async () => {
    const lines: string[] = [];
    const provider = createMailProvider({ ...base, provider: "dev", production: true, host: "smtp.example.com", pass: "smtp-secret-value", log: (line) => lines.push(line) });
    expect(provider).toBeInstanceOf(MailOffProvider);
    expect(lines.join()).toContain("SMTP_USER, MAIL_FROM");
    expect(lines.join()).not.toContain("smtp-secret-value");
    await expect(provider.send({ to: "a@example.com", subject: "s", text: "t", html: "h" })).rejects.toThrow("Email is off");
    expect(lines).toHaveLength(1);
  });

  it("uses SMTP once it's complete, and keeps dev mail in development", () => {
    expect(createMailProvider({ ...base, provider: "smtp", ...smtp })).toBeInstanceOf(SmtpProvider);
    expect(createMailProvider({ ...base, provider: "dev", production: true, ...smtp })).toBeInstanceOf(SmtpProvider);
    expect(createMailProvider({ ...base, provider: "dev" })).toBeInstanceOf(DevMailProvider);
    expect(createMailProvider({ ...base, provider: "smtp" }).offReason).toContain("SMTP_HOST");
  });
});

describe("startup failure line", () => {
  it("is one line that names the step and hides secrets", () => {
    const error = Object.assign(new Error("connect to postgresql://u:db-password-value@postgres:5432/d\nwith key s3cret-value failed"), { code: "E1" });
    const line = failureLine("storage", error, { JWT_SECRET: "s3cret-value" });
    expect(line).toMatch(/^STARTUP FAILED: storage: connect to postgresql:\/\/\[hidden\]@postgres/);
    expect(line).toContain("(E1)");
    expect(line).not.toContain("\n");
    expect(line).not.toContain("db-password-value");
    expect(line).not.toContain("s3cret-value");
  });
});
