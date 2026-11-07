#!/bin/sh
# Writes one compressed dump to /backups and keeps the newest BACKUP_KEEP files.
set -eu

file="/backups/localpilot-$(date -u +%Y%m%d-%H%M%S).sql.gz"
tmp="$file.partial"

pg_dump --no-owner --no-privileges | gzip > "$tmp"
mv "$tmp" "$file"
echo "backup written: $file"

ls -1t /backups/localpilot-*.sql.gz | tail -n +"$((${BACKUP_KEEP:-14} + 1))" | xargs -r rm -f
