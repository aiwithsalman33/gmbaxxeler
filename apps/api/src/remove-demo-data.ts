/**
 * Deletes the built-in demo businesses from every workspace, with all their rows and files.
 * Production does this on every start; this script is for running it by hand:
 *   docker compose exec api node apps/api/dist/remove-demo-data.js
 */
import { removeAllDemoData } from "@localpilot/services";
import { createContext } from "./bootstrap";
import { loadEnv } from "./config";
import { failureText } from "./startup";

const log = (meta: object, message?: string) => process.stdout.write(`${JSON.stringify({ msg: message, ...meta })}\n`);
const ctx = createContext(loadEnv(), { info: log, warn: log, error: log }, () => undefined);

try {
  const result = await removeAllDemoData(ctx.deps);
  process.stdout.write(`Removed ${result.clients} demo clients, ${result.images} images and ${result.mockLocations} mock locations\n`);
} catch (error) {
  process.stderr.write(`Demo data cleanup failed: ${failureText(error)}\n`);
  process.exitCode = 1;
} finally {
  await ctx.stopQueue();
  await ctx.db.$disconnect();
}
