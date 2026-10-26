import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { familyActive } from '../auth/service.js';
import { HttpError, type Context } from '../context.js';
import type { AccessClaims } from '../crypto/jwt.js';

export function bearer(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

/** Resolve the signed-in user, or fail with 401 so the client refreshes and retries. */
export async function requireAuth(ctx: Context, req: FastifyRequest): Promise<AccessClaims> {
  const token = bearer(req);
  const claims = token ? await ctx.tokens.verify(token, ctx.now()) : null;
  if (!claims) throw new HttpError(401, 'token_expired', 'Please refresh your sign-in.');
  if (!(await familyActive(ctx, claims.fam)))
    throw new HttpError(401, 'session_ended', 'You have been signed out. Please sign in again.');
  return claims;
}

export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new HttpError(
      400,
      'invalid_request',
      first ? `${first.path.join('.') || 'body'}: ${first.message}` : 'Invalid request.',
    );
  }
  return result.data;
}

export function idempotencyKey(req: FastifyRequest): string | undefined {
  const key = req.headers['idempotency-key'];
  return typeof key === 'string' ? key : undefined;
}
