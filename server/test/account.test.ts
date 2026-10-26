import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queueWeeklySummary, unsubscribeToken } from '../src/account/service.js';
import { drainOutbox, type MailTransport } from '../src/email/outbox.js';
import type { Rendered } from '../src/email/templates.js';
import {
  PASSWORD,
  auth,
  createUser,
  harness,
  mailbox,
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

const patchConsents = (payload: object, key?: string) =>
  h.app.inject({
    method: 'PATCH',
    url: '/v1/account/consents',
    headers: { ...auth(me), ...(key ? { 'idempotency-key': key } : {}) },
    payload,
  });

describe('consents and email preferences', () => {
  it('records every change, so the history can be shown', async () => {
    expect(
      (await patchConsents({ optional: { weekly_email: true, improve: true } })).statusCode,
    ).toBe(200);
    expect((await patchConsents({ optional: { weekly_email: false } })).statusCode).toBe(200);
    const account = (await h.app.inject({ url: '/v1/account', headers: auth(me) })).json();
    expect(account.consents.weekly_email.granted).toBe(false);
    expect(account.consents.improve.granted).toBe(true);
    const exported = (await h.app.inject({ url: '/v1/account/export', headers: auth(me) })).json();
    const weekly = exported.consentHistory.filter(
      (c: { kind: string }) => c.kind === 'weekly_email',
    );
    expect(weekly.map((c: { granted: boolean }) => c.granted)).toEqual([false, true, false]);
  });

  it('replays a retried request and refuses a reused request id', async () => {
    expect((await patchConsents({ optional: { improve: true } }, 'req-12345678')).statusCode).toBe(
      200,
    );
    expect((await patchConsents({ optional: { improve: true } }, 'req-12345678')).statusCode).toBe(
      200,
    );
    const mismatch = await patchConsents({ optional: { improve: false } }, 'req-12345678');
    expect(mismatch.statusCode).toBe(409);
  });

  it('sends the weekly summary only to people who asked, with one-click unsubscribe', async () => {
    await h.db.query('DELETE FROM outbox');
    expect(await queueWeeklySummary(h.ctx, me.userId, { minutes: 125, sessions: 5 })).toBe(false);
    await patchConsents({ optional: { weekly_email: true } });
    expect(await queueWeeklySummary(h.ctx, me.userId, { minutes: 125, sessions: 5 })).toBe(true);

    const sent: Rendered[] = [];
    const transport: MailTransport = { send: async (_to, _from, mail) => void sent.push(mail) };
    expect(await drainOutbox(h.db, h.ctx.keys, transport, 'from@test')).toBe(1);
    expect(sent[0]?.unsubscribe).toContain('/v1/email/unsubscribe?t=');

    const t = unsubscribeToken(h.ctx, me.userId, 'weekly_email');
    const page = await h.app.inject({ url: `/v1/email/unsubscribe?t=${t}` });
    expect(page.body).toContain('<form method="post"');
    expect(
      (await h.app.inject({ method: 'POST', url: `/v1/email/unsubscribe?t=${t}` })).statusCode,
    ).toBe(200);
    const account = (await h.app.inject({ url: '/v1/account', headers: auth(me) })).json();
    expect(account.consents.weekly_email.granted).toBe(false);

    const forged = `${me.userId}.weekly_email.AAAA`;
    expect(
      (await h.app.inject({ method: 'POST', url: `/v1/email/unsubscribe?t=${forged}` })).statusCode,
    ).toBe(400);
  });

  it('asks again when the documents change', async () => {
    await h.db.query(`UPDATE consents SET version = '2020-01-01' WHERE kind = 'terms'`);
    const account = (await h.app.inject({ url: '/v1/account', headers: auth(me) })).json();
    expect(account.legalUpdateNeeded).toBe(true);
    await patchConsents({ acceptedTerms: account.legalVersions.terms });
    expect(
      (await h.app.inject({ url: '/v1/account', headers: auth(me) })).json().legalUpdateNeeded,
    ).toBe(false);
  });
});

describe('export and deletion', () => {
  it('exports everything, decrypted', async () => {
    await h.app.inject({
      method: 'POST',
      url: '/v1/sync',
      headers: auth(me),
      payload: {
        push: [{ kind: 'task', id: 't1', updatedAt: 1, data: { title: 'Plant bamboo' } }],
      },
    });
    const res = await h.app.inject({ url: '/v1/account/export', headers: auth(me) });
    expect(res.headers['content-disposition']).toContain('attachment');
    const body = res.json();
    expect(body.account.email).toBe('panda@example.com');
    expect(body.records[0].data.title).toBe('Plant bamboo');
    expect(body.securityEvents.map((e: { kind: string }) => e.kind)).toContain('signup');
  });

  it('deletes the account and its data after the password is confirmed', async () => {
    const del = (password: string) =>
      h.app.inject({
        method: 'DELETE',
        url: '/v1/account',
        headers: auth(me),
        payload: { password },
      });
    await h.app.inject({
      method: 'POST',
      url: '/v1/sync',
      headers: auth(me),
      payload: { push: [{ kind: 'task', id: 't1', updatedAt: 1, data: { title: 'x' } }] },
    });
    expect((await del('wrong password')).statusCode).toBe(401);
    expect((await del(PASSWORD)).statusCode).toBe(204);
    // A retry after success is harmless.
    expect((await del(PASSWORD)).statusCode).toBe(204);

    for (const table of ['users', 'records', 'consents', 'refresh_tokens', 'security_events']) {
      const { rows } = await h.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
      expect(rows[0]?.n, table).toBe(0);
    }
    const mails = await mailbox(h);
    expect(mails.at(-1)?.message.template).toBe('account-deleted');
    expect(mails.at(-1)?.to).toBe('panda@example.com');
    expect((await h.app.inject({ url: '/v1/account', headers: auth(me) })).statusCode).toBe(401);
  });
});

describe('outbox', () => {
  it('retries failed sends with backoff and wipes sent messages', async () => {
    let fail = true;
    const transport: MailTransport = {
      send: async () => {
        if (fail) throw new Error('provider down');
      },
    };
    expect(await drainOutbox(h.db, h.ctx.keys, transport, 'from@test')).toBe(0);
    const { rows } = await h.db.query<{ attempts: number; due: boolean }>(
      'SELECT attempts, next_try_at > now() AS due FROM outbox',
    );
    expect(rows[0]).toEqual({ attempts: 1, due: true });

    await h.db.query('UPDATE outbox SET next_try_at = now()');
    fail = false;
    expect(await drainOutbox(h.db, h.ctx.keys, transport, 'from@test')).toBe(1);
    const { rows: sent } = await h.db.query<{ size: number }>(
      'SELECT length(to_enc) + length(data_enc) AS size FROM outbox WHERE sent_at IS NOT NULL',
    );
    expect(sent[0]?.size).toBe(0);
  });

  it('never sends a message twice when several workers run at once', async () => {
    let sends = 0;
    const transport: MailTransport = {
      send: async () => {
        sends++;
        await new Promise((r) => setTimeout(r, 20));
      },
    };
    const results = await Promise.all(
      [1, 2, 3].map(() => drainOutbox(h.db, h.ctx.keys, transport, 'from@test')),
    );
    expect(results.reduce((a, b) => a + b, 0)).toBe(1);
    expect(sends).toBe(1);
  });
});
