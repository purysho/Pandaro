import type { Context } from './context.js';

/**
 * Periodic upkeep. Safe to run on every instance at once: each statement is idempotent and the
 * outbox claims rows with SKIP LOCKED.
 */
export async function housekeeping(ctx: Context): Promise<void> {
  const now = ctx.now();
  await ctx.limiter.prune(now);
  // Security log keeps hashed IPs for 30 days.
  await ctx.db.query(`DELETE FROM security_events WHERE at < now() - interval '30 days'`);
  await ctx.db.query(`DELETE FROM idempotency WHERE created_at < now() - interval '1 day'`);
  await ctx.db.query(`DELETE FROM refresh_tokens WHERE expires_at < now() - interval '7 days'`);
  await ctx.db.query(`DELETE FROM email_tokens WHERE expires_at < now() - interval '1 day'`);
  await ctx.db.query(`DELETE FROM outbox WHERE sent_at < now() - interval '30 days'`);
  await ctx.db.query(`DELETE FROM device_signups WHERE created_at < now() - interval '31 days'`);
}

export function startHousekeeping(ctx: Context, drain: () => Promise<number>): () => void {
  const log = (e: unknown) => console.error('job failed', e instanceof Error ? e.message : e);
  const mail = setInterval(() => void drain().catch(log), 5_000);
  const upkeep = setInterval(() => void housekeeping(ctx).catch(log), 60 * 60_000);
  mail.unref();
  upkeep.unref();
  return () => {
    clearInterval(mail);
    clearInterval(upkeep);
  };
}
