# SOP: Redis Failure

**Trigger:** API errors with "ECONNREFUSED redis", session login fails, jobs stop running.

## Impact Assessment

| Failure | Impact |
|---|---|
| Redis down | All admin sessions expire, BullMQ jobs halt, rate limiting down |
| Redis OOM | New keys rejected, potential data loss |
| Redis corruption | Possible data inconsistency |

## Step 1 — Diagnose

```bash
# Check container
docker ps | grep redis
docker logs isp-nexus-redis-1 --tail=50

# Test connectivity
docker exec isp-nexus-redis-1 redis-cli -a "$REDIS_PASSWORD" PING

# Check memory
docker exec isp-nexus-redis-1 redis-cli -a "$REDIS_PASSWORD" INFO memory | \
  grep -E "used_memory_human|maxmemory_human|mem_fragmentation"

# Check keyspace
docker exec isp-nexus-redis-1 redis-cli -a "$REDIS_PASSWORD" INFO keyspace

# Check slow log
docker exec isp-nexus-redis-1 redis-cli -a "$REDIS_PASSWORD" SLOWLOG GET 10
```

## Step 2A — Redis Down: Restart

```bash
cd /opt/isp-nexus
docker compose restart redis
sleep 5
docker exec isp-nexus-redis-1 redis-cli -a "$REDIS_PASSWORD" PING
```

## Step 2B — Redis OOM: Clear Stale Keys

```bash
# Check total keys
docker exec isp-nexus-redis-1 redis-cli -a "$REDIS_PASSWORD" DBSIZE

# Remove expired sessions (safe — they auto-expire anyway)
docker exec isp-nexus-redis-1 redis-cli -a "$REDIS_PASSWORD" \
  --scan --pattern "isp_sess:*" | \
  xargs -r docker exec -i isp-nexus-redis-1 redis-cli -a "$REDIS_PASSWORD" DEL

# Remove stale BullMQ completed jobs
docker exec isp-nexus-redis-1 redis-cli -a "$REDIS_PASSWORD" \
  --scan --pattern "bull:*:completed" | \
  xargs -r docker exec -i isp-nexus-redis-1 redis-cli -a "$REDIS_PASSWORD" DEL
```

## Step 2C — Full Reset (last resort)

```bash
# WARNING: loses all sessions and job queues
docker exec isp-nexus-redis-1 redis-cli -a "$REDIS_PASSWORD" FLUSHDB

# Restart API to re-register jobs
docker compose restart api
```

## Step 3 — Verify Recovery

```bash
# API health
curl -s http://127.0.0.1:8787/api/health

# Re-login as admin to get new session
# Check BullMQ queues resumed in /performance page

# Verify hotspot sessions not leaked
docker exec isp-nexus-redis-1 redis-cli -a "$REDIS_PASSWORD" \
  --scan --pattern "hotspot_sess:*" | wc -l
```

## Step 4 — Prevent Recurrence

```bash
# Set maxmemory policy (add to .env / docker-compose if not set)
docker exec isp-nexus-redis-1 redis-cli -a "$REDIS_PASSWORD" \
  CONFIG SET maxmemory-policy allkeys-lru

# Increase maxmemory if VPS allows
docker exec isp-nexus-redis-1 redis-cli -a "$REDIS_PASSWORD" \
  CONFIG SET maxmemory 512mb
```

## Monitoring Thresholds

| Metric | Warning | Critical |
|---|---|---|
| Memory usage | >70% | >90% |
| Connected clients | >50 | >200 |
| Keyspace misses | >30% | >60% |
