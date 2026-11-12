import { deflateSync } from "node:zlib";
import { randomBytes } from "node:crypto";
import type { MailMessage, MailProvider } from "@localpilot/notify";
import { deliverEmail, finishConnect } from "@localpilot/services";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { createContext } from "../src/bootstrap";
import { loadEnv } from "../src/config";
import type { AppContext } from "../src/context";
import { TEST_DATABASE_URL } from "./env";
import { startFakeS3 } from "./fake-s3";

export const ALLOWED_EMAIL = "owner@example.com";
export const OTHER_EMAIL = "second@example.com";
export const PASSWORD = "correct-horse-battery";

export interface Harness {
  app: FastifyInstance;
  ctx: AppContext;
  mail: MailMessage[];
  mailFailures: { count: number };
}

export async function createHarness(overrides: Record<string, string> = {}, options: { googleHttp?: typeof fetch } = {}): Promise<Harness> {
  // Set TEST_S3_URL to run against a real server, such as the one in docker-compose.yml.
  const realS3 = process.env.TEST_S3_URL;
  const s3 = realS3 ? { url: realS3, server: null } : await startFakeS3();
  const env = loadEnv({
    APP_ENV: "test",
    DATABASE_URL: TEST_DATABASE_URL,
    JWT_SECRET: "test-secret-test-secret-test-secret-0000",
    ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    APP_URL: "http://localhost:8080",
    API_URL: "http://localhost:4000/api",
    PUBLIC_MEDIA_URL: `${s3.url}/localpilot-test`,
    SIGNUP_ALLOWED_EMAILS: `${ALLOWED_EMAIL}, ${OTHER_EMAIL.toUpperCase()}`,
    MAIL_PROVIDER: "dev",
    MINIO_ENDPOINT: s3.url,
    MINIO_ACCESS_KEY: process.env.TEST_S3_ACCESS_KEY ?? "localpilot",
    MINIO_SECRET_KEY: process.env.TEST_S3_SECRET_KEY ?? "localpilot-dev-secret",
    MINIO_BUCKET: "localpilot-test",
    // The tests stand in for Google with the mock adapter; the app itself defaults to real.
    GBP_ADAPTER: "mock",
    AI_ADAPTER: "mock",
    MOCK_SAMPLE_DATA: "true",
    ENABLE_CLIENT_OAUTH_LINKS: "true",
    RATE_LIMIT_MAX: "100000",
    LOGIN_RATE_LIMIT_MAX: "100000",
    ...overrides,
  });
  const mail: MailMessage[] = [];
  const mailFailures = { count: 0 };
  const mailProvider: MailProvider = {
    async send(message) {
      if (mailFailures.count > 0) {
        mailFailures.count -= 1;
        throw new Error("SMTP down");
      }
      mail.push(message);
    },
  };
  const silent = () => undefined;
  const ctx: AppContext = createContext(env, { info: silent, warn: silent, error: silent }, silent, {
    mailProvider,
    // Delivers at once, standing in for the worker.
    enqueueMail: (job) => deliverEmail(ctx.deps, job).catch(() => undefined),
    enqueueConnect: (clientId) => finishConnect(ctx.deps, clientId),
    ...options,
  });
  await ctx.storage.ensureBucket();
  const app = await buildApp(ctx);
  app.addHook("onClose", async () => {
    s3.server?.close();
  });
  return { app, ctx, mail, mailFailures };
}

export async function resetDb({ ctx }: Harness): Promise<void> {
  await ctx.db.$executeRawUnsafe(
    `TRUNCATE users, sessions, workspaces, mock_gbp_state, email_log, oauth_states CASCADE`,
  );
}

export type Cookies = Record<string, string>;

export function cookiesFrom(response: { cookies: { name: string; value: string }[] }): Cookies {
  return Object.fromEntries(response.cookies.map((c) => [c.name, c.value]));
}

/** Pulls the token from the newest email linking to this page. */
export function linkToken({ mail }: Harness, page: string): string {
  const pattern = new RegExp(`/${page}(?:\\?token=|/)([\\w-]+)`);
  for (const message of [...mail].reverse()) {
    const found = pattern.exec(message.text);
    if (found) return found[1]!;
  }
  throw new Error(`No email links to ${page}`);
}

/** Registers and verifies on first use, then logs in. */
export async function login(harness: Harness, email = ALLOWED_EMAIL): Promise<Cookies> {
  const { app } = harness;
  const attempt = () => app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email, password: PASSWORD } });
  const first = await attempt();
  if (first.statusCode === 200) return cookiesFrom(first);
  await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { email, password: PASSWORD } });
  await app.inject({ method: "POST", url: "/api/v1/auth/verify-email", payload: { token: linkToken(harness, "verify-email") } });
  return cookiesFrom(await attempt());
}

export async function connectGoogle({ app }: Harness, cookies: Cookies): Promise<void> {
  const start = await app.inject({ method: "GET", url: "/api/v1/google/oauth/start", cookies });
  const location = new URL(String(start.headers.location));
  await app.inject({ method: "GET", url: location.pathname + location.search });
}

function crc32(buffer: Buffer): number {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ~crc >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A valid noise PNG, which stays above 10 KB because noise doesn't compress. */
export function makePng(width = 300, height = 300): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const rows = Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), randomBytes(width * 3)]));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function multipart(files: { name: string; data: Buffer }[]): { payload: Buffer; headers: Record<string, string> } {
  const boundary = "----localpilot-test";
  const parts = files.flatMap(({ name, data }) => [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${name}"\r\nContent-Type: image/png\r\n\r\n`),
    data,
    Buffer.from("\r\n"),
  ]);
  return {
    payload: Buffer.concat([...parts, Buffer.from(`--${boundary}--\r\n`)]),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}
