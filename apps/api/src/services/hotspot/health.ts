import type { Db } from "@isp-nexus/db";
import { routers } from "@isp-nexus/db";
import { eq, and } from "drizzle-orm";
import { getRedis } from "../../lib/redis.js";
import { connectRouter } from "../../lib/mikrotik.js";
import { getSetting, SETTING_KEYS } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";

export interface ServiceHealth {
  ok: boolean;
  latencyMs: number | null;
  error?: string;
}

export interface HotspotHealth {
  mikrotik: ServiceHealth;
  redis: ServiceHealth;
  postgres: ServiceHealth;
  portal: ServiceHealth;
  tls: ServiceHealth;
  checkedAt: string;
  orgId: string;
}

const HEALTH_KEY = (orgId: string) => `health:status:${orgId}`;
const HEALTH_TTL = 180;

export async function runHealthCheck(db: Db, orgId: string): Promise<HotspotHealth> {
  const [mikrotik, redis, postgres, portalResult] = await Promise.allSettled([
    checkMikroTik(db, orgId),
    checkRedis(),
    checkPostgres(db),
    checkPortal(db, orgId),
  ]);

  const result: HotspotHealth = {
    mikrotik: mikrotik.status === "fulfilled" ? mikrotik.value : { ok: false, latencyMs: null, error: String(mikrotik.reason) },
    redis: redis.status === "fulfilled" ? redis.value : { ok: false, latencyMs: null, error: String(redis.reason) },
    postgres: postgres.status === "fulfilled" ? postgres.value : { ok: false, latencyMs: null, error: String(postgres.reason) },
    portal: portalResult.status === "fulfilled" ? portalResult.value.portal : { ok: false, latencyMs: null, error: String(portalResult.reason) },
    tls: portalResult.status === "fulfilled" ? portalResult.value.tls : { ok: false, latencyMs: null, error: "Portal check failed" },
    checkedAt: new Date().toISOString(),
    orgId,
  };

  try {
    const r = getRedis();
    await r.setex(HEALTH_KEY(orgId), HEALTH_TTL, JSON.stringify(result));
  } catch { /* non-fatal */ }

  logger.debug({ orgId, mikrotik: result.mikrotik.ok, redis: result.redis.ok, postgres: result.postgres.ok }, "Health check completed");
  return result;
}

export async function getCachedHealth(orgId: string): Promise<HotspotHealth | null> {
  try {
    const r = getRedis();
    const raw = await r.get(HEALTH_KEY(orgId));
    return raw ? (JSON.parse(raw) as HotspotHealth) : null;
  } catch {
    return null;
  }
}

async function checkMikroTik(db: Db, orgId: string): Promise<ServiceHealth> {
  const t = Date.now();
  const [router] = await db.select()
    .from(routers)
    .where(and(eq(routers.orgId, orgId), eq(routers.isActive, true), eq(routers.isDefault, true)))
    .limit(1);
  if (!router) return { ok: false, latencyMs: null, error: "No default router configured" };

  const client = await connectRouter(router);
  try {
    await client.print("/system/resource");
    return { ok: true, latencyMs: Date.now() - t };
  } finally {
    await client.close();
  }
}

async function checkRedis(): Promise<ServiceHealth> {
  const t = Date.now();
  await getRedis().ping();
  return { ok: true, latencyMs: Date.now() - t };
}

async function checkPostgres(db: Db): Promise<ServiceHealth> {
  const t = Date.now();
  await db.select({ id: routers.id }).from(routers).limit(1);
  return { ok: true, latencyMs: Date.now() - t };
}

async function checkPortal(db: Db, orgId: string): Promise<{ portal: ServiceHealth; tls: ServiceHealth }> {
  const t = Date.now();
  const domain = await getSetting(db, orgId, SETTING_KEYS.HOTSPOT_PRIMARY_DOMAIN)
    || await getSetting(db, orgId, SETTING_KEYS.PORTAL_DOMAIN);
  if (!domain) {
    const e = "Portal domain not configured";
    return { portal: { ok: false, latencyMs: null, error: e }, tls: { ok: false, latencyMs: null, error: e } };
  }

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${domain}/`, { method: "HEAD", signal: controller.signal, redirect: "follow" });
    clearTimeout(tid);
    const latencyMs = Date.now() - t;
    const isHttps = domain.startsWith("https://");
    return {
      portal: { ok: res.status < 500, latencyMs },
      tls: isHttps ? { ok: true, latencyMs: null } : { ok: false, latencyMs: null, error: "Not HTTPS" },
    };
  } catch (err: any) {
    clearTimeout(tid);
    const e = err?.message ?? "Portal unreachable";
    return { portal: { ok: false, latencyMs: Date.now() - t, error: e }, tls: { ok: false, latencyMs: null, error: e } };
  }
}
