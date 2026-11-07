import { describe, expect, it } from "vitest";
import { EnvError, loadEnv } from "../src/config";

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
    const secrets = { JWT_SECRET: "short-jwt-secret", ENCRYPTION_KEY: "not-a-real-key-value", APP_URL: "not-a-url-value", SMTP_PASS: "", GOOGLE_CLIENT_ID: "" };
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

  it("needs Google credentials with the real adapter, in any environment", () => {
    expect(problems({ ...valid, APP_ENV: "development", GOOGLE_CLIENT_ID: "" }).join("\n")).toContain("GOOGLE_CLIENT_ID is missing");
  });

  it("names a missing SMTP password", () => {
    expect(problems({ ...valid, SMTP_PASS: "" })).toContain("SMTP_PASS is missing");
  });
});
