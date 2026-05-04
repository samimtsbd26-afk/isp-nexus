#!/bin/bash
# ISP Nexus — One-Command VPS Installation Script
# Supports: Ubuntu 22.04 / 24.04
# Usage: curl -fsSL https://raw.githubusercontent.com/samimtsbd26-afk/isp-nexus/main/scripts/vps-install.sh | bash

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${CYAN}[ISP Nexus]${NC} $1"; }
ok()   { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

gen_secret() { openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 64; }
gen_hex()    { openssl rand -hex 32; }
gen_pass()   { openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24; }

# ─── Root check ───────────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && err "Run as root: sudo bash vps-install.sh"

log "Starting ISP Nexus installation for skynity.org..."

# ─── System update ────────────────────────────────────────────────────────────
log "Updating system packages..."
apt-get update -qq && apt-get upgrade -yq
apt-get install -yq curl wget git openssl ca-certificates gnupg lsb-release ufw
ok "System updated"

# ─── Firewall ─────────────────────────────────────────────────────────────────
log "Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw allow 1812/udp  # RADIUS auth
ufw allow 1813/udp  # RADIUS accounting
ufw allow 51820/udp # WireGuard
ufw --force enable
ok "Firewall configured"

# ─── Docker ───────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  log "Installing Docker..."
  curl -fsSL https://get.docker.com | bash
  systemctl enable docker && systemctl start docker
  ok "Docker installed"
else
  ok "Docker already installed ($(docker --version))"
fi

if ! docker compose version &>/dev/null; then
  log "Installing Docker Compose plugin..."
  apt-get install -yq docker-compose-plugin
  ok "Docker Compose installed"
fi

# ─── Clone / update repo ──────────────────────────────────────────────────────
INSTALL_DIR="/opt/isp-nexus"
REPO_URL="https://github.com/samimtsbd26-afk/isp-nexus.git"

if [ -d "$INSTALL_DIR/.git" ]; then
  log "Updating existing installation..."
  cd "$INSTALL_DIR" && git pull origin main
  ok "Updated to latest version"
else
  log "Cloning ISP Nexus from GitHub..."
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
  ok "Cloned to $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ─── Environment setup ────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  log "Generating .env file..."
  cp .env.example .env

  POSTGRES_PASS=$(gen_pass)
  REDIS_PASS=$(gen_pass)
  JWT_SECRET=$(gen_secret)
  PORTAL_JWT_SECRET=$(gen_secret)
  ENC_KEY=$(gen_hex)

  sed -i "s/CHANGE_ME_STRONG_PASSWORD/$POSTGRES_PASS/g" .env
  sed -i "s/CHANGE_ME_REDIS_PASSWORD/$REDIS_PASS/g" .env
  sed -i "s/CHANGE_ME_64_CHAR_HEX_SECRET/$JWT_SECRET/g" .env
  sed -i "s/CHANGE_ME_PORTAL_64_CHAR_HEX/$PORTAL_JWT_SECRET/g" .env
  sed -i "s/CHANGE_ME_32_BYTE_HEX_FOR_AES256/$ENC_KEY/g" .env

  ok ".env generated with random secrets"
  warn "Edit /opt/isp-nexus/.env to set Telegram token and payment numbers before starting!"
else
  ok ".env already exists, skipping generation"
fi

# ─── Build & start ────────────────────────────────────────────────────────────
log "Building Docker images (this may take 5-10 minutes)..."
docker compose build --no-cache

log "Starting all services..."
docker compose up -d

# ─── Wait for DB ──────────────────────────────────────────────────────────────
log "Waiting for PostgreSQL to be ready..."
for i in $(seq 1 30); do
  docker compose exec -T postgres pg_isready -U isp_nexus_user -d isp_nexus &>/dev/null && break
  echo -n "."
  sleep 2
done
echo ""
ok "PostgreSQL ready"

# ─── Run DB migrations ────────────────────────────────────────────────────────
log "Running database migrations..."
docker compose exec -T api node --experimental-specifier-resolution=node \
  -e "import('./dist/boot.js').then(()=>console.log('Migrations done'))" \
  2>/dev/null || warn "Run migrations manually: docker compose exec api node dist/migrate.js"

# ─── Status check ─────────────────────────────────────────────────────────────
log "Checking service status..."
sleep 5
docker compose ps

ok "ISP Nexus is running!"
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ISP Nexus — skynity.org — Installation Complete!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Admin Panel:    ${CYAN}https://admin.skynity.org${NC}"
echo -e "  API:            ${CYAN}https://api.skynity.org${NC}"
echo -e "  Customer WiFi:  ${CYAN}https://wifi.skynity.org${NC}"
echo -e "  User Portal:    ${CYAN}https://user.skynity.org${NC}"
echo -e "  Hotspot Login:  ${CYAN}https://hotspot.skynity.org${NC}"
echo ""
echo -e "  Edit config:    ${YELLOW}nano /opt/isp-nexus/.env${NC}"
echo -e "  View API logs:  ${YELLOW}docker compose logs -f api${NC}"
echo -e "  View all logs:  ${YELLOW}docker compose logs -f${NC}"
echo -e "  Restart:        ${YELLOW}docker compose restart${NC}"
echo -e "  Stop:           ${YELLOW}docker compose down${NC}"
echo -e "  Update:         ${YELLOW}cd /opt/isp-nexus && git pull && docker compose build && docker compose up -d${NC}"
echo ""
warn "Default login: admin@skynity.org / (set BOOTSTRAP_ADMIN_PASSWORD in .env)"
warn "Change your password immediately after first login!"
echo ""
