ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "encrypted" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_org_key" UNIQUE ("org_id", "key");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
