import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { REFRESH_GRACE_MS } from '../src/auth/service.js';
import type { EmailMessage } from '../src/email/templates.js';
import {
  PASSWORD,
  auth,
  createUser,
  harness,
  linkToken,
  mailbox,
  resetDatabase,
  signupBody,
  truncate,
  type Harness,
  type Tokens,
} from './helpers.js';

let h: Harness;

beforeAll(async () => {
  h = await harness({ DEVICE_ATTESTATION: 'dev' });
  await resetDatabase(h.db);
});
beforeEach(async () => {
  await truncate(h.db);
  h.clock.now = Date.now();
});
afterAll(async () => {
  await h.app.close();
  await h.db.close();
});

const post = (
  url: string,
  payload: unknown,
  headers: Record<string, string> = {},
  ip = '10.0.0.1',
) => h.app.inject({ method: 'POST', url, payload: payload as object, headers, remoteAddress: ip });

describe('sign-up', () => {
  it('creates an account, stores no plain email, and sends a verification link', async () => {
    const t = await createUser(h, 'Panda@Example.com');
    expect(t.accessToken.split('.')).toHaveLength(3);

    const { rows } = await h.db.query<{ email_enc: Buffer; password_hash: string }>(
      'SELECT email_enc, password_hash FROM users',
    );
    expect(rows[0]?.email_enc.includes(Buffer.from('panda@example.com'))).toBe(false);
    expect(rows[0]?.password_hash.startsWith('$argon2id$')).toBe(true);

    const [mail] = await mailbox(h);
    expect(mail?.to).toBe('panda@example.com');
    expect(mail?.message.template).toBe('verify');
    const token = linkToken(mail?.message as EmailMessage, 'verify');

    expect(
      (await h.app.inject({ url: '/v1/account', headers: auth(t) })).json().emailVerified,
    ).toBe(false);
    expect((await post('/v1/auth/verify-email', { token })).statusCode).toBe(204);
    expect(
      (await h.app.inject({ url: '/v1/account', headers: auth(t) })).json().emailVerified,
    ).toBe(true);
    // Single use.
    expect((await post('/v1/auth/verify-email', { token })).json().error.code).toBe('link_invalid');
  });

  it('records required and optional consents, optional ones off by default', async () => {
    const t = await createUser(h);
    const account = (await h.app.inject({ url: '/v1/account', headers: auth(t) })).json();
    expect(account.consents.terms.granted).toBe(true);
    expect(account.consents.privacy.granted).toBe(true);
    expect(account.consents.improve.granted).toBe(false);
    expect(account.consents.product_email.granted).toBe(false);
    expect(account.consents.weekly_email.granted).toBe(false);
    expect(account.legalUpdateNeeded).toBe(false);
  });

  it('allows one account per email, case-insensitively', async () => {
    await createUser(h, 'panda@example.com');
    const res = await post('/v1/auth/signup', {
      ...signupBody('PANDA@example.com'),
      password: 'another password',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('email_taken');
  });

  it('treats a retried sign-up with the same password as a sign-in', async () => {
    const first = await createUser(h);
    const again = await post('/v1/auth/signup', signupBody('panda@example.com'));
    expect(again.statusCode).toBe(201);
    expect(again.json().userId).toBe(first.userId);
    const { rows } = await h.db.query<{ n: number }>('SELECT count(*)::int AS n FROM users');
    expect(rows[0]?.n).toBe(1);
  });

  it('rejects weak passwords, missing agreement and outdated documents', async () => {
    expect(
      (await post('/v1/auth/signup', { ...signupBody('a@b.co'), password: 'short' })).json().error
        .code,
    ).toBe('weak_password');
    expect(
      (await post('/v1/auth/signup', { ...signupBody('a@b.co'), password: 'a@b.co' })).statusCode,
    ).toBe(400);
    expect(
      (await post('/v1/auth/signup', signupBody('a@b.co', { confirmedAge: false }))).json().error
        .code,
    ).toBe('age_required');
    expect(
      (await post('/v1/auth/signup', signupBody('a@b.co', { acceptedTerms: '2020-01-01' }))).json()
        .error.code,
    ).toBe('legal_outdated');
    expect(
      (await post('/v1/auth/signup', { email: 'not-an-email', password: PASSWORD })).statusCode,
    ).toBe(400);
  });

  it('limits sign-ups per IP address', async () => {
    for (let i = 0; i < 3; i++) {
      expect(
        (await post('/v1/auth/signup', signupBody(`p${i}@example.com`), {}, '10.9.9.9')).statusCode,
      ).toBe(201);
    }
    const blocked = await post('/v1/auth/signup', signupBody('p4@example.com'), {}, '10.9.9.9');
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(
      (await post('/v1/auth/signup', signupBody('p4@example.com'), {}, '10.9.9.10')).statusCode,
    ).toBe(201);
  });

  it('allows at most two new accounts per attested device in 30 days', async () => {
    const device = { platform: 'android', token: 'dev:pixel-1234' };
    expect(
      (await post('/v1/auth/signup', signupBody('d1@example.com', { device }), {}, '10.1.0.1'))
        .statusCode,
    ).toBe(201);
    expect(
      (await post('/v1/auth/signup', signupBody('d2@example.com', { device }), {}, '10.1.0.2'))
        .statusCode,
    ).toBe(201);
    const third = await post(
      '/v1/auth/signup',
      signupBody('d3@example.com', { device }),
      {},
      '10.1.0.3',
    );
    expect(third.statusCode).toBe(429);
    expect(third.json().error.code).toBe('device_limit');
    // Another device is unaffected, and so is a device token that is not valid (web-style).
    const other = { platform: 'android', token: 'dev:pixel-9999' };
    expect(
      (
        await post(
          '/v1/auth/signup',
          signupBody('d3@example.com', { device: other }),
          {},
          '10.1.0.4',
        )
      ).statusCode,
    ).toBe(201);
  });
});

describe('sign-in', () => {
  it('gives the same answer for a wrong password and an unknown email', async () => {
    await createUser(h);
    const wrong = await post('/v1/auth/login', {
      email: 'panda@example.com',
      password: 'wrong password',
    });
    const unknown = await post('/v1/auth/login', {
      email: 'nobody@example.com',
      password: 'wrong password',
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.json()).toEqual(wrong.json());
  });

  it('locks an account for a while after 5 failed attempts', async () => {
    await createUser(h);
    for (let i = 0; i < 5; i++) {
      await post(
        '/v1/auth/login',
        { email: 'panda@example.com', password: 'wrong password' },
        {},
        `10.2.0.${i}`,
      );
    }
    const res = await post(
      '/v1/auth/login',
      { email: 'panda@example.com', password: PASSWORD },
      {},
      '10.2.0.99',
    );
    expect(res.statusCode).toBe(429);
    h.clock.now += 31 * 60_000;
    expect(
      (
        await post(
          '/v1/auth/login',
          { email: 'panda@example.com', password: PASSWORD },
          {},
          '10.2.0.99',
        )
      ).statusCode,
    ).toBe(200);
  });

  it('emails a security notice when another device signs in', async () => {
    await createUser(h);
    await truncateOutbox();
    await post('/v1/auth/login', {
      email: 'panda@example.com',
      password: PASSWORD,
      deviceLabel: 'Pixel 9',
    });
    const mails = await mailbox(h);
    expect(mails.map((m) => m.message.template)).toEqual(['new-device']);
    expect(JSON.stringify(mails[0]?.message)).toContain('Pixel 9');
  });
});

async function truncateOutbox() {
  await h.db.query('DELETE FROM outbox');
}

describe('staying signed in', () => {
  it('rotates refresh tokens', async () => {
    const t = await createUser(h);
    const res = await post('/v1/auth/refresh', { refreshToken: t.refreshToken });
    expect(res.statusCode).toBe(200);
    const next = res.json<Tokens>();
    expect(next.refreshToken).not.toBe(t.refreshToken);
    expect((await h.app.inject({ url: '/v1/account', headers: auth(next) })).statusCode).toBe(200);
  });

  it('tolerates a retried refresh (lost response, two tabs) within the grace window', async () => {
    const t = await createUser(h);
    const [a, b] = await Promise.all([
      post('/v1/auth/refresh', { refreshToken: t.refreshToken }),
      post('/v1/auth/refresh', { refreshToken: t.refreshToken }),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(
      (await post('/v1/auth/refresh', { refreshToken: b.json<Tokens>().refreshToken })).statusCode,
    ).toBe(200);
  });

  it('signs the device out if an old refresh token is replayed later (theft)', async () => {
    const t = await createUser(h);
    const next = (await post('/v1/auth/refresh', { refreshToken: t.refreshToken })).json<Tokens>();
    h.clock.now += REFRESH_GRACE_MS + 1000;
    const replay = await post('/v1/auth/refresh', { refreshToken: t.refreshToken });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.code).toBe('session_ended');
    // The whole family is revoked: the legitimate newer token and its access token stop working.
    expect((await post('/v1/auth/refresh', { refreshToken: next.refreshToken })).statusCode).toBe(
      401,
    );
    expect((await h.app.inject({ url: '/v1/account', headers: auth(next) })).statusCode).toBe(401);
  });

  it('expires access tokens and refresh tokens', async () => {
    const t = await createUser(h);
    h.clock.now += 16 * 60_000;
    const res = await h.app.inject({ url: '/v1/account', headers: auth(t) });
    expect(res.json().error.code).toBe('token_expired');
    h.clock.now += 31 * 86_400_000;
    expect((await post('/v1/auth/refresh', { refreshToken: t.refreshToken })).statusCode).toBe(401);
  });

  it('signs out one device without affecting another', async () => {
    const phone = await createUser(h);
    const laptop = (
      await post('/v1/auth/login', { email: 'panda@example.com', password: PASSWORD })
    ).json<Tokens>();
    expect((await post('/v1/auth/logout', { refreshToken: phone.refreshToken })).statusCode).toBe(
      204,
    );
    expect((await h.app.inject({ url: '/v1/account', headers: auth(phone) })).statusCode).toBe(401);
    expect((await h.app.inject({ url: '/v1/account', headers: auth(laptop) })).statusCode).toBe(
      200,
    );
  });
});

describe('recovery', () => {
  it('resets a forgotten password with a single-use emailed link', async () => {
    const old = await createUser(h);
    await truncateOutbox();
    expect(
      (await post('/v1/auth/password/forgot', { email: 'PANDA@example.com' })).statusCode,
    ).toBe(202);
    const [mail] = await mailbox(h);
    const token = linkToken(mail?.message as EmailMessage, 'reset');

    const res = await post('/v1/auth/password/reset', { token, password: 'a brand new password' });
    expect(res.statusCode).toBe(200);
    expect(
      (await post('/v1/auth/password/reset', { token, password: 'another new password' }))
        .statusCode,
    ).toBe(400);
    // Every old sign-in is ended; the new password works and the old one does not.
    expect((await post('/v1/auth/refresh', { refreshToken: old.refreshToken })).statusCode).toBe(
      401,
    );
    expect(
      (
        await post('/v1/auth/login', {
          email: 'panda@example.com',
          password: 'a brand new password',
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await post('/v1/auth/login', { email: 'panda@example.com', password: PASSWORD })).statusCode,
    ).toBe(401);
    expect((await mailbox(h)).map((m) => m.message.template)).toContain('password-changed');
  });

  it('expires reset links after 30 minutes', async () => {
    await createUser(h);
    await truncateOutbox();
    await post('/v1/auth/password/forgot', { email: 'panda@example.com' });
    const token = linkToken((await mailbox(h))[0]?.message as EmailMessage, 'reset');
    h.clock.now += 31 * 60_000;
    expect(
      (await post('/v1/auth/password/reset', { token, password: 'a brand new password' }))
        .statusCode,
    ).toBe(400);
  });

  it('does not reveal whether an email has an account', async () => {
    const res = await post('/v1/auth/password/forgot', { email: 'nobody@example.com' });
    expect(res.statusCode).toBe(202);
    expect(await mailbox(h)).toHaveLength(0);
  });

  it('changes the password, keeps this device signed in and signs out the others', async () => {
    const here = await createUser(h);
    const other = (
      await post('/v1/auth/login', { email: 'panda@example.com', password: PASSWORD })
    ).json<Tokens>();
    const body = { current: PASSWORD, next: 'an even better password' };
    const headers = { ...auth(here), 'idempotency-key': 'change-0001' };
    expect((await post('/v1/auth/password/change', body, headers)).statusCode).toBe(200);
    // A retry with the same key is answered from the stored result, not refused.
    expect((await post('/v1/auth/password/change', body, headers)).statusCode).toBe(200);
    expect((await h.app.inject({ url: '/v1/account', headers: auth(here) })).statusCode).toBe(200);
    expect((await h.app.inject({ url: '/v1/account', headers: auth(other) })).statusCode).toBe(401);
    expect(
      (
        await post(
          '/v1/auth/password/change',
          { current: 'wrong', next: 'whatever123456' },
          auth(here),
        )
      ).statusCode,
    ).toBe(401);
  });
});
