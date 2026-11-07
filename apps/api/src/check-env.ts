import { EnvError, loadEnv } from "./config";

// Runs first in the container, so a bad setting is named before anything else starts.
try {
  loadEnv();
} catch (error) {
  if (!(error instanceof EnvError)) throw error;
  process.stderr.write(`\nLocalPilot can't start. Fix these environment variables:\n`);
  for (const problem of error.problems) process.stderr.write(`  - ${problem}\n`);
  process.stderr.write(`\nSee "Troubleshooting deploy" in the README.\n\n`);
  process.exit(1);
}
