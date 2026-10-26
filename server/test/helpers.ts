import { generateKeyPairSync, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { createContext, type Context } from '../src/context.js';
import { migrate } from '../src/db/migrate.js';
import { Database } from '../src/db/pool.js';
import { decodeOutboxRow } from '../src/email/outbox.js';
import type { EmailMessage } from '../src/email/templates.js';
import { LEGAL_VERSIONS } from '../src/legal.js';

export const TEST_DB =
  process.env.TEST_DATABASE_URL ?? 'postgres://pandaro:pandaro@127.0.0.1:5432/pandaro_test';

/** Secrets shared by every instance in a test, as they would be in a real deployment. */
export const SHARED_SECRETS = {
  PEPPER: randomBytes(32).toString('base64'),
  JWT_PRIVATE_KEY: Buffer.from(
    generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
  ).toString('base64'),
  KEKS: `k1:${randomBytes(32).toString('base64')}`,
  ACTIVE_KEK: 'k1',
};

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB,
    // Low cost keeps the suite fast; production enforces at least 64 MiB.
    ARGON2_MEMORY_KIB: '8192',
    ARGON2_ITERATIONS: '1',
    APP_URL: 'http://app.test',
    PUBLIC_URL: 'http://api.test',
    ...SHARED_SECRETS,
    ...overrides,
  });
}

/** Fresh schema for a test file. */
export async function resetDatabase(db: Database): Promise<void> {
  await db.query('DROP SCHEMA IF EXISTS public CASCADE');
  await db.query('CREATE SCHEMA public');
  await migrate(db);
}

const TABLES =
  'users, refresh_tokens, email_tokens, consents, records, idempotency, rate_limits, device_signups, outbox, security_events';

export async function truncate(db: Database): Promise<void> {
  await db.query(`TRUNCATE ${TABLES} RESTART IDENTITY CASCADE`);
}

export interface Harness {
  db: Database;
  ctx: Context;
  app: FastifyInstance;
  clock: { now: number };
}

export async function harness(
  overrides: Record<string, string> = {},
  db?: Database,
): Promise<Harness> {
  const config = testConfig(overrides);
  const database = db ?? new Database(config.databaseUrls, 5);
  const clock = { now: Date.now() };
  const ctx = createContext(config, database, { now: () => clock.now });
  const app = await buildApp(ctx);
  return { db: database, ctx, app, clock };
}

export const PASSWORD = 'correct horse battery';

export function signupBody(email: string, extra: Record<string, unknown> = {}) {
  return {
    email,
    password: PASSWORD,
    acceptedTerms: LEGAL_VERSIONS.terms,
    acceptedPrivacy: LEGAL_VERSIONS.privacy,
    confirmedAge: true,
    ...extra,
  };
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

export async function createUser(h: Harness, email = 'panda@example.com'): Promise<Tokens> {
  const res = await h.app.inject({
    method: 'POST',
    url: '/v1/auth/signup',
    payload: signupBody(email),
  });
  if (res.statusCode !== 201) throw new Error(`signup failed: ${res.body}`);
  return res.json<Tokens>();
}

export const auth = (t: { accessToken: string }) => ({ authorization: `Bearer ${t.accessToken}` });

/** Queued emails, decrypted, newest last. */
export async function mailbox(h: Harness): Promise<{ to: string; message: EmailMessage }[]> {
  const { rows } = await h.db.query<{ to_enc: Buffer; data_enc: Buffer }>(
    'SELECT to_enc, data_enc FROM outbox WHERE sent_at IS NULL ORDER BY id',
  );
  return Promise.all(rows.map((r) => decodeOutboxRow(h.ctx.keys, r)));
}

export function linkToken(message: EmailMessage, param: 'verify' | 'reset'): string {
  const link = 'link' in message.data ? message.data.link : '';
  const match = new RegExp(`#${param}=([\\w-]+)`).exec(link);
  if (!match?.[1]) throw new Error(`no ${param} link in ${message.template}`);
  return match[1];
}
