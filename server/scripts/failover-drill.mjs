// Failover drill: runs the HA stack (deploy/compose.ha.yaml), keeps a simulated client syncing,
// and meanwhile stops an API instance, kills the database primary and promotes the replica.
// Passes only if the client never gets signed out, never sees an error after its normal
// retries, and every record it pushed is on the server at the end.
//
//   node scripts/failover-drill.mjs            (needs Docker; uses ports 8088)
//   CA_FILE=/path/ca.pem node scripts/...      (behind a TLS-intercepting proxy)
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const here = new URL('..', import.meta.url).pathname;
const composeFile = join(here, 'deploy/compose.ha.yaml');
const envFile = join(mkdtempSync(join(tmpdir(), 'pandaro-drill-')), '.env');
const API = `http://127.0.0.1:${process.env.API_PORT ?? 8088}`;
const TASKS = 150;
const BATCH = 5;

const b64 = (n) => randomBytes(n).toString('base64');
const pem = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
writeFileSync(
  envFile,
  [
    `POSTGRES_PASSWORD=${randomBytes(12).toString('hex')}`,
    `REPLICATION_PASSWORD=${randomBytes(12).toString('hex')}`,
    `PEPPER=${b64(32)}`,
    `JWT_PRIVATE_KEY=${Buffer.from(pem).toString('base64')}`,
    `KEKS=k1:${b64(32)}`,
    'ACTIVE_KEK=k1',
  ].join('\n'),
  { mode: 0o600 },
);

const compose = (...args) =>
  execFileSync('docker', ['compose', '-f', composeFile, '--env-file', envFile, ...args], {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...m) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...m);

const stats = {
  requests: 0,
  retries: 0,
  refreshes: 0,
  servedBy: {},
  signedOut: false,
  userErrors: 0,
};
let tokens;

/** A client like the app's: retries network errors and 5xx, refreshes on an expired token. */
async function call(method, path, body, attempt = 0) {
  stats.requests++;
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(tokens ? { authorization: `Bearer ${tokens.accessToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    res = null;
  }
  if (res) {
    const by = res.headers.get('x-served-by');
    if (by) stats.servedBy[by] = (stats.servedBy[by] ?? 0) + 1;
  }
  if (res && res.ok) return res.status === 204 ? null : res.json();
  const error = res ? await res.json().catch(() => ({})) : {};
  if (res?.status === 401 && error.error?.code === 'token_expired' && attempt < 3) {
    stats.refreshes++;
    tokens = await call(
      'POST',
      '/v1/auth/refresh',
      { refreshToken: tokens.refreshToken },
      attempt + 1,
    );
    return call(method, path, body, attempt + 1);
  }
  if (res?.status === 401) {
    stats.signedOut = true;
    throw new Error(`signed out: ${JSON.stringify(error)}`);
  }
  if ((!res || res.status >= 500 || res.status === 429) && attempt < 10) {
    stats.retries++;
    await sleep(Math.min(4000, 250 * 2 ** attempt));
    return call(method, path, body, attempt + 1);
  }
  stats.userErrors++;
  throw new Error(`request failed: ${res?.status} ${JSON.stringify(error)}`);
}

async function waitReady() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${API}/readyz`)).ok) return;
    } catch {
      // not up yet
    }
    await sleep(1000);
  }
  throw new Error('stack did not become ready');
}

let failed = false;
try {
  log('building the API image');
  const caArgs = process.env.CA_FILE ? ['--secret', `id=ca,src=${process.env.CA_FILE}`] : [];
  execFileSync('docker', ['build', '-q', '-t', 'pandaro-api:dev', ...caArgs, here], {
    stdio: 'inherit',
  });
  log('starting stack');
  compose('up', '-d', '--no-build', '--wait');
  await waitReady();
  const replication = compose(
    'exec',
    '-T',
    'db-primary',
    'psql',
    '-U',
    'pandaro',
    '-tAc',
    'SELECT application_name, sync_state FROM pg_stat_replication',
  ).trim();
  log('replication:', replication || '(none)');

  const email = `drill-${randomUUID()}@example.com`;
  tokens = await call('POST', '/v1/auth/signup', {
    email,
    password: 'drill password 123',
    acceptedTerms: '2026-10-26',
    acceptedPrivacy: '2026-10-26',
    confirmedAge: true,
  });
  log('signed up');

  const events = [];
  for (let i = 0; i < TASKS / BATCH; i++) {
    if (i === 6) {
      log('stopping api1');
      compose('stop', 'api1');
      events.push('api1 stopped');
    }
    if (i === 12) {
      log('killing db-primary and promoting the replica');
      compose('kill', 'db-primary');
      compose('exec', '-T', 'db-replica', 'psql', '-U', 'pandaro', '-c', 'SELECT pg_promote()');
      events.push('primary killed, replica promoted');
    }
    if (i === 18) {
      log('starting api1 again');
      compose('start', 'api1');
      events.push('api1 restarted');
    }
    const push = Array.from({ length: BATCH }, (_, j) => {
      const id = `task-${i * BATCH + j}`;
      return {
        kind: 'task',
        id,
        updatedAt: Date.now(),
        data: { id, title: `Task ${i * BATCH + j}` },
      };
    });
    await call('POST', '/v1/sync', { cursor: '0', push });
    await sleep(150);
  }

  // Read everything back from a clean cursor.
  let cursor = '0';
  const ids = new Set();
  for (;;) {
    const page = await call('POST', '/v1/sync', { cursor, push: [] });
    page.pull.forEach((r) => ids.add(r.id));
    cursor = page.cursor;
    if (!page.more) break;
  }
  const account = await call('GET', '/v1/account');
  const report = {
    pushed: TASKS,
    onServer: ids.size,
    stillSignedIn: account.email === email,
    events,
    ...stats,
  };
  console.log(JSON.stringify(report, null, 2));
  failed = ids.size !== TASKS || stats.signedOut || stats.userErrors > 0 || !report.stillSignedIn;
  log(failed ? 'DRILL FAILED' : 'DRILL PASSED');
} catch (error) {
  failed = true;
  console.error(error);
  console.log(JSON.stringify(stats, null, 2));
} finally {
  if (!process.env.KEEP_STACK) compose('down', '-v');
}
process.exit(failed ? 1 : 0);
