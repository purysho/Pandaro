import { loadConfig } from './config.js';
import { createContext } from './context.js';
import { buildApp } from './app.js';
import { migrate } from './db/migrate.js';
import { Database } from './db/pool.js';
import { drainOutbox, logTransport, postmarkTransport } from './email/outbox.js';
import { startHousekeeping } from './jobs.js';

const config = loadConfig();
const db = new Database(config.databaseUrls, config.DATABASE_POOL_SIZE, (m) => console.log(m));
await migrate(db);
const ctx = createContext(config, db);
const app = await buildApp(ctx);

const transport =
  config.MAIL_TRANSPORT === 'postmark' && config.POSTMARK_TOKEN
    ? postmarkTransport(config.POSTMARK_TOKEN)
    : logTransport;
const stopJobs = startHousekeeping(ctx, () =>
  drainOutbox(db, ctx.keys, transport, config.MAIL_FROM),
);

// Finish in-flight requests before exiting, so rolling deploys drop nothing.
let closing = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    stopJobs();
    void app
      .close()
      .then(() => db.close())
      .finally(() => process.exit(0));
  });
}

await app.listen({ host: config.HOST, port: config.PORT });
