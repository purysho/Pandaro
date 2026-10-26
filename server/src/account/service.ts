import { createHmac } from 'node:crypto';
import { safeEqual } from '../crypto/hashing.js';
import { HttpError, type Context } from '../context.js';
import { enqueue } from '../email/outbox.js';
import { LEGAL_VERSIONS, OPTIONAL_CONSENTS, type OptionalConsent } from '../legal.js';
import { readEmail } from '../auth/service.js';
import { allRecords } from '../sync/service.js';

export interface AccountView {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  consents: Record<string, { granted: boolean; version: string; at: string }>;
  /** True when the user agreed to older Terms or Privacy Policy versions than the current ones. */
  legalUpdateNeeded: boolean;
  legalVersions: typeof LEGAL_VERSIONS;
  devices: { label: string | null; signedInAt: string; current: boolean }[];
}

async function latestConsents(ctx: Context, userId: string) {
  const { rows } = await ctx.db.query<{
    kind: string;
    version: string;
    granted: boolean;
    at: Date;
  }>(
    `SELECT DISTINCT ON (kind) kind, version, granted, at FROM consents
      WHERE user_id = $1 ORDER BY kind, at DESC, id DESC`,
    [userId],
  );
  return Object.fromEntries(
    rows.map((r) => [r.kind, { granted: r.granted, version: r.version, at: r.at.toISOString() }]),
  );
}

export async function getAccount(
  ctx: Context,
  userId: string,
  familyId: string,
): Promise<AccountView> {
  const { rows } = await ctx.db.query<{ created_at: Date; email_verified_at: Date | null }>(
    'SELECT created_at, email_verified_at FROM users WHERE id = $1',
    [userId],
  );
  const user = rows[0];
  if (!user) throw new HttpError(401, 'account_not_found', 'This account no longer exists.');
  const consents = await latestConsents(ctx, userId);
  const { rows: devices } = await ctx.db.query<{
    family_id: string;
    device_label: string | null;
    first: Date;
  }>(
    `SELECT family_id, max(device_label) AS device_label, min(created_at) AS first FROM refresh_tokens
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
      GROUP BY family_id ORDER BY first`,
    [userId],
  );
  return {
    id: userId,
    email: await readEmail(ctx, userId),
    emailVerified: user.email_verified_at !== null,
    createdAt: user.created_at.toISOString(),
    consents,
    legalUpdateNeeded:
      consents.terms?.version !== LEGAL_VERSIONS.terms ||
      consents.privacy?.version !== LEGAL_VERSIONS.privacy,
    legalVersions: LEGAL_VERSIONS,
    devices: devices.map((d) => ({
      label: d.device_label,
      signedInAt: d.first.toISOString(),
      current: d.family_id === familyId,
    })),
  };
}

export interface ConsentUpdate {
  optional?: Partial<Record<OptionalConsent, boolean>>;
  acceptedTerms?: string;
  acceptedPrivacy?: string;
}

/** Record changed consents as new rows, so the history stays auditable. */
export async function updateConsents(ctx: Context, userId: string, update: ConsentUpdate) {
  if (update.acceptedTerms && update.acceptedTerms !== LEGAL_VERSIONS.terms)
    throw new HttpError(409, 'legal_outdated', 'Please review the latest Terms.');
  if (update.acceptedPrivacy && update.acceptedPrivacy !== LEGAL_VERSIONS.privacy)
    throw new HttpError(409, 'legal_outdated', 'Please review the latest Privacy Policy.');
  const current = await latestConsents(ctx, userId);
  const rows: [string, string, boolean][] = [];
  if (update.acceptedTerms) rows.push(['terms', update.acceptedTerms, true]);
  if (update.acceptedPrivacy) rows.push(['privacy', update.acceptedPrivacy, true]);
  for (const kind of OPTIONAL_CONSENTS) {
    const next = update.optional?.[kind];
    if (next !== undefined && current[kind]?.granted !== next)
      rows.push([kind, LEGAL_VERSIONS.privacy, next]);
  }
  await ctx.db.transaction(async (tx) => {
    for (const [kind, version, granted] of rows) {
      await tx.query(
        'INSERT INTO consents (user_id, kind, version, granted) VALUES ($1, $2, $3, $4)',
        [userId, kind, version, granted],
      );
    }
  });
}

