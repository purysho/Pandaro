import type { KeyProvider } from '../crypto/keys.js';
import type { Database, Queryable } from '../db/pool.js';
import { render, type EmailMessage, type Rendered } from './templates.js';

export interface MailTransport {
  send(to: string, from: string, mail: Rendered): Promise<void>;
}

/** Keeps mail in the outbox table only (development and tests). */
export const logTransport: MailTransport = { send: async () => {} };

export function postmarkTransport(token: string): MailTransport {
  return {
    async send(to, from, mail) {
      const headers = mail.unsubscribe
        ? [
            { Name: 'List-Unsubscribe', Value: `<${mail.unsubscribe}>` },
            { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' },
          ]
        : [];
      const res = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': token,
        },
        body: JSON.stringify({
          From: from,
          To: to,
          Subject: mail.subject,
          TextBody: mail.text,
          MessageStream: mail.category === 'security' ? 'outbound' : 'broadcast',
          TrackOpens: false,
          TrackLinks: 'None',
          Headers: headers,
        }),
      });
      if (!res.ok) throw new Error(`Postmark responded ${res.status}`);
    },
  };
}

const AAD = 'outbox';

/** Queue an email inside the caller's transaction, so it is sent only if the change commits. */
export async function enqueue(
  q: Queryable,
  keys: KeyProvider,
  userId: string | null,
  to: string,
  message: EmailMessage,
): Promise<void> {
  const toEnc = await keys.encrypt(Buffer.from(to, 'utf8'), AAD);
  const dataEnc = await keys.encrypt(Buffer.from(JSON.stringify(message), 'utf8'), AAD);
  await q.query(
    'INSERT INTO outbox (user_id, to_enc, template, data_enc) VALUES ($1, $2, $3, $4)',
    [userId, toEnc, message.template, dataEnc],
  );
}

/** Read a queued message back (used by the worker, and by tests to follow email links). */
export async function decodeOutboxRow(
  keys: KeyProvider,
  row: { to_enc: Buffer; data_enc: Buffer },
): Promise<{ to: string; message: EmailMessage }> {
  return {
    to: (await keys.decrypt(row.to_enc, AAD)).toString('utf8'),
    message: JSON.parse((await keys.decrypt(row.data_enc, AAD)).toString('utf8')) as EmailMessage,
  };
}

/**
 * Send due messages. Rows are claimed with SKIP LOCKED and a lease, so several instances can run
 * the worker without sending a message twice; failures back off exponentially (up to 8 tries).
 */
export async function drainOutbox(
  db: Database,
  keys: KeyProvider,
  transport: MailTransport,
  from: string,
  limit = 20,
): Promise<number> {
  const { rows } = await db.query<{ id: string; to_enc: Buffer; data_enc: Buffer }>(
    `UPDATE outbox SET locked_until = now() + interval '2 minutes', attempts = attempts + 1
       WHERE id IN (
         SELECT id FROM outbox
          WHERE sent_at IS NULL AND attempts < 8 AND next_try_at <= now()
            AND (locked_until IS NULL OR locked_until < now())
          ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED)
     RETURNING id, to_enc, data_enc`,
    [limit],
  );
  let sent = 0;
  for (const row of rows) {
    try {
      const { to, message } = await decodeOutboxRow(keys, row);
      await transport.send(to, from, render(message));
      // Sent mail keeps no address or content.
      await db.query(
        `UPDATE outbox SET sent_at = now(), to_enc = ''::bytea, data_enc = ''::bytea WHERE id = $1`,
        [row.id],
      );
      sent++;
    } catch {
      await db.query(
        `UPDATE outbox SET locked_until = NULL,
           next_try_at = now() + make_interval(secs => 30 * power(2, attempts)) WHERE id = $1`,
        [row.id],
      );
    }
  }
  return sent;
}
