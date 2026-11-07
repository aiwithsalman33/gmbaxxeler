import { EnvError, loadEnv } from "./config";
import { failureLine } from "./startup";

// Runs first in the container, so a bad setting is named before anything else starts.
try {
  loadEnv();
} catch (error) {
  const cause = error instanceof EnvError ? `${error.problems.join("; ")}. See "Troubleshooting deploy" in the README` : error;
  process.stderr.write(`${failureLine("environment variables", cause)}\n`);
  process.exit(1);
}
