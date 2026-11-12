/**
 * Removes everything mock mode created: demo businesses, fake Google connections, simulated
 * posts and photos, mock AI drafts, and invented reviews and metrics. The API does this on every
 * start with the real Google adapter; this script is for running it by hand:
 *   docker compose exec api node apps/api/dist/remove-demo-data.js
 */
import { removeMockData } from "@localpilot/services";
import { createContext } from "./bootstrap";
import { loadEnv } from "./config";
import { failureText } from "./startup";

const log = (meta: object, message?: string) => process.stdout.write(`${JSON.stringify({ msg: message, ...meta })}\n`);
const ctx = createContext(loadEnv(), { info: log, warn: log, error: log }, () => undefined);

try {
  if (ctx.deps.gbp.name !== "real") throw new Error("GBP_ADAPTER is mock. Set GBP_ADAPTER=real first, or this removes the data mock mode is using.");
  const r = await removeMockData(ctx.deps);
  process.stdout.write(
    `Removed ${r.clients} demo clients, ${r.images} images, ${r.connections} fake Google connections, ${r.simulatedJobs} simulated jobs and ${r.mockPosts} mock drafts; ${r.clientsReset} clients set back to waiting\n`,
  );
} catch (error) {
  process.stderr.write(`Mock data cleanup failed: ${failureText(error)}\n`);
  process.exitCode = 1;
} finally {
  await ctx.stopQueue();
  await ctx.db.$disconnect();
}
