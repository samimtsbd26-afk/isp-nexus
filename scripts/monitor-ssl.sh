#!/usr/bin/env bash
# SSL Certificate Expiry Monitor
# Run: bash scripts/monitor-ssl.sh
# Add to cron: 0 8 * * * /opt/isp-nexus/scripts/monitor-ssl.sh >> /var/log/ssl-monitor.log 2>&1
set -euo pipefail

DOMAINS=(
  "admin.skynity.org"
  "wifi.skynity.org"
  "hotspot.skynity.org"
  "api.skynity.org"
)
WARN_DAYS=30
CRITICAL_DAYS=7
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

send_telegram() {
  local msg="$1"
  if [[ -n "$TELEGRAM_BOT_TOKEN" && -n "$TELEGRAM_CHAT_ID" ]]; then
    curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TELEGRAM_CHAT_ID}&text=${msg}&parse_mode=HTML" > /dev/null
  fi
}

echo "[$(date '+%Y-%m-%d %H:%M:%S')] SSL Certificate Check"
echo "=================================================="

ALL_OK=true
for domain in "${DOMAINS[@]}"; do
  expiry=$(echo | openssl s_client -connect "${domain}:443" -servername "$domain" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)

  if [[ -z "$expiry" ]]; then
    echo "  ❌ $domain — Cannot connect or no certificate"
    send_telegram "❌ SSL CHECK FAIL: $domain — no certificate found"
    ALL_OK=false
    continue
  fi

  expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || date -j -f "%b %d %H:%M:%S %Y %Z" "$expiry" +%s 2>/dev/null)
  now_epoch=$(date +%s)
  days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

  if [[ $days_left -le $CRITICAL_DAYS ]]; then
    echo "  🚨 $domain — CRITICAL: ${days_left} days left (expires: $expiry)"
    send_telegram "🚨 SSL CRITICAL: $domain expires in ${days_left} days!"
    ALL_OK=false
  elif [[ $days_left -le $WARN_DAYS ]]; then
    echo "  ⚠️  $domain — WARNING: ${days_left} days left (expires: $expiry)"
    send_telegram "⚠️ SSL WARNING: $domain expires in ${days_left} days"
    ALL_OK=false
  else
    echo "  ✅ $domain — OK: ${days_left} days remaining"
  fi
done

echo ""
if $ALL_OK; then
  echo "All SSL certificates are healthy."
else
  echo "Action required: renew expiring certificates via Caddy ACME or manual renewal."
  echo "Caddy auto-renews — check: docker logs isp-nexus-caddy-1 | grep -i 'renew\|acme'"
fi
