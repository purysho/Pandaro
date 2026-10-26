import { z } from 'zod';

const csv = z
  .string()
  .default('')
  .transform((s) =>
    s
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** One or more Postgres URLs. With several, the pool fails over to the first writable one. */
  DATABASE_URLS: csv,
  DATABASE_URL: z.string().optional(),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  /** Public origin of the API, used in email links and as the token issuer. */
  PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  /** Web app origin, used in email links. */
  APP_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGINS: csv,
  /** Secret mixed into password hashes and lookup hashes (base64, at least 32 bytes). */
  PEPPER: z.string().optional(),
  /** Ed25519 signing key for access tokens, PKCS#8 PEM, base64-encoded. */
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_KEY_ID: z.string().default('k1'),
  /** Extra public keys accepted during rotation: "kid:base64pem,kid:base64pem". */
  JWT_PREVIOUS_PUBLIC_KEYS: csv,
  /** Key-encryption keys: "kid:base64key,kid:base64key" (32-byte keys). */
  KEKS: csv,
  ACTIVE_KEK: z.string().optional(),
  ARGON2_MEMORY_KIB: z.coerce.number().int().min(8192).default(65536),
  ARGON2_ITERATIONS: z.coerce.number().int().min(1).default(3),
  ACCESS_TOKEN_TTL_S: z.coerce.number().int().min(60).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  /** Check new passwords against the Have I Been Pwned range API (sends a 5-char hash prefix). */
  PWNED_CHECK: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** "log" writes emails to the outbox table only; "postmark" sends with the Postmark API. */
  MAIL_TRANSPORT: z.enum(['log', 'postmark']).default('log'),
  POSTMARK_TOKEN: z.string().optional(),
  MAIL_FROM: z.string().default('Pandaro <no-reply@example.invalid>'),
  /** Accept "dev:<id>" device tokens instead of DeviceCheck / Play Integrity. Never in production. */
  DEVICE_ATTESTATION: z.enum(['off', 'dev', 'real']).default('off'),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  INSTANCE_ID: z.string().default('api'),
});

export type Env = z.infer<typeof envSchema>;

export interface Config extends Omit<Env, 'DATABASE_URL'> {
  databaseUrls: string[];
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const env = envSchema.parse(source);
  const databaseUrls = env.DATABASE_URLS.length
    ? env.DATABASE_URLS
    : env.DATABASE_URL
      ? [env.DATABASE_URL]
      : [];
  if (databaseUrls.length === 0) throw new Error('DATABASE_URL or DATABASE_URLS is required');

  if (env.NODE_ENV === 'production') {
    const missing = (['PEPPER', 'JWT_PRIVATE_KEY', 'ACTIVE_KEK'] as const).filter((k) => !env[k]);
    if (missing.length) throw new Error(`Missing required secrets: ${missing.join(', ')}`);
    if (env.DEVICE_ATTESTATION === 'dev') throw new Error('DEVICE_ATTESTATION=dev is not allowed');
    if (env.ARGON2_MEMORY_KIB < 65536) throw new Error('ARGON2_MEMORY_KIB must be at least 65536');
    if (env.MAIL_TRANSPORT === 'postmark' && !env.POSTMARK_TOKEN)
      throw new Error('POSTMARK_TOKEN is required for MAIL_TRANSPORT=postmark');
  }
  const rest: Partial<Env> = { ...env };
  delete rest.DATABASE_URL;
  return { ...(rest as Omit<Env, 'DATABASE_URL'>), databaseUrls };
}
