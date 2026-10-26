import { sha256 } from '../crypto/hashing.js';
import { HttpError, type Context } from '../context.js';

/**
 * Run a write once per Idempotency-Key. A retry with the same key and body gets the stored
 * result instead of repeating the change; the same key with a different body is refused.
 * Only small, non-secret results are stored (never tokens).
 */
export async function once<T extends object>(
  ctx: Context,
  userId: string,
  key: string | undefined,
  body: unknown,
  run: () => Promise<{ status: number; body: T }>,
): Promise<{ status: number; body: T }> {
  if (!key) return run();
  if (!/^[\w-]{8,100}$/.test(key))
    throw new HttpError(
      400,
      'invalid_request',
      'Idempotency-Key must be 8–100 letters, digits, - or _.',
    );
  const requestHash = sha256(JSON.stringify(body ?? null));
  const { rows } = await ctx.db.query<{ request_hash: Buffer; status: number; response: T }>(
    'SELECT request_hash, status, response FROM idempotency WHERE user_id = $1 AND key = $2',
    [userId, key],
  );
  const stored = rows[0];
  if (stored) {
    if (!stored.request_hash.equals(requestHash))
      throw new HttpError(
        409,
        'idempotency_mismatch',
        'This request id was already used for a different request.',
      );
    return { status: stored.status, body: stored.response };
  }
  const result = await run();
  await ctx.db.query(
    `INSERT INTO idempotency (user_id, key, request_hash, status, response)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
    [userId, key, requestHash, result.status, JSON.stringify(result.body)],
  );
  return result;
}
