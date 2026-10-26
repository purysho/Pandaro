import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Database } from '../src/db/pool.js';
import { housekeeping } from '../src/jobs.js';
import { RateLimiter } from '../src/lib/rateLimit.js';
import {
  PASSWORD,
  TEST_DB,
  auth,
  createUser,
  harness,
  resetDatabase,
  type Harness,
  type Tokens,
} from './helpers.js';

/*
 * Two API instances share the database and secrets, as in production behind a load balancer.
 * A user signed in on one keeps working when requests land on the other, including when one
 * instance goes away mid-session.
 */
let a: Harness;
let b: Harness;

beforeAll(async () => {
  a = await harness({ INSTANCE_ID: 'a' });
  await resetDatabase(a.db);
  b = await harness({ INSTANCE_ID: 'b' });
});
afterAll(async () => {
  await a.app.close();
  await b.app.close();
  await a.db.close();
  await b.db.close();
});

describe('switching servers', () => {
  it('keeps the user signed in when requests move between instances', async () => {
    const t = await createUser(a, 'switch@example.com');
    const onB = await b.app.inject({ url: '/v1/account', headers: auth(t) });
    expect(onB.statusCode).toBe(200);
    expect(onB.headers['x-served-by']).toBe('b');

    // Data written through A is readable through B (B unwraps the data key itself).
    await a.app.inject({
      method: 'POST',
      url: '/v1/sync',
      headers: auth(t),
      payload: { push: [{ kind: 'task', id: 't', updatedAt: 1, data: { title: 'hello' } }] },
    });
    const pulled = await b.app.inject({
      method: 'POST',
      url: '/v1/sync',
      headers: auth(t),
      payload: {},
    });
    expect(pulled.json().pull[0].data.title).toBe('hello');

    // A goes away. The client refreshes on B and carries on.
    await a.app.close();
    const refreshed = await b.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: t.refreshToken },
    });
    expect(refreshed.statusCode).toBe(200);
    const next = refreshed.json<Tokens>();
    expect((await b.app.inject({ url: '/v1/account', headers: auth(next) })).statusCode).toBe(200);
    // Signing in still works and the account is intact.
    const login = await b.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'switch@example.com', password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
  });

  it('shares rate limits between instances', async () => {
    const limiter1 = new RateLimiter(a.db);
    const limiter2 = new RateLimiter(b.db);
    const limit = { max: 3, windowSeconds: 60 };
    const now = 16_666_666 * 60_000; // the start of a window
    expect((await limiter1.hit('shared', limit, now)).allowed).toBe(true);
    expect((await limiter2.hit('shared', limit, now)).allowed).toBe(true);
    expect((await limiter1.hit('shared', limit, now)).allowed).toBe(true);
    expect((await limiter2.hit('shared', limit, now)).allowed).toBe(false);
    // Halfway through the next window, half of the old window's 4 hits still count (2 + new).
    expect((await limiter1.hit('shared', limit, now + 90_000)).allowed).toBe(true);
    expect((await limiter1.hit('shared', limit, now + 90_000)).allowed).toBe(false);
    // Two windows later, the old hits no longer count.
    expect((await limiter2.hit('shared', limit, now + 180_000)).allowed).toBe(true);
    await housekeeping(b.ctx);
  });
});

describe('database failover', () => {
  it('skips a server that is down and uses the next one', async () => {
    const db = new Database(['postgres://pandaro:pandaro@127.0.0.1:1/none', TEST_DB], 2);
    const { rows } = await db.query<{ one: number }>('SELECT 1 AS one');
    expect(rows[0]?.one).toBe(1);
    await db.close();
  });

  it('reconnects and retries when its connections are cut', async () => {
    const db = new Database([TEST_DB], 2);
    await db.query('SELECT 1');
    // Another session kills every connection this pool holds, as a database restart would.
    const admin = new pg.Client({ connectionString: TEST_DB });
    await admin.connect();
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid() AND application_name = ''`,
    );
    await admin.end();
    const { rows } = await db.query<{ one: number }>('SELECT 1 AS one');
    expect(rows[0]?.one).toBe(1);
    await db.close();
  });
});
