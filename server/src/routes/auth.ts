import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { idempotencyKey, parse, requireAuth } from '../lib/http.js';
import type { Context } from '../context.js';
import {
  changePassword,
  login,
  logout,
  refresh,
  requestReset,
  resendVerification,
  resetPassword,
  signup,
  verifyEmail,
} from '../auth/service.js';
import { once } from '../lib/idempotency.js';

const email = z.string().trim().email().max(254);
const password = z.string().min(1).max(256);
const deviceLabel = z.string().trim().max(60).optional();
const token = z.string().min(10).max(200);

const signupSchema = z.object({
  email,
  password,
  acceptedTerms: z.string().max(20),
  acceptedPrivacy: z.string().max(20),
  confirmedAge: z.boolean(),
  optional: z
    .object({
      improve: z.boolean().optional(),
      product_email: z.boolean().optional(),
      weekly_email: z.boolean().optional(),
    })
    .optional(),
  device: z
    .object({ platform: z.enum(['ios', 'android']), token: z.string().min(1).max(8192) })
    .optional(),
  deviceLabel,
});

export function registerAuthRoutes(app: FastifyInstance, ctx: Context) {
  app.post('/v1/auth/signup', async (req, reply) => {
    const body = parse(signupSchema, req.body);
    return reply.status(201).send(await signup(ctx, { ...body, ip: req.ip }));
  });

  app.post('/v1/auth/login', async (req) => {
    const body = parse(z.object({ email, password, deviceLabel }), req.body);
    return login(ctx, { ...body, ip: req.ip });
  });

  app.post('/v1/auth/refresh', async (req) => {
    const body = parse(z.object({ refreshToken: token }), req.body);
    return refresh(ctx, body.refreshToken);
  });

  app.post('/v1/auth/logout', async (req, reply) => {
    const body = parse(z.object({ refreshToken: token }), req.body);
    await logout(ctx, body.refreshToken);
    return reply.status(204).send();
  });

  app.post('/v1/auth/verify-email', async (req, reply) => {
    const body = parse(z.object({ token }), req.body);
    await verifyEmail(ctx, body.token);
    return reply.status(204).send();
  });

  app.post('/v1/auth/verify-email/resend', async (req, reply) => {
    const auth = await requireAuth(ctx, req);
    await resendVerification(ctx, auth.sub);
    return reply.status(204).send();
  });

  app.post('/v1/auth/password/forgot', async (req, reply) => {
    const body = parse(z.object({ email }), req.body);
    await requestReset(ctx, body.email, req.ip);
    return reply.status(202).send({ ok: true });
  });

  app.post('/v1/auth/password/reset', async (req) => {
    const body = parse(z.object({ token, password, deviceLabel }), req.body);
    return resetPassword(ctx, { ...body, ip: req.ip });
  });

  app.post('/v1/auth/password/change', async (req, reply) => {
    const auth = await requireAuth(ctx, req);
    const body = parse(z.object({ current: password, next: password }), req.body);
    const result = await once(
      ctx,
      auth.sub,
      idempotencyKey(req),
      { op: 'password-change' },
      async () => {
        await changePassword(ctx, {
          userId: auth.sub,
          familyId: auth.fam,
          current: body.current,
          next: body.next,
          ip: req.ip,
        });
        return { status: 200, body: { ok: true } };
      },
    );
    return reply.status(result.status).send(result.body);
  });
}
