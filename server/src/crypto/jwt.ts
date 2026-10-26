/*
 * Short-lived access tokens signed with Ed25519. Every API instance holds the same public keys, so
 * any instance can verify a token without shared session state: a request that lands on another
 * server, or is retried after a server dies, is still authenticated.
 */
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
} from 'node:crypto';
import { SignJWT, jwtVerify, decodeProtectedHeader } from 'jose';

export interface AccessClaims {
  sub: string;
  /** Refresh-token family (one per signed-in device). */
  fam: string;
}

export class AccessTokens {
  private readonly verifyKeys = new Map<string, KeyObject>();

  constructor(
    private readonly signingKey: KeyObject,
    private readonly kid: string,
    private readonly issuer: string,
    private readonly ttlSeconds: number,
    previousPublicKeys: ReadonlyMap<string, KeyObject> = new Map(),
  ) {
    this.verifyKeys.set(kid, createPublicKey(signingKey));
    for (const [id, key] of previousPublicKeys) this.verifyKeys.set(id, key);
  }

  static fromConfig(opts: {
    privateKeyB64?: string;
    kid: string;
    previous: readonly string[];
    issuer: string;
    ttlSeconds: number;
  }): AccessTokens {
    const signing = opts.privateKeyB64
      ? createPrivateKey(Buffer.from(opts.privateKeyB64, 'base64').toString('utf8'))
      : generateKeyPairSync('ed25519').privateKey;
    const previous = new Map<string, KeyObject>();
    for (const entry of opts.previous) {
      const sep = entry.indexOf(':');
      previous.set(
        entry.slice(0, sep),
        createPublicKey(Buffer.from(entry.slice(sep + 1), 'base64').toString('utf8')),
      );
    }
    return new AccessTokens(signing, opts.kid, opts.issuer, opts.ttlSeconds, previous);
  }

  get ttl(): number {
    return this.ttlSeconds;
  }

  sign(claims: AccessClaims, now = Date.now()): Promise<string> {
    const iat = Math.floor(now / 1000);
    return new SignJWT({ fam: claims.fam })
      .setProtectedHeader({ alg: 'EdDSA', kid: this.kid })
      .setSubject(claims.sub)
      .setIssuer(this.issuer)
      .setAudience('pandaro')
      .setIssuedAt(iat)
      .setExpirationTime(iat + this.ttlSeconds)
      .sign(this.signingKey);
  }

  async verify(token: string, now = Date.now()): Promise<AccessClaims | null> {
    try {
      const { kid } = decodeProtectedHeader(token);
      const key = kid ? this.verifyKeys.get(kid) : undefined;
      if (!key) return null;
      const { payload } = await jwtVerify(token, key, {
        algorithms: ['EdDSA'],
        issuer: this.issuer,
        audience: 'pandaro',
        currentDate: new Date(now),
      });
      if (typeof payload.sub !== 'string' || typeof payload.fam !== 'string') return null;
      return { sub: payload.sub, fam: payload.fam };
    } catch {
      return null;
    }
  }
}
