export const MAX_RETRIES = 3;

/** 1, 5, then 25 minutes. */
export function retryDelayMs(failures: number): number {
  return 60_000 * 5 ** (failures - 1);
}
