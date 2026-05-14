CREATE TABLE IF NOT EXISTS "vps_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "label" varchar(100) NOT NULL,
  "host" varchar(255) NOT NULL,
  "port" integer NOT NULL DEFAULT 22,
  "username" varchar(100) NOT NULL DEFAULT 'root',
  "auth_type" varchar(20) NOT NULL DEFAULT 'key',
  "private_key_enc" text,
  "password_enc" text,
  "is_default" boolean NOT NULL DEFAULT false,
  "last_tested_at" timestamptz,
  "last_test_ok" boolean,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
