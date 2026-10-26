import { createHash, randomUUID } from 'node:crypto';
import { decryptWith, encryptWith } from '../crypto/keys.js';
import { lookupHash, newToken, normalizeEmail, sha256 } from '../crypto/hashing.js';
import { HttpError, newDek, userDek, type Context } from '../context.js';
import type { Queryable } from '../db/pool.js';
import { enqueue } from '../email/outbox.js';
import { deviceSignupsAllowed, type DeviceProof } from '../lib/device.js';
import { LIMITS, type Limit } from '../lib/rateLimit.js';
import { LEGAL_VERSIONS, OPTIONAL_CONSENTS, type OptionalConsent } from '../legal.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  userId: string;
}

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 256;
/** A refresh token used again within this window (a retry, or two tabs) is not treated as theft. */
export const REFRESH_GRACE_MS = 30_000;
const VERIFY_TTL_MS = 24 * 3600_000;
const RESET_TTL_MS = 30 * 60_000;
/** Repeating a sign-up this soon with the same password signs in instead of failing. */
const SIGNUP_REPLAY_MS = 10 * 60_000;

const emailHash = (ctx: Context, email: string) =>
  lookupHash(ctx.pepper, 'email', normalizeEmail(email));
const ipHash = (ctx: Context, ip: string) => lookupHash(ctx.pepper, 'ip', ip);

async function limit(ctx: Context, key: string, l: Limit) {
  const r = await ctx.limiter.hit(key, l, ctx.now());
  if (!r.allowed) {
    throw new HttpError(
      429,
      'rate_limited',
      'Too many attempts. Please wait a little and try again.',
      r.retryAfter,
    );
  }
}

async function securityEvent(
  ctx: Context,
  q: Queryable,
  userId: string,
  kind: string,
  ip?: string,
) {
  await q.query('INSERT INTO security_events (user_id, kind, ip_hash) VALUES ($1, $2, $3)', [
    userId,
    kind,
    ip ? ipHash(ctx, ip) : null,
  ]);
}

/** k-anonymity check against Have I Been Pwned (only the first 5 hex chars of SHA-1 leave). */
async function isPwned(password: string): Promise<boolean> {
  const hash = createHash('sha1').update(password).digest('hex').toUpperCase();
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return false;
    const suffix = hash.slice(5);
    return (await res.text())
      .split('\n')
      .some((line) => line.startsWith(suffix) && !line.trim().endsWith(':0'));
  } catch {
    return false; // never block sign-up because the check is unavailable
  }
}

export async function checkPassword(ctx: Context, password: string, email?: string) {
  if (password.length < PASSWORD_MIN)
    throw new HttpError(400, 'weak_password', `Use at least ${PASSWORD_MIN} characters.`);
  if (password.length > PASSWORD_MAX)
    throw new HttpError(400, 'weak_password', `Use at most ${PASSWORD_MAX} characters.`);
  if (email && normalizeEmail(password) === normalizeEmail(email))
    throw new HttpError(400, 'weak_password', 'Your password cannot be your email address.');
  if (ctx.config.PWNED_CHECK && (await isPwned(password)))
    throw new HttpError(
      400,
      'weak_password',
      'This password has appeared in a data breach. Please choose another.',
    );
}

export async function issueTokens(
  ctx: Context,
  q: Queryable,
  userId: string,
  familyId: string = randomUUID(),
  deviceLabel: string | null = null,
): Promise<TokenPair> {
  const { token, hash } = newToken();
  const expires = new Date(ctx.now() + ctx.config.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  await q.query(
    `INSERT INTO refresh_tokens (id, family_id, user_id, token_hash, device_label, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), familyId, userId, hash, deviceLabel, expires],
  );
  return {
    accessToken: await ctx.tokens.sign({ sub: userId, fam: familyId }, ctx.now()),
    refreshToken: token,
    expiresIn: ctx.tokens.ttl,
    userId,
  };
}

async function sendVerification(ctx: Context, q: Queryable, userId: string, email: string) {
  const { token, hash } = newToken();
  await q.query(
    `INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES ($1, $2, 'verify', $3)`,
    [hash, userId, new Date(ctx.now() + VERIFY_TTL_MS)],
  );
  await enqueue(q, ctx.keys, userId, email, {
    template: 'verify',
    data: { link: `${ctx.config.APP_URL}/#verify=${token}` },
  });
}

export interface SignupInput {
  email: string;
  password: string;
  acceptedTerms: string;
  acceptedPrivacy: string;
  confirmedAge: boolean;
  optional?: Partial<Record<OptionalConsent, boolean>>;
  device?: DeviceProof;
  deviceLabel?: string;
  ip: string;
}

