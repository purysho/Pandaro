import { randomBytes } from 'node:crypto';
import type { Config } from './config.js';
import { PasswordHasher } from './crypto/hashing.js';
import { AccessTokens } from './crypto/jwt.js';
import { DekCache, EnvKeyProvider, type KeyProvider } from './crypto/keys.js';
import type { Database, Queryable } from './db/pool.js';
import {
  devDeviceVerifier,
  noDeviceVerifier,
  unconfiguredRealVerifier,
  type DeviceVerifier,
} from './lib/device.js';
import { RateLimiter } from './lib/rateLimit.js';

/** Everything a request handler needs. Built once per process. */
export interface Context {
  config: Config;
  db: Database;
  keys: KeyProvider;
  deks: DekCache;
  pepper: Buffer;
  passwords: PasswordHasher;
  tokens: AccessTokens;
  limiter: RateLimiter;
  devices: DeviceVerifier;
  now: () => number;
}

/** Fixed development pepper, so local instances agree. Production requires PEPPER. */
const DEV_PEPPER = Buffer.from('pandaro-development-pepper-not-secret-000', 'utf8');

export function createContext(
  config: Config,
  db: Database,
  overrides: Partial<Context> = {},
): Context {
  const pepper = config.PEPPER ? Buffer.from(config.PEPPER, 'base64') : DEV_PEPPER;
  if (pepper.length < 32) throw new Error('PEPPER must be at least 32 bytes');
  const keys =
    config.KEKS.length > 0
      ? new EnvKeyProvider(config.KEKS, config.ACTIVE_KEK)
      : EnvKeyProvider.ephemeral();
  const devices =
    config.DEVICE_ATTESTATION === 'dev'
      ? devDeviceVerifier
      : config.DEVICE_ATTESTATION === 'real'
        ? unconfiguredRealVerifier
        : noDeviceVerifier;
  return {
    config,
    db,
    keys,
    deks: new DekCache(),
    pepper,
    passwords: new PasswordHasher(pepper, {
      memoryKiB: config.ARGON2_MEMORY_KIB,
      iterations: config.ARGON2_ITERATIONS,
    }),
    tokens: AccessTokens.fromConfig({
      privateKeyB64: config.JWT_PRIVATE_KEY,
      kid: config.JWT_KEY_ID,
      previous: config.JWT_PREVIOUS_PUBLIC_KEYS,
      issuer: config.PUBLIC_URL,
      ttlSeconds: config.ACCESS_TOKEN_TTL_S,
    }),
    limiter: new RateLimiter(db),
    devices,
    now: Date.now,
    ...overrides,
  };
}

const dekAad = (userId: string) => `dek:${userId}`;

/** A fresh data key for a new user, and its wrapped form for storage. */
export async function newDek(ctx: Context, userId: string) {
  const dek = randomBytes(32);
  const wrapped = await ctx.keys.encrypt(dek, dekAad(userId));
  return { dek, wrapped, kid: ctx.keys.activeKid };
}

export async function userDek(
  ctx: Context,
  userId: string,
  q: Queryable = ctx.db,
): Promise<Buffer> {
  const cached = ctx.deks.get(userId);
  if (cached) return cached;
  const { rows } = await q.query<{ dek_wrapped: Buffer }>(
    'SELECT dek_wrapped FROM users WHERE id = $1',
    [userId],
  );
  const row = rows[0];
  if (!row) throw new HttpError(401, 'account_not_found', 'This account no longer exists.');
  const dek = await ctx.keys.decrypt(row.dek_wrapped, dekAad(userId));
  ctx.deks.set(userId, dek);
  return dek;
}

export { dekAad };

/** Errors with a stable code the client can act on, and a message safe to show. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}
