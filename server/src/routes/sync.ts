import type { FastifyInstance } from 'fastify';
import { parse, requireAuth } from '../lib/http.js';
import type { Context } from '../context.js';
import { sync, syncRequestSchema } from '../sync/service.js';

export function registerSyncRoutes(app: FastifyInstance, ctx: Context) {
  app.post('/v1/sync', { bodyLimit: 10 * 1024 * 1024 }, async (req) => {
    const auth = await requireAuth(ctx, req);
    return sync(ctx, auth.sub, parse(syncRequestSchema, req.body));
  });
}
