/*
 * Encrypted logical backups.
 *
 *   node dist/cli/backup.js backup  <file>             dump DATABASE_URL to an encrypted file
 *   node dist/cli/backup.js restore <file> <url>       restore into the database at <url>
 *   node dist/cli/backup.js drill   <file> <url>       restore into <url> and compare row counts
 *
 * Files are pg_dump custom-format archives encrypted with AES-256-GCM under BACKUP_KEY (32 bytes,
 * base64), which must be stored apart from the database and from the KEKs. Records inside are
 * already encrypted with per-user keys, so a backup alone reveals no task text or email.
 * Managed Postgres point-in-time recovery is the first line of defence; these files are the
 * off-site copy and the monthly restore drill (docs: DEPLOYMENT.md).
 */
import { spawn } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import pg from 'pg';

const MAGIC = Buffer.from('PNDBAK1\n');
const IV = 12;
const TAG = 16;

function backupKey(b64 = process.env.BACKUP_KEY): Buffer {
  const key = b64 ? Buffer.from(b64, 'base64') : Buffer.alloc(0);
  if (key.length !== 32) throw new Error('BACKUP_KEY must be 32 bytes, base64-encoded');
  return key;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)),
    );
  });
}

export async function backup(databaseUrl: string, file: string, key = backupKey()): Promise<void> {
  const iv = randomBytes(IV);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(MAGIC);
  const out = createWriteStream(file, { mode: 0o600 });
  out.write(MAGIC);
  out.write(iv);
  const dump = spawn('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', databaseUrl], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const exited = new Promise<void>((resolve, reject) => {
    dump.on('error', reject);
    dump.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`pg_dump exited ${code}`)),
    );
  });
  await pipeline(dump.stdout, cipher, out, { end: false });
  await exited;
  await new Promise<void>((resolve, reject) =>
    out.end(cipher.getAuthTag(), () => resolve()).on('error', reject),
  );
}

/** Decrypt to a private temporary file; the tag is checked before anything is restored. */
async function decryptToTemp(file: string, key: Buffer): Promise<string> {
  const size = (await stat(file)).size;
  const handle = await open(file, 'r');
  const header = Buffer.alloc(MAGIC.length + IV);
  const tag = Buffer.alloc(TAG);
  await handle.read(header, 0, header.length, 0);
  await handle.read(tag, 0, TAG, size - TAG);
  await handle.close();
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Not a Pandaro backup file');
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(MAGIC.length));
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  const temp = join(tmpdir(), `pandaro-restore-${randomBytes(6).toString('hex')}.dump`);
  try {
    await pipeline(
      createReadStream(file, { start: header.length, end: size - TAG - 1 }),
      decipher,
      createWriteStream(temp, { mode: 0o600 }),
    );
  } catch (error) {
    await rm(temp, { force: true });
    throw new Error(`Backup failed its integrity check: ${(error as Error).message}`);
  }
  return temp;
}

export async function restore(file: string, targetUrl: string, key = backupKey()): Promise<void> {
  const temp = await decryptToTemp(file, key);
  try {
    await run('pg_restore', [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--dbname',
      targetUrl,
      temp,
    ]);
  } finally {
    await rm(temp, { force: true });
  }
}

const COUNTED = ['users', 'records', 'consents', 'refresh_tokens', 'schema_migrations'];

export async function rowCounts(url: string): Promise<Record<string, number>> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const out: Record<string, number> = {};
    for (const table of COUNTED) {
      const { rows } = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
      out[table] = rows[0]?.n ?? 0;
    }
    return out;
  } finally {
    await client.end();
  }
}

/** Restore into a scratch database and check that every table came back with the same rows. */
export async function drill(
  file: string,
  sourceUrl: string,
  scratchUrl: string,
  key = backupKey(),
) {
  await restore(file, scratchUrl, key);
  const [source, restored] = await Promise.all([rowCounts(sourceUrl), rowCounts(scratchUrl)]);
  const ok = COUNTED.every((t) => source[t] === restored[t]);
  return { ok, source, restored };
}

const isMain = process.argv[1]?.endsWith('backup.js') || process.argv[1]?.endsWith('backup.ts');
if (isMain) {
  const [command, file, url] = process.argv.slice(2);
  const source = process.env.DATABASE_URL ?? '';
  const main = async () => {
    if (command === 'backup' && file) return backup(source, file);
    if (command === 'restore' && file && url) return restore(file, url);
    if (command === 'drill' && file && url) {
      const result = await drill(file, source, url);
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
      return;
    }
    console.error('usage: backup <file> | restore <file> <url> | drill <file> <scratch-url>');
    process.exitCode = 2;
  };
  await main();
}
