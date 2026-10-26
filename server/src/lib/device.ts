/*
 * Soft limit on new accounts per device (at most 2 per device in 30 days).
 *
 * Only platform attestation is used: Apple DeviceCheck on iOS and the Play Integrity API on
 * Android. Pandaro never reads hardware identifiers or fingerprints the browser. The web has no
 * compliant equivalent, so web sign-ups are limited by IP and email instead.
 */
import type { Database } from '../db/pool.js';

export const DEVICE_LIMIT = { max: 2, days: 30 };

export interface DeviceProof {
  platform: 'ios' | 'android';
  token: string;
}

/** Turns an attestation token into a stable device identifier, or null if it is not valid. */
export interface DeviceVerifier {
  verify(proof: DeviceProof): Promise<string | null>;
}

/** No attestation configured: device limits are skipped. */
export const noDeviceVerifier: DeviceVerifier = { verify: async () => null };

/** Development only: accepts tokens of the form "dev:<id>". */
export const devDeviceVerifier: DeviceVerifier = {
  verify: async ({ token }) => (/^dev:[\w-]{4,64}$/.test(token) ? token : null),
};

/**
 * Production verifier placeholder. Wiring the real services needs keys that only the app owner
 * holds:
 * - iOS: send the DeviceCheck token to Apple's query_two_bits / update_two_bits endpoints, signed
 *   with the team's DeviceCheck key (ES256 JWT). Use one of the two bits as "has signed up".
 * - Android: decode the Play Integrity token with Google's decodeIntegrityToken API using the
 *   service account linked in Play Console, and require MEETS_DEVICE_INTEGRITY.
 * Until then this rejects every token, and sign-up continues without the device limit.
 */
export const unconfiguredRealVerifier: DeviceVerifier = { verify: async () => null };

export async function deviceSignupsAllowed(
  db: Database,
  deviceHash: Buffer,
  now = Date.now(),
): Promise<boolean> {
  const since = new Date(now - DEVICE_LIMIT.days * 86_400_000);
  const { rows } = await db.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM device_signups WHERE device_hash = $1 AND created_at > $2',
    [deviceHash, since],
  );
  return (rows[0]?.n ?? 0) < DEVICE_LIMIT.max;
}
