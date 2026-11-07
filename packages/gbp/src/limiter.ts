/** Spaces calls evenly, which keeps this process under Google's per-project quota. */
export class RateLimiter {
  private nextSlot = 0;
  private readonly spacingMs: number;

  constructor(
    perMinute: number,
    private readonly wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly now: () => number = Date.now,
  ) {
    this.spacingMs = 60_000 / perMinute;
  }

  async acquire(): Promise<void> {
    const now = this.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.spacingMs;
    if (slot > now) await this.wait(slot - now);
  }
}
