#!/usr/bin/env bash
# Backup Restore Drill — validates backup integrity without touching production
# Run monthly: bash scripts/backup-drill.sh
set -euo pipefail

DRILL_DB="isp_nexus_drill_$(date +%Y%m%d)"
LOG_FILE="/tmp/backup-drill-$(date +%Y%m%d).log"
PASS=0; FAIL=0

log()  { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
ok()   { log "  ✅ $*"; PASS=$((PASS+1)); }
fail() { log "  ❌ $*"; FAIL=$((FAIL+1)); }

log "=== Backup Restore Drill — $(date '+%Y-%m-%d') ==="

# Step 1 — Find latest backup
log "Step 1: Finding latest backup..."
BACKUP=$(ls -t /opt/backups/postgres/*.sql 2>/dev/null | head -1)
if [[ -z "$BACKUP" ]]; then
  BACKUP=$(ls -t /opt/backups/release-*/postgres_pre_deploy.sql 2>/dev/null | head -1)
fi
if [[ -z "$BACKUP" ]]; then
  fail "No backup files found in /opt/backups"
  exit 1
fi
ok "Backup found: $BACKUP ($(du -sh "$BACKUP" | cut -f1))"

# Step 2 — Create drill DB
log "Step 2: Creating drill database..."
docker exec isp-nexus-postgres-1 psql -U isp_nexus_user \
  -c "DROP DATABASE IF EXISTS ${DRILL_DB}; CREATE DATABASE ${DRILL_DB};" 2>/dev/null && \
  ok "Drill DB created: $DRILL_DB" || fail "Could not create drill DB"

# Step 3 — Restore backup
log "Step 3: Restoring backup to drill DB..."
START=$(date +%s)
docker exec -i isp-nexus-postgres-1 psql -U isp_nexus_user "$DRILL_DB" < "$BACKUP" 2>/dev/null && {
  END=$(date +%s)
  ok "Restore completed in $((END-START))s"
} || fail "Restore failed"

# Step 4 — Validate row counts
log "Step 4: Validating data integrity..."
TABLES=("customers" "subscriptions" "orders" "packages" "invoices")
for table in "${TABLES[@]}"; do
  count=$(docker exec isp-nexus-postgres-1 psql -U isp_nexus_user "$DRILL_DB" \
    -tAc "SELECT count(*) FROM $table;" 2>/dev/null || echo "-1")
  if [[ "$count" -ge 0 ]]; then
    ok "$table: $count rows"
  else
    fail "$table: query failed"
  fi
done

# Step 5 — Check foreign key integrity
log "Step 5: Foreign key integrity check..."
orphans=$(docker exec isp-nexus-postgres-1 psql -U isp_nexus_user "$DRILL_DB" \
  -tAc "SELECT count(*) FROM subscriptions s LEFT JOIN customers c ON s.customer_id=c.id WHERE c.id IS NULL;" 2>/dev/null || echo "error")
if [[ "$orphans" == "0" ]]; then
  ok "No orphaned subscriptions"
else
  fail "Found $orphans orphaned subscriptions"
fi

# Step 6 — Cleanup
log "Step 6: Cleaning up drill DB..."
docker exec isp-nexus-postgres-1 psql -U isp_nexus_user \
  -c "DROP DATABASE IF EXISTS ${DRILL_DB};" 2>/dev/null && ok "Drill DB cleaned up"

# Summary
log ""
log "=== DRILL RESULT: PASS=$PASS FAIL=$FAIL ==="
log "Log: $LOG_FILE"
[[ $FAIL -eq 0 ]] && log "✅ BACKUP DRILL PASSED — restore is viable" || log "❌ BACKUP DRILL FAILED — investigate before production use"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
