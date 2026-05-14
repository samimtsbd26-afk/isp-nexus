#!/bin/bash
set -euo pipefail

DEST=/opt/backups/postgres
DATE=$(date +%Y%m%d_%H%M%S)
OUTFILE="${DEST}/pg_${DATE}.sql.gz"
ENV_FILE=/opt/isp-nexus/.env

DB_USER=$(grep '^POSTGRES_USER' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"'"'"'' | tr -d '"' || echo "isp_nexus_user")
DB_NAME=$(grep '^POSTGRES_DB'   "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"'"'"'' | tr -d '"' || echo "isp_nexus")
DB_USER=${DB_USER:-isp_nexus_user}
DB_NAME=${DB_NAME:-isp_nexus}

echo "[$(date '+%Y-%m-%d %H:%M:%S')] START postgres backup db=${DB_NAME} user=${DB_USER}"

mkdir -p "$DEST"

docker exec isp-nexus-postgres-1 pg_dump -U "$DB_USER" "$DB_NAME" \
  | gzip > "$OUTFILE"

SIZE=$(stat -c%s "$OUTFILE" 2>/dev/null || echo 0)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] DONE  file=${OUTFILE} size=${SIZE} bytes"

# 7-day rotation — delete files older than 7 days
DELETED=$(find "$DEST" -name 'pg_*.sql.gz' -mtime +7 -print -delete | wc -l)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ROTATE deleted=${DELETED} old files"
