import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_PULL } from '../src/sync/service.js';
import {
  auth,
  createUser,
  harness,
  resetDatabase,
  truncate,
  type Harness,
  type Tokens,
} from './helpers.js';

let h: Harness;
let me: Tokens;

beforeAll(async () => {
  h = await harness();
  await resetDatabase(h.db);
});
beforeEach(async () => {
  await truncate(h.db);
  me = await createUser(h);
});
afterAll(async () => {
  await h.app.close();
  await h.db.close();
});

interface Item {
  kind: string;
  id: string;
  updatedAt: number;
  deleted?: boolean;
  data?: Record<string, unknown> | null;
}

async function sync(t: Tokens, push: Item[] = [], cursor = '0') {
  const res = await h.app.inject({
    method: 'POST',
    url: '/v1/sync',
    headers: auth(t),
    payload: { cursor, push },
  });
  return { status: res.statusCode, body: res.json() };
}

const task = (id: string, updatedAt: number, title = 'Write report'): Item => ({
  kind: 'task',
  id,
  updatedAt,
  data: { id, title, updatedAt },
});
const session = (id: string, at: number): Item => ({
  kind: 'session',
  id,
  updatedAt: at,
  data: { id, kind: 'focus', endedAt: at },
});

describe('sync', () => {
  it('pushes records from one device and pulls them on another', async () => {
    const r1 = await sync(me, [
      task('t1', 1),
      session('s1', 1),
      { kind: 'settings', id: 'settings', updatedAt: 1, data: { focusMinutes: 30 } },
    ]);
    expect(r1.status).toBe(200);
    expect(r1.body.accepted).toBe(3);

    const other = await sync(me, [], '0');
    expect(other.body.pull.map((r: Item) => r.id).sort()).toEqual(['s1', 'settings', 't1']);
    expect(other.body.pull.find((r: Item) => r.id === 't1').data.title).toBe('Write report');

    const nothingNew = await sync(me, [], other.body.cursor);
    expect(nothingNew.body.pull).toEqual([]);
    expect(nothingNew.body.cursor).toBe(other.body.cursor);
  });

  it('is safe to repeat: a retried push changes nothing', async () => {
    const push = [task('t1', 5), session('s1', 5)];
    await sync(me, push);
    const again = await sync(me, push);
    expect(again.body.accepted).toBe(0);
    const { rows } = await h.db.query<{ n: number }>('SELECT count(*)::int AS n FROM records');
    expect(rows[0]?.n).toBe(2);
  });

  it('keeps the newer task edit, whichever arrives first', async () => {
    await sync(me, [task('t1', 200, 'new title')]);
    await sync(me, [task('t1', 100, 'old title')]);
    const { body } = await sync(me);
    expect(body.pull[0].data.title).toBe('new title');
  });

  it('never overwrites sessions or ledger entries (append-only)', async () => {
    await sync(me, [session('s1', 1)]);
    await sync(me, [{ ...session('s1', 9), data: { id: 's1', kind: 'tampered', endedAt: 9 } }]);
    const { body } = await sync(me);
    expect(body.pull[0].data.kind).toBe('focus');
  });

  it('spreads deletions as tombstones, and a later edit brings a task back', async () => {
    await sync(me, [task('t1', 10)]);
    const seen = await sync(me);
    await sync(me, [{ kind: 'task', id: 't1', updatedAt: 20, deleted: true, data: null }]);
    const after = await sync(me, [], seen.body.cursor);
    expect(after.body.pull).toEqual([
      { kind: 'task', id: 't1', updatedAt: 20, deleted: true, data: null },
    ]);
    // An older edit loses to the deletion; a tie also goes to the deletion.
    await sync(me, [task('t1', 15), task('t1', 20)]);
    expect((await sync(me)).body.pull[0].deleted).toBe(true);
    await sync(me, [task('t1', 30, 'restored')]);
    expect((await sync(me)).body.pull[0]).toMatchObject({
      deleted: false,
      data: { title: 'restored' },
    });
  });

  it('pages large pulls with a cursor', async () => {
    const push = Array.from({ length: MAX_PULL + 20 }, (_, i) => session(`s${i}`, i));
    await sync(me, push.slice(0, 500));
    await sync(me, push.slice(500));
    const first = await sync(me);
    expect(first.body.pull).toHaveLength(MAX_PULL);
    expect(first.body.more).toBe(true);
    const second = await sync(me, [], first.body.cursor);
    expect(second.body.pull).toHaveLength(20);
    expect(second.body.more).toBe(false);
  });

  it('keeps each account separate', async () => {
    const stranger = await createUser(h, 'stranger@example.com');
    await sync(me, [task('t1', 1, 'mine')]);
    expect((await sync(stranger)).body.pull).toEqual([]);
  });

  it('stores record content encrypted', async () => {
    await sync(me, [task('t1', 1, 'Very private plan')]);
    const { rows } = await h.db.query<{ payload: Buffer }>('SELECT payload FROM records');
    expect(rows[0]?.payload.includes(Buffer.from('Very private plan'))).toBe(false);
  });

  it('rejects bad input', async () => {
    expect(
      (await sync(me, [{ kind: 'session', id: 's', updatedAt: 1, deleted: true, data: null }]))
        .status,
    ).toBe(400);
    expect((await sync(me, [{ kind: 'nope', id: 'x', updatedAt: 1, data: {} }])).status).toBe(400);
    expect(
      (await sync(me, [{ kind: 'settings', id: 'other', updatedAt: 1, data: {} }])).status,
    ).toBe(400);
    const huge = task('big', 1, 'x'.repeat(20_000));
    expect((await sync(me, [huge])).status).toBe(413);
    const anon = await h.app.inject({ method: 'POST', url: '/v1/sync', payload: { push: [] } });
    expect(anon.statusCode).toBe(401);
  });
});
