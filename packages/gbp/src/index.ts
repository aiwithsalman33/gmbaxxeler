import type { Db } from "@localpilot/db";
import { MockGbpAdapter } from "./mock";
import type { GoogleCredentials } from "./oauth";
import { RealGbpAdapter } from "./real";
import type { GbpAdapter } from "./types";

export * from "./types";
export * from "./limiter";
export * from "./mock";
export * from "./oauth";
export * from "./real";

export interface AdapterConfig {
  adapter: "mock" | "real";
  db: Db;
  credentials: () => Promise<GoogleCredentials | null>;
  fetch?: typeof fetch;
  maxQpm?: number;
  mockSample?: boolean;
  mockEmail?: string | null;
}

export function createGbpAdapter(config: AdapterConfig): GbpAdapter {
  if (config.adapter === "mock") return new MockGbpAdapter(config.db, config.mockSample, config.mockEmail);
  return new RealGbpAdapter({ credentials: config.credentials, fetch: config.fetch, maxQpm: config.maxQpm });
}
