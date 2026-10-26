import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { HttpError, type Context } from './context.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerAccountRoutes } from './routes/account.js';
import { registerSyncRoutes } from './routes/sync.js';
import { LEGAL_VERSIONS, MIN_AGE } from './legal.js';

export async function buildApp(ctx: Context): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      ctx.config.NODE_ENV === 'test'
        ? false
        : { level: 'info', redact: ['req.headers.authorization'] },
    trustProxy: ctx.config.TRUST_PROXY,
    bodyLimit: 64 * 1024,
  });

  await app.register(cors, {
    origin: ctx.config.CORS_ORIGINS.length ? ctx.config.CORS_ORIGINS : false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
    maxAge: 600,
  });

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Served-By', ctx.config.INSTANCE_ID);
    return payload;
  });

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof HttpError) {
      if (error.retryAfter) reply.header('Retry-After', String(error.retryAfter));
      return reply
        .status(error.status)
        .send({ error: { code: error.code, message: error.message } });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply
        .status(status)
        .send({ error: { code: 'invalid_request', message: 'The request could not be read.' } });
    }
    req.log.error(error);
    return reply.status(500).send({
      error: { code: 'server_error', message: 'Something went wrong. Please try again.' },
    });
  });

  app.get('/healthz', async () => ({ ok: true, instance: ctx.config.INSTANCE_ID }));
  app.get('/readyz', async (_req, reply) => {
    try {
      await ctx.db.query('SELECT 1');
      return { ok: true };
    } catch {
      return reply.status(503).send({ ok: false });
    }
  });
  app.get('/v1/legal', async () => ({ versions: LEGAL_VERSIONS, minAge: MIN_AGE }));

  registerAuthRoutes(app, ctx);
  registerAccountRoutes(app, ctx);
  registerSyncRoutes(app, ctx);
  return app;
}
