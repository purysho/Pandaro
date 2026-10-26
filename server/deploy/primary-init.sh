#!/bin/sh
# Runs once when the primary's data directory is created: allow the replica to stream WAL.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD '${REPLICATION_PASSWORD}';
-- From the next start, a commit is acknowledged only once the replica has it, so a failover
-- loses no acknowledged write. (If the replica is down, writes wait; see DEPLOYMENT.md.)
ALTER SYSTEM SET synchronous_standby_names = 'replica1';
SQL
echo "host replication replicator all scram-sha-256" >> "$PGDATA/pg_hba.conf"