/** Everything Pandaro holds about the account, decrypted (GDPR access and portability). */
export async function exportAccount(ctx: Context, userId: string, familyId: string) {
  const account = await getAccount(ctx, userId, familyId);
  const { rows: consentHistory } = await ctx.db.query(
    'SELECT kind, version, granted, at FROM consents WHERE user_id = $1 ORDER BY at, id',
    [userId],
  );
  const { rows: events } = await ctx.db.query(
    'SELECT kind, at FROM security_events WHERE user_id = $1 ORDER BY at',
    [userId],
  );
  return {
    format: 'pandaro-account-export',
    version: 1,
    exportedAt: new Date(ctx.now()).toISOString(),
    account,
    consentHistory,
    securityEvents: events,
    records: await allRecords(ctx, userId),
  };
}

/**
 * Delete the account and everything synced to it. A confirmation goes to the address first
 * (queued in the same transaction). Repeating the request after success also succeeds.
 */
export async function deleteAccount(ctx: Context, userId: string, password: string): Promise<void> {
  const { rows } = await ctx.db.query<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId],
  );
  const user = rows[0];
  if (!user) return;
  if (!(await ctx.passwords.verify(user.password_hash, password)))
    throw new HttpError(401, 'bad_credentials', 'Your password is not correct.');
  const email = await readEmail(ctx, userId);
  await ctx.db.transaction(async (tx) => {
    await enqueue(tx, ctx.keys, null, email, {
      template: 'account-deleted',
      data: { at: new Date(ctx.now()).toUTCString() },
    });
    await tx.query('DELETE FROM users WHERE id = $1', [userId]);
  });
  ctx.deks.delete(userId);
}

/* One-click unsubscribe links (RFC 8058). The token is an HMAC, so it cannot be forged. */

type Category = 'product_email' | 'weekly_email';

function sign(ctx: Context, userId: string, category: Category) {
  return createHmac('sha256', ctx.pepper).update(`unsub\u0000${userId}\u0000${category}`).digest();
}

export function unsubscribeToken(ctx: Context, userId: string, category: Category): string {
  return `${userId}.${category}.${sign(ctx, userId, category).toString('base64url')}`;
}

export async function unsubscribe(ctx: Context, token: string): Promise<boolean> {
  const [userId, category, mac] = token.split('.');
  if (!userId || !mac || (category !== 'product_email' && category !== 'weekly_email'))
    return false;
  if (!/^[0-9a-f-]{36}$/.test(userId)) return false;
  if (!safeEqual(Buffer.from(mac, 'base64url'), sign(ctx, userId, category))) return false;
  const { rowCount } = await ctx.db.query('SELECT 1 FROM users WHERE id = $1', [userId]);
  if (!rowCount) return true; // account already gone: nothing left to send
  await updateConsents(ctx, userId, { optional: { [category]: false } });
  return true;
}

/** Queue a weekly summary for one user, if they opted in. Called by the scheduled job. */
export async function queueWeeklySummary(
  ctx: Context,
  userId: string,
  summary: { minutes: number; sessions: number },
): Promise<boolean> {
  const consents = await latestConsents(ctx, userId);
  if (!consents.weekly_email?.granted) return false;
  const email = await readEmail(ctx, userId);
  await enqueue(ctx.db, ctx.keys, userId, email, {
    template: 'weekly',
    data: {
      ...summary,
      unsubscribe: `${ctx.config.PUBLIC_URL}/v1/email/unsubscribe?t=${unsubscribeToken(ctx, userId, 'weekly_email')}`,
    },
  });
  return true;
}
