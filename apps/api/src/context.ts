import type { Db } from "@localpilot/db";
import type { Deps } from "@localpilot/services";
import type { Storage } from "@localpilot/storage";
import type { Env } from "./config";

export interface AppContext {
  env: Env;
  db: Db;
  deps: Deps;
  stopQueue: () => Promise<void>;
  storage: Storage;
  jwtKey: Uint8Array;
}

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
