#!/bin/sh
# Restores a dump into the running stack. This replaces the current database.
# Usage: sh scripts/restore.sh localpilot-20260101-020000.sql.gz
set -eu

name="${1:?Give the backup file name. List them with: docker compose exec backup ls /backups}"

printf 'This replaces the current database with %s. Type RESTORE to continue: ' "$name"
read -r answer
[ "$answer" = "RESTORE" ] || { echo "Cancelled."; exit 1; }

docker compose stop api worker web
docker compose exec -T backup sh -c '
  psql -d postgres -c "DROP DATABASE IF EXISTS \"$PGDATABASE\" WITH (FORCE)"
  psql -d postgres -c "CREATE DATABASE \"$PGDATABASE\""
  gunzip -c "/backups/'"$name"'" | psql -q
'
docker compose start api worker web
echo "Restored $name."
