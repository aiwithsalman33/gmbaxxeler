#!/bin/sh
# Checks settings, applies migrations, then starts the API. server.js logs steps 3 to 5.
set -e

echo "[startup] 1/5 Checking environment variables"
node apps/api/dist/check-env.js

echo "[startup] 2/5 Applying database migrations"
output=/tmp/migrate.log
if node node_modules/prisma/build/index.js migrate deploy --schema packages/db/prisma/schema.prisma >"$output" 2>&1; then
  cat "$output"
else
  cat "$output" >&2
  case "$(cat "$output")" in
    *P1000*) cause="postgres rejected the password. Its volume keeps the POSTGRES_PASSWORD it first started with, so restore that value or delete the volume" ;;
    *P1001* | *P1002*) cause="can not reach postgres. Check that it is healthy and that DATABASE_URL points at it" ;;
    *P1003*) cause="the database does not exist. Check POSTGRES_DB" ;;
    *P3009* | *P3018*) cause="a migration failed part way through. See the Prisma error above" ;;
    *) cause="see the Prisma error above" ;;
  esac
  echo "STARTUP FAILED: database migrations: $cause" >&2
  exit 1
fi

exec node apps/api/dist/server.js
