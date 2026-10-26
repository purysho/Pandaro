import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PasswordHasher, lookupHash, normalizeEmail } from '../src/crypto/hashing.js';
import { AccessTokens } from '../src/crypto/jwt.js';
import { DekCache, EnvKeyProvider, decryptWith, encryptWith, kidOf } from '../src/crypto/keys.js';

const key = () => randomBytes(32).toString('base64');

describe('envelope encryption', () => {
  it('round-trips and binds ciphertext to its record', async () => {
    const kms = new EnvKeyProvider([`a:${key()}`]);
    const blob = await kms.encrypt(Buffer.from('secret'), 'user:task:1');
    expect(blob.includes(Buffer.from('secret'))).toBe(false);
    expect((await kms.decrypt(blob, 'user:task:1')).toString()).toBe('secret');
    await expect(kms.decrypt(blob, 'user:task:2')).rejects.toThrow();
  });

  it('detects tampering', () => {
    const dek = randomBytes(32);
    const blob = encryptWith(dek, Buffer.from('bamboo'), 'aad');
    blob[blob.length - 1] = (blob[blob.length - 1] ?? 0) ^ 1;
    expect(() => decryptWith(dek, blob, 'aad')).toThrow();
  });

  it('keeps old data readable after the active key rotates', async () => {
    const a = key();
    const before = new EnvKeyProvider([`a:${a}`], 'a');
    const blob = await before.encrypt(Buffer.from('wrapped dek'), 'dek:u');
    const after = new EnvKeyProvider([`a:${a}`, `b:${key()}`], 'b');
    expect(kidOf(blob)).toBe('a');
    expect((await after.decrypt(blob, 'dek:u')).toString()).toBe('wrapped dek');
    expect(kidOf(await after.encrypt(Buffer.from('x'), 'dek:u'))).toBe('b');
  });

  it('rejects bad key configuration', () => {
    expect(() => new EnvKeyProvider(['a:c2hvcnQ='])).toThrow(/32 bytes/);
    expect(() => new EnvKeyProvider([`a:${key()}`], 'missing')).toThrow(/ACTIVE_KEK/);
    expect(() => new EnvKeyProvider(['nokid'])).toThrow();
  });

  it('caches data keys briefly', () => {
    const cache = new DekCache(1000, 2);
    const dek = randomBytes(32);
    cache.set('u1', dek, 0);
    expect(cache.get('u1', 500)).toBe(dek);
    expect(cache.get('u1', 1500)).toBeUndefined();
    cache.set('a', dek, 0);
    cache.set('b', dek, 0);
    cache.set('c', dek, 0);
    expect(cache.get('a', 0)).toBeUndefined();
  });
});

describe('access tokens', () => {
  const pem = (k = generateKeyPairSync('ed25519')) => ({
    priv: Buffer.from(k.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string).toString(
      'base64',
    ),
    pub: Buffer.from(k.publicKey.export({ type: 'spki', format: 'pem' }) as string).toString(
      'base64',
    ),
  });

  it('verifies on any instance that shares the key, until expiry', async () => {
    const k = pem();
    const opts = { privateKeyB64: k.priv, kid: 'k1', previous: [], issuer: 'iss', ttlSeconds: 900 };
    const a = AccessTokens.fromConfig(opts);
    const b = AccessTokens.fromConfig(opts);
    const now = Date.now();
    const token = await a.sign({ sub: 'user', fam: 'fam' }, now);
    expect(await b.verify(token, now + 1000)).toEqual({ sub: 'user', fam: 'fam' });
    expect(await b.verify(token, now + 901_000)).toBeNull();
  });

  it('rejects other issuers and unknown keys, and accepts a rotated-out key', async () => {
    const oldKey = pem();
    const newKey = pem();
    const old = AccessTokens.fromConfig({
      privateKeyB64: oldKey.priv,
      kid: 'old',
      previous: [],
      issuer: 'iss',
      ttlSeconds: 900,
    });
    const token = await old.sign({ sub: 'u', fam: 'f' });
    const rotated = AccessTokens.fromConfig({
      privateKeyB64: newKey.priv,
      kid: 'new',
      previous: [`old:${oldKey.pub}`],
      issuer: 'iss',
      ttlSeconds: 900,
    });
    expect(await rotated.verify(token)).toEqual({ sub: 'u', fam: 'f' });
    const stranger = AccessTokens.fromConfig({
      privateKeyB64: newKey.priv,
      kid: 'new',
      previous: [],
      issuer: 'iss',
      ttlSeconds: 900,
    });
    expect(await stranger.verify(token)).toBeNull();
    const otherIssuer = AccessTokens.fromConfig({
      privateKeyB64: oldKey.priv,
      kid: 'old',
      previous: [],
      issuer: 'evil',
      ttlSeconds: 900,
    });
    expect(await otherIssuer.verify(token)).toBeNull();
    expect(await rotated.verify('not.a.token')).toBeNull();
  });
});

describe('passwords', () => {
  const params = { memoryKiB: 8192, iterations: 1 };

  it('uses Argon2id with a pepper', async () => {
    const pepper = randomBytes(32);
    const hasher = new PasswordHasher(pepper, params);
    const hash = await hasher.hash('correct horse battery');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await hasher.verify(hash, 'correct horse battery')).toBe(true);
    expect(await hasher.verify(hash, 'wrong')).toBe(false);
    // Without the pepper (for example from a stolen database alone) the hash does not verify.
    expect(
      await new PasswordHasher(randomBytes(32), params).verify(hash, 'correct horse battery'),
    ).toBe(false);
    expect(await hasher.verifyDummy('anything')).toBe(false);
  });

  it('flags hashes made with weaker parameters', async () => {
    const pepper = randomBytes(32);
    const weak = await new PasswordHasher(pepper, params).hash('pw');
    expect(new PasswordHasher(pepper, { memoryKiB: 65536, iterations: 3 }).needsRehash(weak)).toBe(
      true,
    );
    expect(new PasswordHasher(pepper, params).needsRehash(weak)).toBe(false);
  });

  it('normalises emails before hashing them for lookup', () => {
    const pepper = randomBytes(32);
    expect(normalizeEmail('  Panda@Example.COM ')).toBe('panda@example.com');
    expect(lookupHash(pepper, 'email', 'a')).not.toEqual(lookupHash(pepper, 'ip', 'a'));
  });
});
