/*
 * Postgres access with failover. With one URL (the usual managed-Postgres setup, where the
 * provider moves a DNS name to the new primary) this is a plain pool. With several URLs it uses
 * the first server that accepts writes, and on a connection loss or a read-only error it finds
 * the new primary and retries the operation once.
 */
import pg from 'pg';

/** Anything that runs a parameterised query: the Database or a transaction's client. */
export interface Queryable {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<R>>;
}

const RETRYABLE = new Set([
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '25006', // read_only_sql_transaction (we are talking to a standby)
  '08000',
  '08003',
  '08006',
]);

export function isConnectionError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code && RETRYABLE.has(e.code)) return true;
  if (e.code && ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND'].includes(e.code))
    return true;
  return /Connection terminated|connection timeout|Query read timeout|Client has encountered a connection error/i.test(
    e.message ?? '',
  );
}

export class Database {
  private pool: pg.Pool | null = null;
  private current = -1;
  private switching: Promise<void> | null = null;

  constructor(
    private readonly urls: readonly string[],
    private readonly poolSize = 10,
    private readonly log: (msg: string) => void = () => {},
  ) {}

  private makePool(url: string): pg.Pool {
    const pool = new pg.Pool({
      connectionString: url,
      max: this.poolSize,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 30_000,
      // A server that vanishes without closing the socket must not hang requests forever.
      query_timeout: 8000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 5000,
    });
    // An idle client losing its connection must not crash the process.
    pool.on('error', (err) => this.log(`postgres pool error: ${err.message}`));
    return pool;
  }

  /** Find a writable server, starting after the one that failed. */
  private async connect(): Promise<void> {
    const n = this.urls.length;
    let lastError: unknown = new Error('No database configured');
    for (let attempt = 0; attempt < n * 3; attempt++) {
      const index = (this.current + 1 + attempt) % n;
      const url = this.urls[index] as string;
      const pool = this.makePool(url);
      try {
        const { rows } = await pool.query<{ ro: boolean }>('SELECT pg_is_in_recovery() AS ro');
        if (rows[0]?.ro && n > 1) throw Object.assign(new Error('standby'), { code: '25006' });
        const old = this.pool;
        this.pool = pool;
        this.current = index;
        if (old) void old.end().catch(() => {});
        if (n > 1) this.log(`database: using server ${index + 1} of ${n}`);
        return;
      } catch (error) {
        lastError = error;
        await pool.end().catch(() => {});
        if (attempt >= n - 1) await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw lastError;
  }

  private async ensure(): Promise<pg.Pool> {
    if (!this.pool) {
      this.switching ??= this.connect().finally(() => (this.switching = null));
      await this.switching;
    }
    return this.pool as pg.Pool;
  }

  private async failover(failed: pg.Pool | null): Promise<void> {
    if (this.pool !== failed) return; // another request already switched
    this.switching ??= this.connect().finally(() => (this.switching = null));
    await this.switching;
  }

  private async withRetry<T>(fn: (pool: pg.Pool) => Promise<T>): Promise<T> {
    const pool = await this.ensure();
    try {
      return await fn(pool);
    } catch (error) {
      if (!isConnectionError(error)) throw error;
      await this.failover(pool);
      return fn(await this.ensure());
    }
  }

  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<R>> {
    return this.withRetry((pool) => pool.query<R>(text, values));
  }

  /**
   * Run fn in a transaction. Callers must keep fn safe to repeat: it is retried once if the
   * connection drops, which only happens before COMMIT succeeded.
   */
  transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    return this.withRetry(async (pool) => {
      const client = await pool.connect();
      let broken = false;
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        broken = isConnectionError(error);
        if (!broken) await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release(broken);
      }
    });
  }

  async close(): Promise<void> {
    const pool = this.pool;
    this.pool = null;
    if (pool) await pool.end();
  }
}
