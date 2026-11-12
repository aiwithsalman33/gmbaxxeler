import { parseKey } from "@localpilot/crypto";
import { createDb } from "@localpilot/db";
import { createGbpAdapter, sampleDataAllowed } from "@localpilot/gbp";
import { createMailProvider, Messenger } from "@localpilot/notify";
import { resolveCredentials, type Deps, type Logger } from "@localpilot/services";
import { Storage } from "@localpilot/storage";
import type { Env } from "./config";
import type { AppContext } from "./context";
import { MailQueue } from "./mail-queue";

export function createContext(
  env: Env,
  logger: Logger,
  log: (message: string) => void,
  overrides: Partial<Pick<Deps, "mailProvider" | "enqueueMail" | "enqueueConnect" | "googleHttp">> = {},
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
    mode: env.MAIL_PROVIDER === "dev" && env.APP_ENV !== "production" ? "dev" : "live",
    whatsappWebhookUrl: env.WHATSAPP_WEBHOOK_URL,
    smsWebhookUrl: env.SMS_WEBHOOK_URL,
    log,
  });
  const queue = overrides.enqueueMail ? null : new MailQueue(env.DATABASE_URL);
  const googleHttp = overrides.googleHttp ?? fetch;
  const agencyEmail = env.AGENCY_GOOGLE_EMAIL?.trim().toLowerCase() || null;
  const deps: Deps = {
      db,
      logger,
      storage,
      aiAdapter: env.AI_ADAPTER,
      encryptionKey: parseKey(env.ENCRYPTION_KEY),
      gbp: createGbpAdapter({
        adapter: env.GBP_ADAPTER,
        db,
        credentials: () => resolveCredentials(deps),
        fetch: googleHttp,
        maxQpm: env.GOOGLE_MAX_QPM,
        mockSample: sampleDataAllowed(env.MOCK_SAMPLE_DATA, env.APP_ENV),
        mockEmail: agencyEmail,
      }),
      messenger,
      mailProvider:
        overrides.mailProvider ??
        createMailProvider({
          provider: env.MAIL_PROVIDER,
          production: env.APP_ENV === "production",
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
      enqueueConnect: overrides.enqueueConnect ?? ((clientId) => queue!.sendConnect(clientId)),
      googleEnv: { clientId: env.GOOGLE_CLIENT_ID || undefined, clientSecret: env.GOOGLE_CLIENT_SECRET || undefined },
      googleHttp,
      agencyEmail,
      autoImport: env.AUTO_IMPORT_LOCATIONS,
  };
  return { env, db, jwtKey: new TextEncoder().encode(env.JWT_SECRET), stopQueue: async () => queue?.stop(), storage, deps };
}
