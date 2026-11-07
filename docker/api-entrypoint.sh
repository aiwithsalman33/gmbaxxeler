#!/bin/sh
# Checks settings, applies migrations, then starts the API.
set -e

node apps/api/dist/check-env.js

echo "Applying database migrations"
if ! node node_modules/prisma/build/index.js migrate deploy --schema packages/db/prisma/schema.prisma; then
  echo "Migrations failed. If the log says authentication failed, the postgres volume still has an older POSTGRES_PASSWORD." >&2
  exit 1
fi

exec node apps/api/dist/server.js
