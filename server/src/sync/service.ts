/*
 * Record sync. The device stays the source of truth; the server is an encrypted mailbox that
 * merges with the same rules as the app's IndexedDB merge (src/persistence/db.ts):
 * - sessions and ledger entries are append-only: the first copy wins;
 * - tasks and settings keep the newer updatedAt; a deletion wins a tie;
 * - deletions are kept as tombstones (deleted = true, no payload) so other devices learn of them.
 *
 * Every push is safe to repeat: records are keyed by id and merged, never appended twice. A client
 * that loses its connection mid-request (or lands on another server) simply sends it again.
 */
import { z } from 'zod';
import { decryptWith, encryptWith } from '../crypto/keys.js';
import { HttpError, userDek, type Context } from '../context.js';
import { LIMITS } from '../lib/rateLimit.js';

export const MAX_PUSH = 500;
export const MAX_PULL = 500;
export const MAX_PAYLOAD_BYTES = 16 * 1024;

const kind = z.enum(['session', 'task', 'ledger', 'settings']);
export type RecordKind = z.infer<typeof kind>;

export const pushItemSchema = z
  .object({
    kind,
    id: z.string().min(1).max(100),
    updatedAt: z.number().int().nonnegative(),
    deleted: z.boolean().default(false),
    data: z.record(z.string(), z.unknown()).nullable().default(null),
  })
  .refine((r) => r.deleted || r.data !== null, { message: 'data is required unless deleted' })
  .refine((r) => !r.deleted || r.kind === 'task', { message: 'only tasks can be deleted' })
  .refine((r) => r.kind !== 'settings' || r.id === 'settings', { message: 'settings id' });

export const syncRequestSchema = z.object({
  cursor: z
    .string()
    .regex(/^\d{1,19}$/)
    .default('0'),
  push: z.array(pushItemSchema).max(MAX_PUSH).default([]),
});

export type PushItem = z.infer<typeof pushItemSchema>;
export interface PulledRecord {
  kind: RecordKind;
  id: string;
  updatedAt: number;
  deleted: boolean;
  data: Record<string, unknown> | null;
}
export interface SyncResult {
  cursor: string;
  pull: PulledRecord[];
  /** More changes are waiting: call again with the new cursor. */
  more: boolean;
  accepted: number;
}

const aad = (userId: string, k: string, id: string) => `${userId}:${k}:${id}`;

export async function sync(
  ctx: Context,
  userId: string,
  request: z.infer<typeof syncRequestSchema>,
): Promise<SyncResult> {
  const r = await ctx.limiter.hit(`sync:${userId}`, LIMITS.syncPerAccount, ctx.now());
  if (!r.allowed)
    throw new HttpError(
      429,
      'rate_limited',
      'Syncing too often. Trying again shortly.',
      r.retryAfter,
    );

  const dek = await userDek(ctx, userId);
  const encoded = request.push.map((item) => {
    let payload: Buffer | null = null;
    if (item.data) {
      const json = Buffer.from(JSON.stringify(item.data), 'utf8');
      if (json.length > MAX_PAYLOAD_BYTES)
        throw new HttpError(413, 'record_too_large', `Record ${item.id} is too large to sync.`);
      payload = encryptWith(dek, json, aad(userId, item.kind, item.id));
    }
    return { ...item, payload };
  });

  return ctx.db.transaction(async (tx) => {
    // One sync per user at a time, so sequence numbers commit in order and cursors never skip.
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [userId]);
    let accepted = 0;
    for (const item of encoded) {
      const appendOnly = item.kind === 'session' || item.kind === 'ledger';
      const { rowCount } = await tx.query(
        appendOnly
          ? `INSERT INTO records (user_id, kind, id, updated_at, deleted, payload)
             VALUES ($1, $2, $3, $4, false, $5) ON CONFLICT DO NOTHING`
          : `INSERT INTO records (user_id, kind, id, updated_at, deleted, payload)
             VALUES ($1, $2, $3, $4, $6, $5)
             ON CONFLICT (user_id, kind, id) DO UPDATE
               SET updated_at = EXCLUDED.updated_at, deleted = EXCLUDED.deleted,
                   payload = EXCLUDED.payload, seq = nextval('record_seq')
             WHERE records.updated_at < EXCLUDED.updated_at
                OR (records.updated_at = EXCLUDED.updated_at AND EXCLUDED.deleted AND NOT records.deleted)`,
        appendOnly
          ? [userId, item.kind, item.id, item.updatedAt, item.payload]
          : [userId, item.kind, item.id, item.updatedAt, item.payload, item.deleted],
      );
      accepted += rowCount ?? 0;
    }

    const { rows } = await tx.query<{
      kind: RecordKind;
      id: string;
      updated_at: string;
      deleted: boolean;
      payload: Buffer | null;
      seq: string;
    }>(
      `SELECT kind, id, updated_at, deleted, payload, seq FROM records
        WHERE user_id = $1 AND seq > $2 ORDER BY seq LIMIT $3`,
      [userId, request.cursor, MAX_PULL + 1],
    );
    const more = rows.length > MAX_PULL;
    const page = rows.slice(0, MAX_PULL);
    const pull = page.map((row) => ({
      kind: row.kind,
      id: row.id,
      updatedAt: Number(row.updated_at),
      deleted: row.deleted,
      data: row.payload
        ? (JSON.parse(
            decryptWith(dek, row.payload, aad(userId, row.kind, row.id)).toString('utf8'),
          ) as Record<string, unknown>)
        : null,
    }));
    const cursor = page.length ? (page[page.length - 1] as { seq: string }).seq : request.cursor;
    return { cursor, pull, more, accepted };
  });
}

/** Every synced record, decrypted (for the account data export). */
export async function allRecords(ctx: Context, userId: string): Promise<PulledRecord[]> {
  const dek = await userDek(ctx, userId);
  const { rows } = await ctx.db.query<{
    kind: RecordKind;
    id: string;
    updated_at: string;
    deleted: boolean;
    payload: Buffer | null;
  }>('SELECT kind, id, updated_at, deleted, payload FROM records WHERE user_id = $1 ORDER BY seq', [
    userId,
  ]);
  return rows.map((row) => ({
    kind: row.kind,
    id: row.id,
    updatedAt: Number(row.updated_at),
    deleted: row.deleted,
    data: row.payload
      ? (JSON.parse(
          decryptWith(dek, row.payload, aad(userId, row.kind, row.id)).toString('utf8'),
        ) as Record<string, unknown>)
      : null,
  }));
}
