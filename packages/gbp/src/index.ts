import type { Db } from "@localpilot/db";
import { MockGbpAdapter } from "./mock";
import { RealGbpAdapter } from "./real";
import type { GbpAdapter } from "./types";

export * from "./types";
export * from "./mock";
export * from "./real";

export function createGbpAdapter(config: { adapter: "mock" | "real"; db: Db; clientId?: string; clientSecret?: string }): GbpAdapter {
  if (config.adapter === "mock") return new MockGbpAdapter(config.db);
  if (!config.clientId || !config.clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required with GBP_ADAPTER=real");
  }
  return new RealGbpAdapter({ clientId: config.clientId, clientSecret: config.clientSecret });
}
