/**
 * Versions of the documents in docs/legal. A new version needs fresh agreement from existing
 * users (the client shows the updated documents and asks again). Keep in sync with
 * src/legal/versions.ts in the app; a test checks this.
 */
export const LEGAL_VERSIONS = {
  terms: '2026-10-26',
  privacy: '2026-10-26',
} as const;

/** Optional consents and email preferences, all off unless the user turns them on. */
export const OPTIONAL_CONSENTS = ['improve', 'product_email', 'weekly_email'] as const;
export type OptionalConsent = (typeof OPTIONAL_CONSENTS)[number];

/** Users must be at least this old to create an account (16 where local law requires it). */
export const MIN_AGE = 13;
