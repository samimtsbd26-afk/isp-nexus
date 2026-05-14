import { eq, and } from "drizzle-orm";
import { appSettings } from "@isp-nexus/db";
import { decryptText, encryptText } from "./crypto.js";
import { logger } from "./logger.js";
import type { Db } from "@isp-nexus/db";

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  value: string | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(orgId: string, key: string): string {
  return `${orgId}::${key}`;
}

export async function getSetting(db: Db, orgId: string, key: string): Promise<string | null> {
  const ck = cacheKey(orgId, key);
  const hit = cache.get(ck);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const [row] = await db
    .select()
    .from(appSettings)
    .where(and(eq(appSettings.orgId, orgId), eq(appSettings.key, key)))
    .limit(1);

  if (!row) {
    cache.set(ck, { value: null, expiresAt: Date.now() + CACHE_TTL_MS });
    return null;
  }

  const value = row.encrypted && row.value ? decryptText(row.value) : row.value;
  cache.set(ck, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export async function getSettingWithFallback(
  db: Db,
  orgId: string,
  key: string,
  envFallback: string | undefined,
): Promise<string | undefined> {
  try {
    const val = await getSetting(db, orgId, key);
    return val ?? envFallback;
  } catch (err) {
    logger.warn({ err, orgId, key }, "ConfigService getSetting failed, using env fallback");
    return envFallback;
  }
}

export async function setSetting(
  db: Db,
  orgId: string,
  key: string,
  value: string,
  opts: { encrypted?: boolean; type?: string; description?: string } = {},
): Promise<void> {
  const storedValue = opts.encrypted ? encryptText(value) : value;
  await db
    .insert(appSettings)
    .values({
      orgId,
      key,
      value: storedValue,
      type: opts.type ?? "string",
      encrypted: opts.encrypted ?? false,
      description: opts.description,
    })
    .onConflictDoUpdate({
      target: [appSettings.orgId, appSettings.key],
      set: {
        value: storedValue,
        encrypted: opts.encrypted ?? false,
        updatedAt: new Date(),
      },
    });
  cache.delete(cacheKey(orgId, key));
}

export function invalidateSettingCache(orgId: string, key?: string): void {
  if (key) {
    cache.delete(cacheKey(orgId, key));
  } else {
    for (const k of cache.keys()) {
      if (k.startsWith(`${orgId}::`)) cache.delete(k);
    }
  }
}

// Well-known setting keys — import these instead of using raw strings
export const SETTING_KEYS = {
  CORS_ORIGINS: "cors_origins",
  PORTAL_JWT_EXPIRES: "portal_jwt_expires",
  HOTSPOT_REDIRECT_URL: "hotspot_redirect_url",
  TELEGRAM_BOT_TOKEN: "telegram_bot_token",
  API_URL: "api_url",
  ADMIN_DOMAIN: "admin_domain",
  PORTAL_DOMAIN: "portal_domain",
  HOTSPOT_DOMAIN: "hotspot_domain",

  // Hotspot portal config
  HOTSPOT_PORTAL_NAME: "hotspot_portal_name",
  HOTSPOT_PRIMARY_DOMAIN: "hotspot_primary_domain",
  HOTSPOT_BACKUP_DOMAIN: "hotspot_backup_domain",
  HOTSPOT_API_DOMAIN: "hotspot_api_domain",
  HOTSPOT_LOGO_URL: "hotspot_logo_url",
  HOTSPOT_THEME_COLOR: "hotspot_theme_color",
  HOTSPOT_BG_COLOR: "hotspot_bg_color",

  // MikroTik hotspot endpoints
  HOTSPOT_MIKROTIK_GATEWAY: "hotspot_mikrotik_gateway",
  HOTSPOT_MIKROTIK_LOGIN_URL: "hotspot_mikrotik_login_url",
  HOTSPOT_MIKROTIK_STATUS_URL: "hotspot_mikrotik_status_url",
  HOTSPOT_MIKROTIK_LOGOUT_URL: "hotspot_mikrotik_logout_url",

  // Hotspot portal behavior
  HOTSPOT_TRIAL_ENABLED: "hotspot_trial_enabled",
  HOTSPOT_APPROVAL_MODE: "hotspot_approval_mode",
  HOTSPOT_SESSION_TIMEOUT: "hotspot_session_timeout",
  HOTSPOT_DEVICE_LIMIT: "hotspot_device_limit",
  HOTSPOT_COOKIE_LIFETIME: "hotspot_cookie_lifetime",

  // Hotspot UI
  HOTSPOT_LANGUAGE: "hotspot_language",
  HOTSPOT_TEMPLATE: "hotspot_template",
  HOTSPOT_BG_TYPE: "hotspot_bg_type",
  HOTSPOT_ANIMATION: "hotspot_animation",
} as const;

export const HOTSPOT_CONFIG_KEYS = [
  "hotspot_portal_name",
  "hotspot_primary_domain",
  "hotspot_backup_domain",
  "hotspot_api_domain",
  "hotspot_logo_url",
  "hotspot_theme_color",
  "hotspot_bg_color",
  "hotspot_mikrotik_gateway",
  "hotspot_mikrotik_login_url",
  "hotspot_mikrotik_status_url",
  "hotspot_mikrotik_logout_url",
  "hotspot_trial_enabled",
  "hotspot_approval_mode",
  "hotspot_session_timeout",
  "hotspot_device_limit",
  "hotspot_cookie_lifetime",
  "hotspot_language",
  "hotspot_template",
  "hotspot_bg_type",
  "hotspot_animation",
  "hotspot_redirect_url",
] as const;
