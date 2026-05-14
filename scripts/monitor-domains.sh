#!/usr/bin/env bash
# Domain & Endpoint Health Monitor
# Run: bash scripts/monitor-domains.sh
# Add to cron: */5 * * * * /opt/isp-nexus/scripts/monitor-domains.sh
set -euo pipefail

API_BASE="${API_BASE:-https://admin.skynity.org}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"
LOG_FILE="/var/log/isp-nexus-monitor.log"

CHECKS=(
  "admin.skynity.org:https://admin.skynity.org:200"
  "api.health:https://admin.skynity.org/api/health:200"
  "wifi.portal:https://wifi.skynity.org:200"
  "hotspot:https://hotspot.skynity.org:200"
)

send_telegram() {
  local msg="$1"
  [[ -z "$TELEGRAM_BOT_TOKEN" ]] && return
  curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT_ID}&text=${msg}" > /dev/null
}

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

FAILED=0
for check in "${CHECKS[@]}"; do
  IFS=: read -r name url expected_code <<< "$check"
  url="${url/https/https}"  # preserve scheme

  actual=$(curl -skI --max-time 10 "$url" 2>/dev/null | head -1 | awk '{print $2}')

  if [[ "$actual" == "$expected_code" ]]; then
    log "✅ $name — HTTP $actual"
  else
    log "❌ $name — Expected $expected_code got ${actual:-TIMEOUT}"
    send_telegram "🚨 DOWN: $name ($url) — Expected $expected_code got ${actual:-TIMEOUT}"
    FAILED=$((FAILED + 1))
  fi
done

# Check internal API health JSON
health=$(curl -sk --max-time 5 "${API_BASE}/api/health" 2>/dev/null)
if echo "$health" | grep -q '"ok":true'; then
  log "✅ api.json — healthy"
else
  log "❌ api.json — response: $health"
  send_telegram "🚨 API UNHEALTHY: $health"
  FAILED=$((FAILED + 1))
fi

[[ $FAILED -eq 0 ]] && exit 0 || exit 1
