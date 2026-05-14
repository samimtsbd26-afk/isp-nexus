DO $$ BEGIN
 CREATE TYPE "public"."package_duration_unit" AS ENUM('hour', 'day');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN IF NOT EXISTS "duration_value" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN IF NOT EXISTS "duration_unit" "package_duration_unit" DEFAULT 'day' NOT NULL;--> statement-breakpoint
UPDATE "packages" SET "duration_value" = GREATEST(1, COALESCE("validity_days", 30)), "duration_unit" = 'day'::"package_duration_unit";
