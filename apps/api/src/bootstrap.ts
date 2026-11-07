import { parseKey } from "@localpilot/crypto";
import { createDb } from "@localpilot/db";
import { createGbpAdapter } from "@localpilot/gbp";
import { createMailProvider, Messenger } from "@localpilot/notify";
import type { Deps, Logger } from "@localpilot/services";
import { Storage } from "@localpilot/storage";
import type { Env } from "./config";
import type { AppContext } from "./context";
import { MailQueue } from "./mail-queue";

export function createContext(
  env: Env,
  logger: Logger,
  log: (message: string) => void,
  overrides: Partial<Pick<Deps, "mailProvider" | "enqueueMail">> = {},
): AppContext {
  const db = createDb(env.DATABASE_URL);
  const storage = new Storage({
    endpoint: env.MINIO_ENDPOINT,
    publicUrl: env.PUBLIC_MEDIA_URL,
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
    bucket: env.MINIO_BUCKET,
  });
  const messenger = new Messenger({
    mode: env.MAIL_PROVIDER === "dev" ? "dev" : "live",
    whatsappWebhookUrl: env.WHATSAPP_WEBHOOK_URL,
    smsWebhookUrl: env.SMS_WEBHOOK_URL,
    log,
  });
  const queue = overrides.enqueueMail ? null : new MailQueue(env.DATABASE_URL);
  return {
    env,
    db,
    jwtKey: new TextEncoder().encode(env.JWT_SECRET),
    stopQueue: async () => queue?.stop(),
    storage,
    deps: {
      db,
      logger,
      storage,
      aiAdapter: env.AI_ADAPTER,
      encryptionKey: parseKey(env.ENCRYPTION_KEY),
      gbp: createGbpAdapter({ adapter: env.GBP_ADAPTER, db, clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, mockSample: env.MOCK_SAMPLE_DATA }),
      messenger,
      mailProvider:
        overrides.mailProvider ??
        createMailProvider({
          provider: env.MAIL_PROVIDER,
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
          from: env.MAIL_FROM,
          log,
        }),
      enqueueMail: overrides.enqueueMail ?? ((job) => queue!.send(job)),
      mailDailyCap: env.MAIL_DAILY_CAP,
      appUrl: env.APP_URL,
    },
  };
}
