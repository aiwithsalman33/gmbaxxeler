import { removeMockData } from "@localpilot/services";
import { buildApp } from "./app";
import { createContext } from "./bootstrap";
import { loadEnv, productionOverrides } from "./config";
import { seedAdmin } from "./seed";
import { failureLine, failureText, startupLog } from "./startup";

const fallbackLog = (level: string) => (meta: object, message?: string) => {
  process.stdout.write(`${JSON.stringify({ level, msg: message, ...meta })}\n`);
};

let step = "services";

async function start() {
  const env = loadEnv();
  const ctx = createContext(
    env,
    { info: fallbackLog("info"), warn: fallbackLog("warn"), error: fallbackLog("error") },
    (message) => process.stdout.write(`${message}\n`),
  );

  step = "storage (check that minio is running and that MINIO_ACCESS_KEY and MINIO_SECRET_KEY match what it first started with)";
  startupLog("3/5 Preparing storage");
  await ctx.storage.ensureBucket();

  startupLog("4/5 Creating the first owner account");
  // A failed seed only affects that account, so the app still starts.
  await seedAdmin(ctx).then(startupLog, (error: unknown) => startupLog(`Owner account skipped: ${failureText(error)}`));

  for (const override of productionOverrides) startupLog(override);
  if (ctx.deps.gbp.name === "real") {
    // Nothing simulated may survive the switch to real Google, including rows from earlier mock deploys.
    await removeMockData(ctx.deps).then(
      (r) =>
        startupLog(
          r.clients || r.connections || r.clientsReset || r.simulatedJobs || r.mockPosts || r.mockLocations
            ? `Removed mock data: ${r.clients} demo clients, ${r.connections} fake Google connections, ${r.clientsReset} clients set back to waiting, ${r.simulatedJobs} simulated jobs, ${r.mockPosts} mock drafts`
            : "No mock data found",
        ),
      (error: unknown) => startupLog(`Mock data cleanup skipped: ${failureText(error)}`),
    );
  }

  step = `API server on port ${env.PORT}`;
  startupLog(`5/5 Starting the API on 0.0.0.0:${env.PORT}`);
  const app = await buildApp(ctx);
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  startupLog("Ready");

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, async () => {
      await app.close();
      await ctx.stopQueue();
      await ctx.db.$disconnect();
      process.exit(0);
    });
  }
}

try {
  await start();
} catch (error) {
  process.stderr.write(`${failureLine(step, error)}\n`);
  process.exit(1);
}