export async function signup(ctx: Context, input: SignupInput): Promise<TokenPair> {
  if (
    input.acceptedTerms !== LEGAL_VERSIONS.terms ||
    input.acceptedPrivacy !== LEGAL_VERSIONS.privacy
  )
    throw new HttpError(
      409,
      'legal_outdated',
      'The Terms or Privacy Policy have been updated. Please review them again.',
    );
  if (!input.confirmedAge)
    throw new HttpError(400, 'age_required', 'You must be old enough to create an account.');

  const hash = emailHash(ctx, input.email);

  // A retried sign-up (for example after a server switch) signs in instead of failing.
  const existing = await ctx.db.query<{ id: string; password_hash: string; created_at: Date }>(
    'SELECT id, password_hash, created_at FROM users WHERE email_hash = $1',
    [hash],
  );
  const prior = existing.rows[0];
  if (prior) {
    const recent = ctx.now() - prior.created_at.getTime() < SIGNUP_REPLAY_MS;
    if (recent && (await ctx.passwords.verify(prior.password_hash, input.password))) {
      return issueTokens(ctx, ctx.db, prior.id, undefined, input.deviceLabel ?? null);
    }
    await limit(ctx, `signup:ip:${input.ip}`, LIMITS.signupPerIp);
    throw new HttpError(409, 'email_taken', 'An account with this email already exists.');
  }

  await limit(ctx, `signup:ip:${input.ip}`, LIMITS.signupPerIp);
  await checkPassword(ctx, input.password, input.email);

  let deviceHash: Buffer | null = null;
  if (input.device) {
    const deviceId = await ctx.devices.verify(input.device);
    if (deviceId) {
      deviceHash = lookupHash(ctx.pepper, 'device', deviceId);
      if (!(await deviceSignupsAllowed(ctx.db, deviceHash, ctx.now())))
        throw new HttpError(
          429,
          'device_limit',
          'This device has created the maximum number of new accounts for now. Please sign in to an existing account instead.',
        );
    }
  }

  const passwordHash = await ctx.passwords.hash(input.password);
  const userId = randomUUID();
  const email = normalizeEmail(input.email);

  try {
    return await ctx.db.transaction(async (tx) => {
      const { dek, wrapped, kid } = await newDek(ctx, userId);
      const emailEnc = encryptWith(dek, Buffer.from(email, 'utf8'), `${userId}:email`);
      await tx.query(
        `INSERT INTO users (id, email_hash, email_enc, password_hash, dek_wrapped, dek_kid)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, hash, emailEnc, passwordHash, wrapped, kid],
      );
      ctx.deks.set(userId, dek);
      const consentRows: [string, string, boolean][] = [
        ['terms', LEGAL_VERSIONS.terms, true],
        ['privacy', LEGAL_VERSIONS.privacy, true],
        ['age', 'self-declared', true],
        ...OPTIONAL_CONSENTS.map(
          (k) =>
            [k, LEGAL_VERSIONS.privacy, input.optional?.[k] === true] as [string, string, boolean],
        ),
      ];
      for (const [kind, version, granted] of consentRows) {
        await tx.query(
          'INSERT INTO consents (user_id, kind, version, granted) VALUES ($1, $2, $3, $4)',
          [userId, kind, version, granted],
        );
      }
      if (deviceHash)
        await tx.query('INSERT INTO device_signups (device_hash) VALUES ($1)', [deviceHash]);
      await securityEvent(ctx, tx, userId, 'signup', input.ip);
      await sendVerification(ctx, tx, userId, email);
      return issueTokens(ctx, tx, userId, undefined, input.deviceLabel ?? null);
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505')
      throw new HttpError(409, 'email_taken', 'An account with this email already exists.');
    throw error;
  }
}

const BAD_LOGIN = () =>
  new HttpError(401, 'bad_credentials', 'That email and password do not match.');

export async function login(
  ctx: Context,
  input: { email: string; password: string; deviceLabel?: string; ip: string },
): Promise<TokenPair> {
  const hash = emailHash(ctx, input.email);
  const accountKey = `login:acct:${hash.toString('hex')}`;
  await limit(ctx, `login:ip:${input.ip}`, LIMITS.loginPerIp);
  await limit(ctx, accountKey, LIMITS.loginPerAccount);

  const { rows } = await ctx.db.query<{ id: string; password_hash: string }>(
    'SELECT id, password_hash FROM users WHERE email_hash = $1',
    [hash],
  );
  const user = rows[0];
  if (!user) {
    await ctx.passwords.verifyDummy(input.password);
    throw BAD_LOGIN();
  }
  if (!(await ctx.passwords.verify(user.password_hash, input.password))) {
    await securityEvent(ctx, ctx.db, user.id, 'login_failed', input.ip);
    throw BAD_LOGIN();
  }
  await ctx.limiter.reset(accountKey);

  if (ctx.passwords.needsRehash(user.password_hash)) {
    await ctx.db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [
      user.id,
      await ctx.passwords.hash(input.password),
    ]);
  }

  return ctx.db.transaction(async (tx) => {
    const { rows: others } = await tx.query<{ n: number }>(
      `SELECT count(DISTINCT family_id)::int AS n FROM refresh_tokens
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [user.id],
    );
    await securityEvent(ctx, tx, user.id, 'login', input.ip);
    if ((others[0]?.n ?? 0) > 0) {
      const email = await readEmail(ctx, user.id, tx);
      await enqueue(tx, ctx.keys, user.id, email, {
        template: 'new-device',
        data: {
          at: new Date(ctx.now()).toUTCString(),
          device: input.deviceLabel ?? 'unknown device',
        },
      });
    }
    return issueTokens(ctx, tx, user.id, undefined, input.deviceLabel ?? null);
  });
}

export async function readEmail(
  ctx: Context,
  userId: string,
  q: Queryable = ctx.db,
): Promise<string> {
  const { rows } = await q.query<{ email_enc: Buffer }>(
    'SELECT email_enc FROM users WHERE id = $1',
    [userId],
  );
  if (!rows[0]) throw new HttpError(401, 'account_not_found', 'This account no longer exists.');
  const dek = await userDek(ctx, userId, q);
  return decryptWith(dek, rows[0].email_enc, `${userId}:email`).toString('utf8');
}

const SESSION_ENDED = () =>
  new HttpError(401, 'session_ended', 'You have been signed out. Please sign in again.');

/**
 * Exchange a refresh token for a new pair. The old token is marked used. Using it again after the
 * grace window means it was copied, so the whole family (that device's sign-in) is revoked.
 */
export async function refresh(ctx: Context, refreshToken: string): Promise<TokenPair> {
  const hash = sha256(refreshToken);
  const outcome = await ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{
      family_id: string;
      user_id: string;
      expires_at: Date;
      used_at: Date | null;
      revoked_at: Date | null;
      device_label: string | null;
    }>(
      `SELECT family_id, user_id, expires_at, used_at, revoked_at, device_label
         FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
      [hash],
    );
    const row = rows[0];
    if (!row || row.revoked_at || row.expires_at.getTime() <= ctx.now()) return null;
    if (row.used_at && ctx.now() - row.used_at.getTime() > REFRESH_GRACE_MS) {
      await tx.query('UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1', [
        row.family_id,
      ]);
      await securityEvent(ctx, tx, row.user_id, 'refresh_reuse');
      return 'reuse' as const;
    }
    await limit(ctx, `refresh:${row.family_id}`, LIMITS.refreshPerFamily);
    if (!row.used_at) {
      await tx.query('UPDATE refresh_tokens SET used_at = $2 WHERE token_hash = $1', [
        hash,
        new Date(ctx.now()),
      ]);
    }
    return issueTokens(ctx, tx, row.user_id, row.family_id, row.device_label);
  });
  if (!outcome || outcome === 'reuse') throw SESSION_ENDED();
  return outcome;
}

export async function logout(ctx: Context, refreshToken: string): Promise<void> {
  await ctx.db.query(
    `UPDATE refresh_tokens SET revoked_at = now()
      WHERE family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = $1) AND revoked_at IS NULL`,
    [sha256(refreshToken)],
  );
}

export async function logoutEverywhere(
  ctx: Context,
  q: Queryable,
  userId: string,
  keepFamily?: string,
) {
  await q.query(
    `UPDATE refresh_tokens SET revoked_at = now()
      WHERE user_id = $1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR family_id <> $2::uuid)`,
    [userId, keepFamily ?? null],
  );
}

/** Rejects access tokens whose sign-in was revoked (sign-out, password change, theft). */
export async function familyActive(ctx: Context, familyId: string): Promise<boolean> {
  const { rows } = await ctx.db.query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM refresh_tokens
       WHERE family_id = $1 AND revoked_at IS NULL AND expires_at > now()) AS ok`,
    [familyId],
  );
  return rows[0]?.ok === true;
}

