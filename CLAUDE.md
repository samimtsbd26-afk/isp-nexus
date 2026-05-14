# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

ISP Nexus is a production-grade ISP management system for MikroTik-based networks. It handles PPPoE/hotspot billing, customer management, RADIUS authentication, real-time router monitoring, and a captive-portal flow with Telegram bot notifications.

## Monorepo layout

pnpm + Turborepo workspace with these packages:

| Path | Description |
|---|---|
| `apps/api` | Hono HTTP server + tRPC router + Socket.IO — the single backend |
| `apps/web` | React 19 admin SPA (Vite + Tailwind + tRPC client) |
| `apps/portal` | React 19 customer self-service portal (Vite) |
| `apps/hotspot` | Static HTML captive-portal pages served by Caddy |
| `apps/db-migrator` | One-shot Docker service that runs raw SQL migrations |
| `packages/db` | Drizzle ORM schema + `createDb()` factory |
| `packages/shared` | Pure utilities shared across apps (package duration helpers, Zod schemas) |
| `infrastructure/` | Caddy config, FreeRADIUS config, RADIUS SQL schema |

## Commands

```bash
# Install
pnpm install

# Dev (all apps in parallel via Turborepo TUI)
pnpm dev

# Dev individual app
pnpm --filter @isp-nexus/api dev
pnpm --filter @isp-nexus/web dev
pnpm --filter @isp-nexus/portal dev

# Build
pnpm build

# Type-check (all)
pnpm typecheck

# Lint
pnpm lint

# Format
pnpm format

# Database — generate migration after schema change
pnpm db:generate

# Database — apply migrations to local DB (host-side, not Docker)
pnpm db:migrate

# Seed
pnpm db:seed

# Validate .env before deploy
pnpm env:check
```

### Docker (full stack)
```bash
# Core services (no RADIUS)
docker compose up -d

# Include FreeRADIUS
docker compose --profile radius up -d

# Include PGAdmin
docker compose --profile tools up -d
```

## Environment

Copy `.env.example` to `.env` in the monorepo root and fill in required secrets. The API reads from `../../.env` at startup in development; production uses real env vars injected by Docker Compose.

Critical secrets that must be set:
- `POSTGRES_PASSWORD` / `DATABASE_URL`
- `REDIS_PASSWORD` / `REDIS_URL`
- `JWT_SECRET`, `PORTAL_JWT_SECRET` (≥16 chars each, 64-char hex recommended)
- `ENCRYPTION_KEY` — 32-byte hex, used for AES-256-GCM encryption of router passwords

Set `MIKROTIK_MOCK=true` to bypass real MikroTik connections during local development.

## Architecture

### API (`apps/api`)

- **Framework**: Hono on Node.js (`@hono/node-server`), port 3001
- **RPC**: tRPC v11 mounted at `/api/trpc/*` — all admin/portal procedures live here
- **REST routes**: Defined inline in `boot.ts` for the public captive-portal endpoints (`/api/portal/*`, `/api/hotspot-assets/*`)
- **Real-time**: Socket.IO on the same HTTP server; clients join `org:<id>` or `customer:<id>` rooms; events are emitted via `emitOrgEvent()` / `emitCustomerEvent()` in `boot.ts`
- **Background jobs**: BullMQ workers started only in `NODE_ENV=production` — monitoring, alerts, expiry, sync, security, warning queues (see `src/jobs/queue.ts`)

**tRPC procedure tiers** (`src/middleware.ts`):
- `publicProcedure` — unauthenticated
- `authedProcedure` — any logged-in user
- `adminProcedure` — role must be `admin` or `superadmin`
- `superadminProcedure` — role must be `superadmin`

**Context** (`src/context.ts`): Every tRPC call receives `{ db, redis, user, orgId, req, resHeaders }`. Auth is cookie (`isp_access`) or `Authorization: Bearer` JWT.

**Crypto** (`src/lib/crypto.ts`): Router passwords are stored AES-256-GCM encrypted in the DB using `ENCRYPTION_KEY`. Always call `decryptText()` before passing a password to MikroTik.

### Database (`packages/db`)

Drizzle ORM + postgres.js, PostgreSQL 16.

Schema is a single file: `packages/db/src/schema/index.ts`. All business tables are defined there. FreeRADIUS tables (`radcheck`, `radreply`, etc.) are managed separately via `infrastructure/radius/sql/schema.sql` and are excluded from drizzle-kit with `tablesFilter`.

**Migration approach**: The Docker `db-migrator` service is canonical for production. It runs raw SQL files from `packages/db/migrations/` skipping already-applied statements (by catching pg error codes 42710, 42P07, etc.). For local dev, `pnpm db:migrate` runs drizzle-kit against `DATABASE_URL` from `.env`.

Key tables:
- `organizations` / `users` — multi-tenant core
- `routers` — MikroTik devices; `passwordEncrypted` is AES-encrypted
- `customers`, `subscriptions`, `packages`, `orders`, `invoices` — billing
- `hotspotUsers`, `pppoeUsers` — synced from MikroTik; not authoritative source
- `resourceSnapshots`, `bandwidthSnapshots`, `pingSnapshots`, `sfpSnapshots` — time-series monitoring data
- `radcheck`, `radreply` (FreeRADIUS schema) — managed by `infrastructure/radius/sql/schema.sql`

### Frontend apps

Both `apps/web` and `apps/portal` are React 19 SPAs using:
- **tRPC** client (`@trpc/react-query`) — imports the router type directly from `@isp-nexus/api/router` (workspace reference, no codegen)
- **Tailwind CSS** with CSS variable–based theming (dark mode via `class` strategy)
- **Sonner** for toast notifications
- **React Router v7** for routing
- **superjson** as tRPC transformer (handles `Date`, `Map`, `Set`, etc.)

The admin web app also uses Socket.IO (`src/lib/socket.ts`) to subscribe to live events.

### Captive portal flow

1. MikroTik redirects unauthenticated clients to `hotspot.skynity.org` (static HTML in `apps/hotspot/`)
2. Pages call the REST API at `/api/portal/*`
3. Trial registrations trigger a Telegram inline-keyboard message; admin taps Approve/Reject
4. On approval, the subscription is created and a hotspot user is provisioned in MikroTik + RADIUS

### MikroTik integration (`src/services/mikrotik/`)

`getMikroTikClient()` wraps `routeros-client` and provides `print / add / remove / exec`. The sync service (`sync.ts`) pulls hotspot/PPPoE users from MikroTik into local DB tables. The expiry service (`expiry.ts`) disables subscriptions past their `expiresAt` on both MikroTik and RADIUS.

### Infrastructure

Caddy handles TLS termination and reverse-proxies:
- `admin.skynity.org` → `web:3000` + `api:3001` (API/Socket.IO at `/api/*`, `/socket.io/*`)
- `api.skynity.org` → `api:3001`
- `wifi.skynity.org` → `portal:3002` + `api:3001` for `/api/*`
- `hotspot.skynity.org` / `:80` → static files from `apps/hotspot/`

## Key conventions

- All sensitive strings stored in DB (router passwords, session tokens) use `encryptText` / `decryptText` from `src/lib/crypto.ts`
- Every tRPC router file exports one router; they are all assembled in `src/router.ts`
- `orgId` scoping: every DB query must filter by `orgId` — the system is multi-tenant
- The `packages/shared` package must not import from `packages/db` or `apps/api`; it is imported by all three apps
- FreeRADIUS tables are never touched by drizzle-kit migrations; only by `infrastructure/radius/sql/schema.sql`
- After changing the Drizzle schema, always run `pnpm db:generate` to produce a new SQL migration file before committing
