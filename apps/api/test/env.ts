// 127.0.0.1, not localhost: on Windows, localhost can hang on a stale WSL relay and stall every query.
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://localpilot:localpilot@127.0.0.1:5432/localpilot_test";