async function consumeEmailToken(
  ctx: Context,
  q: Queryable,
  token: string,
  purpose: 'verify' | 'reset',
) {
  const { rows } = await q.query<{ user_id: string }>(
    `UPDATE email_tokens SET used_at = now()
      WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > $3
      RETURNING user_id`,
    [sha256(token), purpose, new Date(ctx.now())],
  );
  return rows[0]?.user_id ?? null;
}

export async function verifyEmail(ctx: Context, token: string): Promise<void> {
  const ok = await ctx.db.transaction(async (tx) => {
    const userId = await consumeEmailToken(ctx, tx, token, 'verify');
    if (!userId) return false;
    await tx.query(
      'UPDATE users SET email_verified_at = now() WHERE id = $1 AND email_verified_at IS NULL',
      [userId],
    );
    return true;
  });
  if (!ok) throw new HttpError(400, 'link_invalid', 'This link has expired or was already used.');
}

export async function resendVerification(ctx: Context, userId: string): Promise<void> {
  await limit(ctx, `verify:${userId}`, LIMITS.verifyResendPerAccount);
  await ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ verified: boolean }>(
      'SELECT email_verified_at IS NOT NULL AS verified FROM users WHERE id = $1',
      [userId],
    );
    if (!rows[0] || rows[0].verified) return;
    await sendVerification(ctx, tx, userId, await readEmail(ctx, userId, tx));
  });
}

