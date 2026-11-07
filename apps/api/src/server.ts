import { buildApp } from "./app";
import { createContext } from "./bootstrap";
import { loadEnv } from "./config";
import { seedAdmin } from "./seed";

const env = loadEnv();
const fallbackLog = (level: string) => (meta: object, message?: string) => {
  process.stdout.write(`${JSON.stringify({ level, msg: message, ...meta })}\n`);
};
const ctx = createContext(
  env,
  { info: fallbackLog("info"), warn: fallbackLog("warn"), error: fallbackLog("error") },
  (message) => process.stdout.write(`${message}\n`),
);

try {
  await ctx.storage.ensureBucket();
} catch {
  process.stderr.write("Can't reach storage. Check that minio is running and MINIO_ACCESS_KEY and MINIO_SECRET_KEY match what it first started with.\n");
  process.exit(1);
}
await seedAdmin(ctx);
const app = await buildApp(ctx);
await app.listen({ port: env.PORT, host: "0.0.0.0" });

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, async () => {
    await app.close();
    await ctx.stopQueue();
    await ctx.db.$disconnect();
    process.exit(0);
  });
}
