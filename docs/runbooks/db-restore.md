# SOP: Database Restore

**Trigger:** Data corruption, accidental deletion, migration failure, or disaster recovery.

## Before You Start

```bash
# STOP all writes first
docker compose stop api portal

# Confirm backup exists
ls -lht /opt/backups/postgres/ | head -10

# Confirm current DB state
docker exec isp-nexus-postgres-1 psql -U isp_nexus_user -d isp_nexus \
  -c "SELECT count(*) FROM customers; SELECT count(*) FROM subscriptions;"
```

## Step 1 — Choose Backup

```bash
# List available backups (newest first)
ls -lt /opt/backups/postgres/*.sql 2>/dev/null | head -10

# Also check deploy-time backups
ls -lt /opt/backups/release-*/postgres_pre_deploy.sql 2>/dev/null | head -5
```

## Step 2 — Full Restore

```bash
BACKUP_FILE="/opt/backups/postgres/YYYY-MM-DD_HH-MM-SS.sql"

# Drop & recreate DB (DESTRUCTIVE — confirm first)
docker exec isp-nexus-postgres-1 psql -U isp_nexus_user -c \
  "DROP DATABASE IF EXISTS isp_nexus_restore; CREATE DATABASE isp_nexus_restore;"

# Restore to temporary DB first (verify before replacing main)
docker exec -i isp-nexus-postgres-1 psql -U isp_nexus_user isp_nexus_restore \
  < "$BACKUP_FILE"

# Verify restore
docker exec isp-nexus-postgres-1 psql -U isp_nexus_user -d isp_nexus_restore \
  -c "SELECT count(*) FROM customers; SELECT count(*) FROM subscriptions;"
```

## Step 3 — Swap to Restored DB

```bash
# If restore looks good — swap
docker exec isp-nexus-postgres-1 psql -U isp_nexus_user -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='isp_nexus';"

docker exec isp-nexus-postgres-1 psql -U isp_nexus_user -c \
  "ALTER DATABASE isp_nexus RENAME TO isp_nexus_old;"

docker exec isp-nexus-postgres-1 psql -U isp_nexus_user -c \
  "ALTER DATABASE isp_nexus_restore RENAME TO isp_nexus;"
```

## Step 4 — Run Migrations

```bash
# Re-apply any migrations that were applied after the backup
docker compose run --rm db-migrator
```

## Step 5 — Restart & Verify

```bash
docker compose up -d api portal

sleep 15

# Health check
curl -s http://127.0.0.1:8787/api/health

# Verify data
curl -s "http://127.0.0.1:8787/api/trpc/analytics.dashboard" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Step 6 — Cleanup

```bash
# Remove old DB after 24h verification window
docker exec isp-nexus-postgres-1 psql -U isp_nexus_user -c \
  "DROP DATABASE IF EXISTS isp_nexus_old;"
```

## Point-in-Time Recovery (partial data loss)

```bash
# Extract specific table from backup
pg_restore --table=customers "$BACKUP_FILE" > customers_restore.sql

# Import specific rows
docker exec -i isp-nexus-postgres-1 psql -U isp_nexus_user isp_nexus \
  < customers_restore.sql
```

## Recovery Time Objectives

| Scenario | Target RTO |
|---|---|
| Single table restore | <15 min |
| Full DB restore | <30 min |
| Complete system restore | <60 min |
