export const CAPACITY = 60;
export const WINDOW_MS = 300_000;

interface Bucket {
  tokens: number;
  updated: number;
}

const buckets = new Map<number, Bucket>();

/** Take one token. Returns false when the caller is over budget. */
export function consume(key: number, now: number = Date.now()): boolean {
  const bucket = buckets.get(key) ?? { tokens: CAPACITY, updated: now };

  const refill = ((now - bucket.updated) / WINDOW_MS) * CAPACITY;
  bucket.tokens = Math.min(CAPACITY, bucket.tokens + refill);
  bucket.updated = now;

  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return false;
  }

  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return true;
}

/** Test-only. */
export function __reset(): void {
  buckets.clear();
}
