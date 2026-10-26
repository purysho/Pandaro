/*
 * Envelope encryption.
 *
 * - A key-encryption key (KEK) lives outside the database: in a cloud KMS in production, or in an
 *   environment variable for development and self-hosting (EnvKeyProvider).
 * - Each user has a random 256-bit data key (DEK), stored wrapped by the KEK.
 * - Personal fields and synced records are encrypted with the user's DEK (AES-256-GCM), with the
 *   record identity as additional authenticated data so ciphertext cannot be moved between rows.
 * - Rotating the KEK only rewraps DEKs (scripts/rotate-kek.ts); record data is not re-encrypted.
 * - Deleting a user deletes the wrapped DEK, so copies of their rows in backups become unreadable.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Port for a KMS. Blobs carry the key id, so old data stays readable after rotation. */
export interface KeyProvider {
  readonly activeKid: string;
  encrypt(plaintext: Buffer, aad: string): Promise<Buffer>;
  decrypt(blob: Buffer, aad: string): Promise<Buffer>;
  /** Key id a blob was encrypted with. */
  kidOf(blob: Buffer): string;
}

function seal(key: Buffer, kid: string, plaintext: Buffer, aad: string): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const kidBytes = Buffer.from(kid, 'utf8');
  if (kidBytes.length > 255) throw new Error('Key id too long');
  return Buffer.concat([
    Buffer.from([VERSION, kidBytes.length]),
    kidBytes,
    iv,
    cipher.getAuthTag(),
    body,
  ]);
}

function parse(blob: Buffer) {
  if (blob.length < 2 + IV_BYTES + TAG_BYTES || blob[0] !== VERSION) {
    throw new Error('Unsupported ciphertext');
  }
  const kidLen = blob[1] ?? 0;
  let at = 2;
  const kid = blob.subarray(at, (at += kidLen)).toString('utf8');
  const iv = blob.subarray(at, (at += IV_BYTES));
  const tag = blob.subarray(at, (at += TAG_BYTES));
  return { kid, iv, tag, body: blob.subarray(at) };
}

function open(key: Buffer, blob: Buffer, aad: string): Buffer {
  const { iv, tag, body } = parse(blob);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

export function kidOf(blob: Buffer): string {
  return parse(blob).kid;
}

/** Encrypt with a raw 32-byte data key. */
export function encryptWith(dek: Buffer, plaintext: Buffer, aad: string): Buffer {
  return seal(dek, 'dek', plaintext, aad);
}

export function decryptWith(dek: Buffer, blob: Buffer, aad: string): Buffer {
  return open(dek, blob, aad);
}

/** KEKs from configuration ("kid:base64"). Suitable for development and self-hosting. */
export class EnvKeyProvider implements KeyProvider {
  private readonly keys = new Map<string, Buffer>();
  readonly activeKid: string;

  constructor(entries: readonly string[], activeKid?: string) {
    for (const entry of entries) {
      const sep = entry.indexOf(':');
      if (sep < 1) throw new Error('KEKS entries must look like "kid:base64key"');
      const key = Buffer.from(entry.slice(sep + 1), 'base64');
      if (key.length !== 32) throw new Error(`KEK ${entry.slice(0, sep)} must be 32 bytes`);
      this.keys.set(entry.slice(0, sep), key);
    }
    const active = activeKid ?? [...this.keys.keys()][0];
    if (!active || !this.keys.has(active)) throw new Error('ACTIVE_KEK does not match any KEKS');
    this.activeKid = active;
  }

  /** A provider with one random key, for development and tests only. */
  static ephemeral(kid = 'dev'): EnvKeyProvider {
    return new EnvKeyProvider([`${kid}:${randomBytes(32).toString('base64')}`], kid);
  }

  async encrypt(plaintext: Buffer, aad: string): Promise<Buffer> {
    return seal(this.keys.get(this.activeKid) as Buffer, this.activeKid, plaintext, aad);
  }

  async decrypt(blob: Buffer, aad: string): Promise<Buffer> {
    const key = this.keys.get(kidOf(blob));
    if (!key) throw new Error(`Unknown key id ${kidOf(blob)}`);
    return open(key, blob, aad);
  }

  kidOf(blob: Buffer): string {
    return kidOf(blob);
  }
}

/** Unwrapped data keys, cached briefly to avoid a KMS round trip on every request. */
export class DekCache {
  private readonly entries = new Map<string, { dek: Buffer; expires: number }>();
  constructor(
    private readonly ttlMs = 5 * 60_000,
    private readonly max = 1000,
  ) {}

  get(userId: string, now = Date.now()): Buffer | undefined {
    const hit = this.entries.get(userId);
    if (!hit) return undefined;
    if (hit.expires <= now) {
      this.entries.delete(userId);
      return undefined;
    }
    return hit.dek;
  }

  set(userId: string, dek: Buffer, now = Date.now()): void {
    if (this.entries.size >= this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(userId, { dek, expires: now + this.ttlMs });
  }

  delete(userId: string): void {
    this.entries.delete(userId);
  }
}
