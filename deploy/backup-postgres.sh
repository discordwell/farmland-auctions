#!/usr/bin/env bash
set -euo pipefail

backup_dir="${BACKUP_DIR:-/opt/farmauction/backups}"
container="${POSTGRES_CONTAINER:-farmauction-postgres}"
database="${POSTGRES_DB:-farmauction}"
user="${POSTGRES_USER:-farmauction}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$backup_dir"
umask 077

docker exec "$container" pg_dump -U "$user" -d "$database" --format=custom --no-owner --no-acl \
  > "$backup_dir/farmauction-$timestamp.dump"

find "$backup_dir" -name 'farmauction-*.dump' -type f -mtime +14 -delete
printf 'backup written: %s\n' "$backup_dir/farmauction-$timestamp.dump"
