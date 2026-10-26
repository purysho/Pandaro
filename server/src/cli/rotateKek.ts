/*
 * Rewrap every user's data key with the active KEK.
 *
 * 1. Add the new key to KEKS and set ACTIVE_KEK to it (keep the old key listed).
 * 2. Deploy. New data keys use the new KEK; old ones still unwrap with the old KEK.
 * 3. Run: node dist/cli/rotateKek.js
 * 4. When it reports 0 remaining, remove the old key from KEKS and deploy again.
 * Record content is not re-encrypted: only the small wrapped keys change.
 */
import { loadConfig } from '../config.js';
import { dekAad } from '../context.js';
import { EnvKeyProvider, type KeyProvider } from '../crypto/keys.js';
import { Database } from '../db/pool.js';

export async function rotateKek(db: Database, keys: KeyProvider, batch = 200) {
  let rewrapped = 0;
  for (;;) {
    const { rows } = await db.query<{ id: string; dek_wrapped: Buffer }>(
      'SELECT id, dek_wrapped FROM users WHERE dek_kid <> $1 ORDER BY id LIMIT $2',
      [keys.activeKid, batch],
    );
    if (rows.length === 0) break;
    for (const row of rows) {
      const dek = await keys.decrypt(row.dek_wrapped, dekAad(row.id));
      const wrapped = await keys.encrypt(dek, dekAad(row.id));
      // Only replace the exact value read, so a concurrent change is never overwritten.
      await db.query(
        'UPDATE users SET dek_wrapped = $2, dek_kid = $3 WHERE id = $1 AND dek_wrapped = $4',
        [row.id, wrapped, keys.activeKid, row.dek_wrapped],
      );
      rewrapped++;
    }
  }
  const { rows } = await db.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM users WHERE dek_kid <> $1',
    [keys.activeKid],
  );
  return { rewrapped, remaining: rows[0]?.n ?? 0 };
}

const isMain =
  process.argv[1]?.endsWith('rotateKek.js') || process.argv[1]?.endsWith('rotateKek.ts');
if (isMain) {
  const config = loadConfig();
  const db = new Database(config.databaseUrls, 2);
  try {
    const result = await rotateKek(db, new EnvKeyProvider(config.KEKS, config.ACTIVE_KEK));
    console.log(JSON.stringify(result));
  } finally {
    await db.close();
  }
}
