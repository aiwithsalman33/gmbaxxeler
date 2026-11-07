import { execSync } from "node:child_process";
import { TEST_DATABASE_URL } from "./env";

export default function setup(): void {
  execSync("npx prisma migrate deploy --schema packages/db/prisma/schema.prisma", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
}
