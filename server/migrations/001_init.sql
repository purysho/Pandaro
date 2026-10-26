-- Pandaro accounts and sync, schema 1.
-- Personal fields are encrypted by the API before they reach the database (see src/crypto).

CREATE TABLE users (
  id              uuid PRIMARY KEY,
  -- HMAC of the normalised email: unique lookups without storing the address in plain text.
  email_hash      bytea NOT NULL UNIQUE,
  email_enc       bytea NOT NULL,
  password_hash   text NOT NULL,
  -- Per-user data key, wrapped by a key-encryption key (KEK) identified by dek_kid.
  dek_wrapped     bytea NOT NULL,
  dek_kid         text NOT NULL,
  email_verified_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id            uuid PRIMARY KEY,
  family_id     uuid NOT NULL,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    bytea NOT NULL UNIQUE,
  device_label  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  revoked_at    timestamptz
);
CREATE INDEX refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX refresh_tokens_user ON refresh_tokens(user_id);

-- Single-use email tokens (verification, password reset), stored hashed.
CREATE TABLE email_tokens (
  token_hash  bytea PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('verify', 'reset')),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
CREATE INDEX email_tokens_user ON email_tokens(user_id, purpose);

-- Versioned, timestamped, revocable consent records. The latest row per kind wins.
CREATE TABLE consents (
  id        bigserial PRIMARY KEY,
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind      text NOT NULL,
  version   text NOT NULL,
  granted   boolean NOT NULL,
  at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consents_user_kind ON consents(user_id, kind, at DESC);

-- Synced records. kind: session | task | ledger | settings. Payloads are encrypted JSON.
CREATE SEQUENCE record_seq;
CREATE TABLE records (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('session', 'task', 'ledger', 'settings')),
  id          text NOT NULL,
  updated_at  bigint NOT NULL,
  deleted     boolean NOT NULL DEFAULT false,
  payload     bytea,
  seq         bigint NOT NULL DEFAULT nextval('record_seq'),
  PRIMARY KEY (user_id, kind, id)
);
CREATE INDEX records_user_seq ON records(user_id, seq);

-- Stored responses for retried requests (Idempotency-Key header).
CREATE TABLE idempotency (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key           text NOT NULL,
  request_hash  bytea NOT NULL,
  status        integer NOT NULL,
  response      jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- Sliding-window rate limits shared by every API instance.
CREATE TABLE rate_limits (
  key           text NOT NULL,
  window_start  bigint NOT NULL,
  count         integer NOT NULL,
  PRIMARY KEY (key, window_start)
);

-- Soft limit on new accounts per device (hashed attested device id).
CREATE TABLE device_signups (
  device_hash  bytea NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX device_signups_hash ON device_signups(device_hash, created_at);

-- Outgoing email, sent by a worker so a crash never loses or duplicates a message.
CREATE TABLE outbox (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Encrypted with the active KEK (the key id is inside the blob), so the address
  -- stays readable after the user's own data key is deleted.
  to_enc      bytea NOT NULL,
  template    text NOT NULL,
  data_enc    bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  attempts    integer NOT NULL DEFAULT 0,
  next_try_at timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz,
  locked_until timestamptz
);
CREATE INDEX outbox_pending ON outbox(next_try_at) WHERE sent_at IS NULL;

-- Security events (logins, resets); IP is stored as an HMAC and kept 30 days.
CREATE TABLE security_events (
  id        bigserial PRIMARY KEY,
  user_id   uuid REFERENCES users(id) ON DELETE CASCADE,
  kind      text NOT NULL,
  ip_hash   bytea,
  at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX security_events_at ON security_events(at);
CREATE INDEX security_events_user ON security_events(user_id, at DESC);
