import { config } from "dotenv";
import { resolve } from "node:path";

// Load .env from package dir, then fall back to monorepo root
config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), "../../.env") });

import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT_API: z.coerce.number().default(3001),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string({ required_error: "DATABASE_URL is required — copy .env.example to .env" }),
  REDIS_URL: z.string({ required_error: "REDIS_URL is required — copy .env.example to .env" }),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  JWT_ACCESS_EXPIRES: z.string().default("15m"),
  JWT_REFRESH_EXPIRES: z.string().default("30d"),
  PORTAL_JWT_SECRET: z.string().min(16, "PORTAL_JWT_SECRET must be at least 16 chars"),
  ENCRYPTION_KEY: z.string().min(32, "ENCRYPTION_KEY must be at least 32 hex chars"),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ADMIN_CHAT_IDS: z.string().optional(),
  MIKROTIK_DEFAULT_API_PORT: z.coerce.number().default(8728),
  MIKROTIK_API_TIMEOUT_MS: z.coerce.number().default(5000),
  MIKROTIK_MOCK: z.string().default("false"),
  BOOTSTRAP_ORG_NAME: z.string().default("My ISP"),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
  API_URL: z.string().default("http://localhost:3001"),
  APP_URL: z.string().default("http://localhost:3000"),
  PORTAL_URL: z.string().default("http://localhost:3002"),
  HOTSPOT_URL: z.string().optional(),
  CORS_ORIGINS: z.string().default("https://admin.skynity.org,https://wifi.skynity.org,https://hotspot.skynity.org"),
  PORTAL_JWT_EXPIRES: z.string().default("7d"),
  CADDY_ADMIN_URL: z.string().default("http://localhost:2019"),
  SSL_EMAIL: z.string().email().optional(),
  RADIUS_SECRET: z.string().default("changeme"),
  RADIUS_AUTH_PORT: z.coerce.number().default(1812),
  RADIUS_ACCT_PORT: z.coerce.number().default(1813),
  WG_INTERFACE: z.string().default("wg0"),
  WG_SERVER_IP: z.string().default("10.100.0.1/24"),
  WG_LISTEN_PORT: z.coerce.number().default(51820),
  WG_DNS: z.string().default("1.1.1.1,8.8.8.8"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Missing env vars — copy .env.example to .env and fill in values:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
