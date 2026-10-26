import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { bearer, idempotencyKey, parse, requireAuth } from '../lib/http.js';
import { HttpError, type Context } from '../context.js';
import { logoutEverywhere } from '../auth/service.js';
import {
  deleteAccount,
  exportAccount,
  getAccount,
  unsubscribe,
  updateConsents,
} from '../account/service.js';
import { once } from '../lib/idempotency.js';

const consentSchema = z.object({
  optional: z
    .object({
      improve: z.boolean().optional(),
      product_email: z.boolean().optional(),
      weekly_email: z.boolean().optional(),
    })
    .optional(),
  acceptedTerms: z.string().max(20).optional(),
  acceptedPrivacy: z.string().max(20).optional(),
});

const UNSUB_PAGE = (message: string) =>
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Pandaro email</title><body style="font-family:system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem">${message}</body></html>`;

export function registerAccountRoutes(app: FastifyInstance, ctx: Context) {
  app.get('/v1/account', async (req) => {
    const auth = await requireAuth(ctx, req);
    return getAccount(ctx, auth.sub, auth.fam);
  });

  app.patch('/v1/account/consents', async (req, reply) => {
    const auth = await requireAuth(ctx, req);
    const body = parse(consentSchema, req.body);
    const result = await once(ctx, auth.sub, idempotencyKey(req), body, async () => {
      await updateConsents(ctx, auth.sub, body);
      return { status: 200, body: { ok: true } };
    });
    return reply.status(result.status).send(result.body);
  });

  app.get('/v1/account/export', async (req, reply) => {
    const auth = await requireAuth(ctx, req);
    reply.header('Content-Disposition', 'attachment; filename="pandaro-account-export.json"');
    return exportAccount(ctx, auth.sub, auth.fam);
  });

  app.post('/v1/account/sign-out-others', async (req, reply) => {
    const auth = await requireAuth(ctx, req);
    await logoutEverywhere(ctx, ctx.db, auth.sub, auth.fam);
    return reply.status(204).send();
  });

  app.delete('/v1/account', async (req, reply) => {
    const token = bearer(req);
    const claims = token ? await ctx.tokens.verify(token, ctx.now()) : null;
    if (!claims) throw new HttpError(401, 'token_expired', 'Please refresh your sign-in.');
    const body = parse(z.object({ password: z.string().min(1).max(256) }), req.body);
    // Repeating the request after the account is gone succeeds, so a retry is harmless.
    const { rowCount } = await ctx.db.query('SELECT 1 FROM users WHERE id = $1', [claims.sub]);
    if (!rowCount) return reply.status(204).send();
    await requireAuth(ctx, req);
    await deleteAccount(ctx, claims.sub, body.password);
    return reply.status(204).send();
  });

  /* One-click unsubscribe: GET shows a confirmation button, POST does it (RFC 8058). */
  app.get('/v1/email/unsubscribe', async (req, reply) => {
    const t = parse(z.object({ t: z.string().max(300) }), req.query).t;
    reply.type('text/html; charset=utf-8');
    reply.header(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
    );
    return UNSUB_PAGE(
      `<h1>Stop these emails?</h1><form method="post" action="?t=${encodeURIComponent(t)}"><button type="submit">Unsubscribe</button></form>`,
    );
  });

  app.post('/v1/email/unsubscribe', async (req, reply) => {
    const t = parse(z.object({ t: z.string().max(300) }), req.query).t;
    const ok = await unsubscribe(ctx, t);
    reply.type('text/html; charset=utf-8');
    reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    return reply
      .status(ok ? 200 : 400)
      .send(UNSUB_PAGE(ok ? '<h1>You are unsubscribed.</h1>' : '<h1>This link is not valid.</h1>'));
  });
}
