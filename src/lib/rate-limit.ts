/**
 * Sliding-window limiter, in memory. Fine for one server process; behind several instances or
 * serverless functions each one counts separately, so use a shared store (e.g. Redis) in production.
 */
export function createLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, number[]>();

  return {
    check(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfterSeconds: number } {
      // Drop expired keys so the map can't grow without bound.
      for (const [k, times] of hits) if (times.every((t) => now - t >= windowMs)) hits.delete(k);

      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
      }
      hits.set(key, [...recent, now]);
      return { ok: true };
    },
  };
}
