import { writeFileSync } from "node:fs";
import { parseKey } from "@localpilot/crypto";
import { createDb } from "@localpilot/db";
import { createGbpAdapter, sampleDataAllowed } from "@localpilot/gbp";
import { createMailProvider, Messenger } from "@localpilot/notify";
import { checkConnections, deliverEmail, dispatchDueJobs, finishConnect, generateDueDrafts, materializeAll, MAIL_QUEUE, materializeAllSeo, pollAllWorkspaces, publishDueReplies, resolveCredentials, sendDueReminders, syncAllClients, syncAllReviews, type Deps, type MailJob } from "@localpilot/services";
import { Storage } from "@localpilot/storage";
import PgBoss from "pg-boss";
import pino from "pino";

const HEARTBEAT_FILE = "/tmp/worker-heartbeat";
const HEARTBEAT_MS = 30_000;
const MAIL_RETRIES = { retryLimit: 3, retryBackoff: true, retryDelay: 30 };
const CONNECT_QUEUE = "connect-client";

const JOBS = {
  "poll-invitations": { cron: "*/10 * * * *", run: (deps: Deps) => pollAllWorkspaces(deps) },
  "send-client-reminders": { cron: "0 * * * *", run: (deps: Deps) => sendDueReminders(deps) },
  "sync-metrics": { cron: "0 2 * * *", run: (deps: Deps) => syncAllClients(deps) },
  "materialize-jobs": { cron: "5 * * * *", run: async (deps: Deps) => [await materializeAll(deps), await materializeAllSeo(deps)] },
  "generate-posts": { cron: "*/5 * * * *", run: (deps: Deps) => generateDueDrafts(deps) },
  "sync-reviews": { cron: "*/15 * * * *", run: (deps: Deps) => syncAllReviews(deps) },
  "publish-replies": { cron: "* * * * *", run: (deps: Deps) => publishDueReplies(deps) },
  "publish-due-jobs": { cron: "* * * * *", run: (deps: Deps) => dispatchDueJobs(deps) },
  "check-connections": { cron: "*/15 * * * *", run: (deps: Deps) => checkConnections(deps) },
} as const;

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const logger = pino({ redact: ["refreshToken", "accessToken", "token"] });
const databaseUrl = required("DATABASE_URL");
const db = createDb(databaseUrl);
const log = (message: string) => logger.info(message);
const boss = new PgBoss({ connectionString: databaseUrl, schema: "pgboss" });
const mailProvider = process.env.MAIL_PROVIDER === "smtp" ? "smtp" : "dev";
const production = process.env.APP_ENV === "production";

const agencyEmail = process.env.AGENCY_GOOGLE_EMAIL?.trim().toLowerCase() || null;

const deps: Deps = {
  db,
  logger,
  encryptionKey: parseKey(required("ENCRYPTION_KEY")),
  aiAdapter: process.env.AI_ADAPTER === "mock" ? "mock" : "openai",
  storage: new Storage({
    endpoint: required("MINIO_ENDPOINT"),
    publicUrl: required("PUBLIC_MEDIA_URL"),
    accessKey: required("MINIO_ACCESS_KEY"),
    secretKey: required("MINIO_SECRET_KEY"),
    bucket: required("MINIO_BUCKET"),
  }),
  gbp: createGbpAdapter({
    adapter: process.env.GBP_ADAPTER === "real" ? "real" : "mock",
    db,
    credentials: () => resolveCredentials(deps),
    maxQpm: Number(process.env.GOOGLE_MAX_QPM ?? 240),
    mockSample: sampleDataAllowed(process.env.MOCK_SAMPLE_DATA === "true", process.env.APP_ENV),
    mockEmail: agencyEmail,
  }),
  messenger: new Messenger({
    mode: mailProvider === "dev" && !production ? "dev" : "live",
    whatsappWebhookUrl: process.env.WHATSAPP_WEBHOOK_URL,
    smsWebhookUrl: process.env.SMS_WEBHOOK_URL,
    log,
  }),
  mailProvider: createMailProvider({
    provider: mailProvider,
    production,
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: process.env.SMTP_SECURE !== "false",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM,
    log,
  }),
  enqueueMail: async (job) => {
    await boss.send(MAIL_QUEUE, job, MAIL_RETRIES);
  },
  mailDailyCap: Number(process.env.MAIL_DAILY_CAP ?? 300),
  appUrl: required("APP_URL"),
  enqueueConnect: async (clientId) => {
    await boss.send(CONNECT_QUEUE, { clientId }, MAIL_RETRIES);
  },
  googleEnv: { clientId: process.env.GOOGLE_CLIENT_ID || undefined, clientSecret: process.env.GOOGLE_CLIENT_SECRET || undefined },
  googleHttp: fetch,
  agencyEmail,
};

boss.on("error", (error) => logger.error({ err: error.message }, "pg-boss error"));
await boss.start();

for (const [name, job] of Object.entries(JOBS)) {
  await boss.createQueue(name, { name, retryLimit: 3, retryBackoff: true, retryDelay: 30 });
  await boss.schedule(name, job.cron);
  await boss.work(name, async () => {
    const started = Date.now();
    await job.run(deps);
    logger.info({ job: name, ms: Date.now() - started }, "job finished");
  });
}

await boss.createQueue(MAIL_QUEUE, { name: MAIL_QUEUE, ...MAIL_RETRIES });
await boss.work<MailJob>(MAIL_QUEUE, async ([job]) => {
  if (job) await deliverEmail(deps, job.data);
});

await boss.createQueue(CONNECT_QUEUE, { name: CONNECT_QUEUE, ...MAIL_RETRIES });
await boss.work<{ clientId: string }>(CONNECT_QUEUE, async ([job]) => {
  if (job) await finishConnect(deps, job.data.clientId);
});

const beat = () => writeFileSync(HEARTBEAT_FILE, String(Date.now()));
beat();
const heartbeat = setInterval(beat, HEARTBEAT_MS);
logger.info({ jobs: Object.keys(JOBS) }, "worker started");

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, async () => {
    clearInterval(heartbeat);
    await boss.stop({ graceful: true });
    await db.$disconnect();
    process.exit(0);
  });
}
