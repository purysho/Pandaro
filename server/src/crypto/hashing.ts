import argon2 from 'argon2';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface PasswordParams {
  memoryKiB: number;
  iterations: number;
}

/**
 * Argon2id with a per-hash random salt (inside the encoded hash) and a server-side pepper
 * passed as Argon2's secret input. Parameters are stored in the hash, so they can be raised
 * later and old hashes still verify (see needsRehash).
 */
export class PasswordHasher {
  private readonly dummy: Promise<string>;

  constructor(
    private readonly pepper: Buffer,
    private readonly params: PasswordParams,
  ) {
    this.dummy = this.hash(randomBytes(16).toString('hex'));
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: this.params.memoryKiB,
      timeCost: this.params.iterations,
      parallelism: 1,
      secret: this.pepper,
    });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password, { secret: this.pepper });
    } catch {
      return false;
    }
  }

  /** Spend the same time as a real check when the account does not exist. */
  async verifyDummy(password: string): Promise<false> {
    await this.verify(await this.dummy, password);
    return false;
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, {
      memoryCost: this.params.memoryKiB,
      timeCost: this.params.iterations,
      parallelism: 1,
    });
  }
}

/** Keyed hash for lookups (email, device, IP) so the raw value is never stored. */
export function lookupHash(pepper: Buffer, purpose: string, value: string): Buffer {
  return createHmac('sha256', pepper).update(`${purpose}\u0000${value}`).digest();
}

export function sha256(value: string | Buffer): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Random URL-safe token and the hash that is stored for it. */
export function newToken(bytes = 32): { token: string; hash: Buffer } {
  const token = randomBytes(bytes).toString('base64url');
  return { token, hash: sha256(token) };
}

export function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