/** Always succeeds from the caller's view, so it cannot be used to find out who has an account. */
export async function requestReset(ctx: Context, email: string, ip: string): Promise<void> {
  const hash = emailHash(ctx, email);
  await limit(ctx, `reset:ip:${ip}`, LIMITS.resetPerIp);
  await limit(ctx, `reset:acct:${hash.toString('hex')}`, LIMITS.resetPerAccount);
  const { rows } = await ctx.db.query<{ id: string }>(
    'SELECT id FROM users WHERE email_hash = $1',
    [hash],
  );
  const user = rows[0];
  if (!user) return;
  await ctx.db.transaction(async (tx) => {
    const { token, hash: tokenHash } = newToken();
    await tx.query(
      `INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES ($1, $2, 'reset', $3)`,
      [tokenHash, user.id, new Date(ctx.now() + RESET_TTL_MS)],
    );
    await enqueue(tx, ctx.keys, user.id, await readEmail(ctx, user.id, tx), {
      template: 'reset',
      data: { link: `${ctx.config.APP_URL}/#reset=${token}` },
    });
    await securityEvent(ctx, tx, user.id, 'reset_requested', ip);
  });
}

async function setPassword(
  ctx: Context,
  q: Queryable,
  userId: string,
  password: string,
  ip?: string,
) {
  await q.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [
    userId,
    await ctx.passwords.hash(password),
  ]);
  await q.query(
    `UPDATE email_tokens SET used_at = now() WHERE user_id = $1 AND purpose = 'reset' AND used_at IS NULL`,
    [userId],
  );
  await securityEvent(ctx, q, userId, 'password_changed', ip);
  await enqueue(q, ctx.keys, userId, await readEmail(ctx, userId, q), {
    template: 'password-changed',
    data: { at: new Date(ctx.now()).toUTCString() },
  });
}

/** Reset with an emailed link. Signs out every device; the caller gets a fresh sign-in. */
export async function resetPassword(
  ctx: Context,
  input: { token: string; password: string; deviceLabel?: string; ip: string },
): Promise<TokenPair> {
  await checkPassword(ctx, input.password);
  const result = await ctx.db.transaction(async (tx) => {
    const userId = await consumeEmailToken(ctx, tx, input.token, 'reset');
    if (!userId) return null;
    await setPassword(ctx, tx, userId, input.password, input.ip);
    // Following the emailed link proves the address.
    await tx.query(
      'UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1',
      [userId],
    );
    await logoutEverywhere(ctx, tx, userId);
    return issueTokens(ctx, tx, userId, undefined, input.deviceLabel ?? null);
  });
  if (!result)
    throw new HttpError(400, 'link_invalid', 'This link has expired or was already used.');
  return result;
}

/** Change password while signed in. Other devices are signed out; this one stays signed in. */
export async function changePassword(
  ctx: Context,
  input: { userId: string; familyId: string; current: string; next: string; ip: string },
): Promise<void> {
  const { rows } = await ctx.db.query<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [input.userId],
  );
  const user = rows[0];
  if (!user || !(await ctx.passwords.verify(user.password_hash, input.current)))
    throw new HttpError(401, 'bad_credentials', 'Your current password is not correct.');
  await checkPassword(ctx, input.next);
  await ctx.db.transaction(async (tx) => {
    await setPassword(ctx, tx, input.userId, input.next, input.ip);
    await logoutEverywhere(ctx, tx, input.userId, input.familyId);
  });
}
