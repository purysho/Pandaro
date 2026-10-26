import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = { DATABASE_URL: 'postgres://x/y' };

describe('config', () => {
  it('needs a database', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
    expect(loadConfig({ DATABASE_URLS: 'postgres://a/x, postgres://b/x' }).databaseUrls).toEqual([
      'postgres://a/x',
      'postgres://b/x',
    ]);
  });

  it('refuses to start in production without secrets or with weak settings', () => {
    const prod = { ...base, NODE_ENV: 'production' };
    expect(() => loadConfig(prod)).toThrow(/PEPPER, JWT_PRIVATE_KEY, ACTIVE_KEK/);
    const secrets = { ...prod, PEPPER: 'p', JWT_PRIVATE_KEY: 'k', ACTIVE_KEK: 'k1' };
    expect(() => loadConfig({ ...secrets, DEVICE_ATTESTATION: 'dev' })).toThrow(/not allowed/);
    expect(() => loadConfig({ ...secrets, ARGON2_MEMORY_KIB: '16384' })).toThrow(/65536/);
    expect(() => loadConfig({ ...secrets, MAIL_TRANSPORT: 'postmark' })).toThrow(/POSTMARK_TOKEN/);
    expect(loadConfig(secrets).ARGON2_MEMORY_KIB).toBe(65536);
  });
});
