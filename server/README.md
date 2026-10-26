# Pandaro API (optional)

Accounts and encrypted sync for Pandaro. **The app works fully without it**: everything is stored
on the device, and signing in only adds backup and sync across devices.

## What it does

| Area             | How                                                                                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passwords        | Argon2id (64 MiB, 3 passes, 1 lane), random salt per hash, server-side pepper; minimum 10 characters; optional breached-password check (`PWNED_CHECK`, sends only a 5-character hash prefix) |
| Sign-in sessions | 15-minute Ed25519 access tokens that any instance can verify, plus 30-day rotating refresh tokens stored hashed, with theft detection (replay after 30 s revokes that device's sign-in)      |
| Rate limits      | Sliding windows in Postgres, shared by all instances: login 5/15 min per account and 20/15 min per IP; sign-up 3/hour per IP; reset 3/hour per account                                       |
| One account per… | Email: unique keyed hash of the normalised address. Device: at most 2 new accounts per attested device in 30 days (Apple DeviceCheck / Play Integrity; needs the owner's keys)               |
| Encryption       | Per-user data keys wrapped by a KEK (envelope encryption). Email, task text and all synced records are AES-256-GCM encrypted before they reach the database                                  |
| Sync             | Idempotent push/pull by cursor; sessions and rewards append-only, tasks and settings newest-wins, deletions as tombstones                                                                    |
| Email            | Transactional outbox (sent exactly once across instances), plain text, no tracking; one-click unsubscribe for optional emails                                                                |
| Privacy          | Consent history, data export, account deletion (crypto-shredding: backups become unreadable for that user), 30-day security log with hashed IPs                                              |
| Availability     | Stateless instances behind a load balancer, idempotent writes, database failover across several URLs, graceful shutdown for rolling deploys                                                  |

## Run locally

```sh
cd server
npm ci
export DATABASE_URL=postgres://pandaro:pandaro@localhost:5432/pandaro
npm run dev            # http://localhost:3000, migrations run on start
npm test               # needs Postgres; set TEST_DATABASE_URL to override the default
```

Generate production secrets with `node scripts/gen-secrets.mjs` and store them in your host's
secret manager. Never commit them.

## Operations

| Task                 | Command                                                                           |
| -------------------- | --------------------------------------------------------------------------------- |
| Migrate              | `npm run migrate` (also runs on start, guarded by an advisory lock)               |
| Encrypted backup     | `BACKUP_KEY=… DATABASE_URL=… node dist/cli/backup.js backup file.bak`             |
| Restore              | `node dist/cli/backup.js restore file.bak <target-url>`                           |
| Monthly restore test | `node dist/cli/backup.js drill file.bak <scratch-url>` (compares row counts)      |
| Rotate the KEK       | add the new key to `KEKS`, set `ACTIVE_KEK`, deploy, `node dist/cli/rotateKek.js` |
| Failover drill       | `node scripts/failover-drill.mjs` (Docker: 2 APIs, LB, primary + replica)         |

See `DEPLOYMENT.md` in the repository root for hosting on Fly.io or Render.
