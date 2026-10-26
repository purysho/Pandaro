import type { Database } from '../db/pool.js';

export interface Limit {
  /** Maximum events in the window. */
  max: number;
  windowSeconds: number;
}

export const LIMITS = {
  loginPerAccount: { max: 5, windowSeconds: 15 * 60 },
  loginPerIp: { max: 20, windowSeconds: 15 * 60 },
  signupPerIp: { max: 3, windowSeconds: 60 * 60 },
  resetPerAccount: { max: 3, windowSeconds: 60 * 60 },
  resetPerIp: { max: 10, windowSeconds: 60 * 60 },
  verifyResendPerAccount: { max: 3, windowSeconds: 60 * 60 },
  refreshPerFamily: { max: 60, windowSeconds: 60 * 60 },
  syncPerAccount: { max: 120, windowSeconds: 60 },
} satisfies Record<string, Limit>;

export interface LimitResult {
  allowed: boolean;
  /** Seconds until another attempt is likely to be allowed. */
  retryAfter: number;
}

/**
 * Sliding-window counter stored in Postgres, so the limit holds across all API instances. The
 * estimate weights the previous fixed window by how much of it still overlaps the sliding window.
 */
export class RateLimiter {
  constructor(private readonly db: Database) {}

  async hit(key: string, limit: Limit, now = Date.now()): Promise<LimitResult> {
    const windowMs = limit.windowSeconds * 1000;
    const start = Math.floor(now / windowMs) * windowMs;
    const { rows } = await this.db.query<{ current: number; previous: number }>(
      `WITH up AS (
         INSERT INTO rate_limits (key, window_start, count) VALUES ($1, $2, 1)
         ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
         RETURNING count
       )
       SELECT (SELECT count FROM up) AS current,
              COALESCE((SELECT count FROM rate_limits WHERE key = $1 AND window_start = $3), 0) AS previous`,
      [key, start, start - windowMs],
    );
    const current = rows[0]?.current ?? 1;
    const previous = rows[0]?.previous ?? 0;
    const overlap = 1 - (now - start) / windowMs;
    const estimate = previous * overlap + current;
    if (estimate <= limit.max) return { allowed: true, retryAfter: 0 };
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((start + windowMs - now) / 1000)) };
  }

  /** Forget the counter (for example after a successful login). */
  async reset(key: string): Promise<void> {
    await this.db.query('DELETE FROM rate_limits WHERE key = $1', [key]);
  }

  /** Remove windows that can no longer affect any limit. */
  async prune(now = Date.now(), maxWindowSeconds = 24 * 3600): Promise<number> {
    const { rowCount } = await this.db.query('DELETE FROM rate_limits WHERE window_start < $1', [
      now - 2 * maxWindowSeconds * 1000,
    ]);
    return rowCount ?? 0;
  }
}
