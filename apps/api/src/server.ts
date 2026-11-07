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

await ctx.storage.ensureBucket();
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
