import { randomBytes } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { backup, drill, restore } from '../src/cli/backup.js';
import { rotateKek } from '../src/cli/rotateKek.js';
import { EnvKeyProvider } from '../src/crypto/keys.js';
import {
  SHARED_SECRETS,
  TEST_DB,
  auth,
  createUser,
  harness,
  resetDatabase,
  truncate,
  type Harness,
} from './helpers.js';

let h: Harness;
const SCRATCH_DB = TEST_DB.replace(/\/[^/]+$/, '/pandaro_restore_drill');

beforeAll(async () => {
  h = await harness();
  await resetDatabase(h.db);
  await truncate(h.db);
  const admin = new pg.Client({ connectionString: TEST_DB });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS pandaro_restore_drill');
  await admin.query('CREATE DATABASE pandaro_restore_drill');
  await admin.end();
});
afterAll(async () => {
  await h.app.close();
  await h.db.close();
});

describe('backups', () => {
  it('backs up encrypted, restores, and passes the restore drill', async () => {
    const t = await createUser(h, 'backup@example.com');
    await h.app.inject({
      method: 'POST',
      url: '/v1/sync',
      headers: auth(t),
      payload: { push: [{ kind: 'task', id: 't1', updatedAt: 1, data: { title: 'Back me up' } }] },
    });
    const key = randomBytes(32);
    const file = join(tmpdir(), `pandaro-test-${Date.now()}.bak`);
    try {
      await backup(TEST_DB, file, key);
      const bytes = await readFile(file);
      expect(bytes.subarray(0, 8).toString()).toBe('PNDBAK1\n');
      expect(bytes.includes(Buffer.from('schema_migrations'))).toBe(false);

      const result = await drill(file, TEST_DB, SCRATCH_DB, key);
      expect(result.ok).toBe(true);
      expect(result.restored.users).toBe(1);
      expect(result.restored.records).toBe(1);

      // The wrong key, or a modified file, is refused before anything is restored.
      await expect(restore(file, SCRATCH_DB, randomBytes(32))).rejects.toThrow(/integrity/);
      bytes[200] = (bytes[200] ?? 0) ^ 0xff;
      await writeFile(file, bytes);
      await expect(restore(file, SCRATCH_DB, key)).rejects.toThrow(/integrity/);
    } finally {
      await rm(file, { force: true });
    }
  });
});

describe('key rotation', () => {
  it('rewraps data keys with the new KEK and keeps data readable', async () => {
    await truncate(h.db);
    const t = await createUser(h, 'rotate@example.com');
    await h.app.inject({
      method: 'POST',
      url: '/v1/sync',
      headers: auth(t),
      payload: {
        push: [{ kind: 'task', id: 't1', updatedAt: 1, data: { title: 'still readable' } }],
      },
    });
    const k2 = `k2:${randomBytes(32).toString('base64')}`;
    const rotated = new EnvKeyProvider([SHARED_SECRETS.KEKS, k2], 'k2');
    expect(await rotateKek(h.db, rotated)).toEqual({ rewrapped: 1, remaining: 0 });
    expect(await rotateKek(h.db, rotated)).toEqual({ rewrapped: 0, remaining: 0 });

    // A fresh instance that only knows the new KEK can read everything.
    const fresh = await harness({ KEKS: k2, ACTIVE_KEK: 'k2' });
    const res = await fresh.app.inject({
      method: 'POST',
      url: '/v1/sync',
      headers: auth(t),
      payload: {},
    });
    expect(res.json().pull[0].data.title).toBe('still readable');
    expect((await fresh.app.inject({ url: '/v1/account', headers: auth(t) })).json().email).toBe(
      'rotate@example.com',
    );
    await fresh.app.close();
    await fresh.db.close();
  });
});
