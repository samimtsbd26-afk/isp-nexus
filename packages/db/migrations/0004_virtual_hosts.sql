CREATE TABLE IF NOT EXISTS "virtual_hosts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "domain" varchar(255) NOT NULL,
  "label" varchar(100),
  "is_enabled" boolean NOT NULL DEFAULT true,
  "listen_http" boolean NOT NULL DEFAULT false,
  "primary_upstream" varchar(255),
  "has_api_proxy" boolean NOT NULL DEFAULT false,
  "api_upstream" varchar(255) DEFAULT 'api:3001',
  "has_socket_proxy" boolean NOT NULL DEFAULT false,
  "static_root" varchar(255),
  "static_fallback" varchar(100),
  "gzip_enabled" boolean NOT NULL DEFAULT true,
  "security_headers" boolean NOT NULL DEFAULT false,
  "cache_control" varchar(100),
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "virtual_hosts" ADD CONSTRAINT "virtual_hosts_org_domain" UNIQUE ("org_id", "domain");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- Seed default virtual hosts from the existing Caddyfile config.
-- Uses the first organization found (single-tenant bootstrap scenario).
-- In multi-tenant setups, repeat this INSERT for each org as needed.
INSERT INTO "virtual_hosts" ("org_id", "domain", "label", "has_api_proxy", "has_socket_proxy", "primary_upstream", "security_headers", "sort_order")
SELECT
  id,
  'admin.skynity.org',
  'Admin Panel',
  true,
  true,
  'web:3000',
  true,
  10
FROM "organizations"
ORDER BY "created_at" ASC
LIMIT 1
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "virtual_hosts" ("org_id", "domain", "label", "has_api_proxy", "primary_upstream", "sort_order")
SELECT
  id,
  'api.skynity.org',
  'Backend API',
  false,
  'api:3001',
  20
FROM "organizations"
ORDER BY "created_at" ASC
LIMIT 1
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "virtual_hosts" ("org_id", "domain", "label", "has_api_proxy", "primary_upstream", "security_headers", "sort_order")
SELECT
  id,
  'wifi.skynity.org',
  'Customer Portal',
  true,
  'portal:3002',
  true,
  30
FROM "organizations"
ORDER BY "created_at" ASC
LIMIT 1
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "virtual_hosts" ("org_id", "domain", "label", "has_api_proxy", "static_root", "static_fallback", "cache_control", "sort_order")
SELECT
  id,
  'hotspot.skynity.org',
  'Hotspot Captive Portal',
  true,
  '/srv/hotspot',
  'login.html',
  'no-store',
  40
FROM "organizations"
ORDER BY "created_at" ASC
LIMIT 1
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "virtual_hosts" ("org_id", "domain", "label", "listen_http", "has_api_proxy", "static_root", "static_fallback", "cache_control", "sort_order")
SELECT
  id,
  ':80',
  'HTTP (MikroTik Captive Portal)',
  true,
  true,
  '/srv/hotspot',
  'login.html',
  'no-store',
  50
FROM "organizations"
ORDER BY "created_at" ASC
LIMIT 1
ON CONFLICT DO NOTHING;
