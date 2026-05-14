ALTER TABLE "wireguard_peers" ADD COLUMN IF NOT EXISTS "private_key_enc" text;--> statement-breakpoint
ALTER TABLE "wireguard_peers" ADD COLUMN IF NOT EXISTS "server_public_key" text;--> statement-breakpoint
ALTER TABLE "wireguard_peers" ADD COLUMN IF NOT EXISTS "label" varchar(100);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wireguard_peers" ADD CONSTRAINT "wireguard_peers_router_pubkey" UNIQUE ("router_id", "public_key");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
