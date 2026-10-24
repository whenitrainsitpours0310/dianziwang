export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  consume(key: string, now: number = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const current = (this.hits.get(key) ?? []).filter((time) => time > cutoff);
    if (current.length >= this.limit) {
      this.hits.set(key, current);
      return false;
    }
    current.push(now);
    this.hits.set(key, current);
    if (this.hits.size > 5_000) {
      for (const [entryKey, times] of this.hits) {
        if (times.every((time) => time <= cutoff)) this.hits.delete(entryKey);
      }
    }
    return true;
  }

  reset(): void {
    this.hits.clear();
  }
}
