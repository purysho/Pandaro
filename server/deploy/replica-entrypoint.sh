#!/bin/sh
# Start as a streaming replica of db-primary. On first start, copy the primary with
# pg_basebackup (-R writes standby.signal and the connection settings).
set -e
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  until pg_isready -h db-primary -U "$POSTGRES_USER"; do sleep 1; done
  export PGPASSWORD="$REPLICATION_PASSWORD"
  pg_basebackup -h db-primary -U replicator -D "$PGDATA" -X stream -R --slot=replica1 --create-slot
  # The copy includes the primary's "wait for a synchronous standby" setting. A promoted replica
  # has no standby of its own, so drop it here or its commits would wait forever.
  sed -i '/synchronous_standby_names/d' "$PGDATA/postgresql.auto.conf"
  chown -R postgres:postgres "$PGDATA"
  chmod 700 "$PGDATA"
fi
exec docker-entrypoint.sh postgres -c hot_standby=on -c cluster_name=replica1
