import { z } from "zod";
import { sql, eq, and, desc, gte } from "drizzle-orm";
import { router, authedProcedure, adminProcedure, publicProcedure } from "../middleware.js";
import { appSettings, paymentConfigs, smsLogs, orders, subscriptions, routers, customers, packages } from "@isp-nexus/db";
import { logActivity } from "../lib/activity.js";
import { getSetting, setSetting, invalidateSettingCache, SETTING_KEYS, HOTSPOT_CONFIG_KEYS } from "../lib/config.js";
import { refreshCorsOrigins } from "../lib/cors-state.js";
import { connectRouter } from "../lib/mikrotik.js";
import { getRedis } from "../lib/redis.js";
import { buildCaddyConfig } from "../services/caddy/config-builder.js";
import { applyCaddyConfig } from "../services/caddy/client.js";
import { getCachedHealth, runHealthCheck } from "../services/hotspot/health.js";
import { logger } from "../lib/logger.js";

const SMS_PROVIDERS = ["ssl_wireless", "bulksmsbd", "greenwebbd", "disabled"] as const;
type SmsProvider = typeof SMS_PROVIDERS[number];

const REDIRECT_LOG_KEY = (orgId: string) => `hotspot:redirect_log:${orgId}`;
const AUTOLOGIN_LOG_KEY = (orgId: string) => `hotspot:autologin_log:${orgId}`;
const MAX_LOG_ENTRIES = 500;

async function applyWalledGarden(db: any, orgId: string, domains: string[]): Promise<void> {
  const clean = domains.map((d) => d.replace(/^https?:\/\//, "").split("/")[0]).filter(Boolean);
  if (!clean.length) return;
  const [router] = await db.select().from(routers)
    .where(and(eq(routers.orgId, orgId), eq(routers.isActive, true), eq(routers.isDefault, true)))
    .limit(1);
  if (!router) return;
  const client = await connectRouter(router);
  try {
    const existing = await client.print("/ip/hotspot/walled-garden").catch(() => [] as any[]);
    const existingHosts = new Set((existing as any[]).map((e: any) => e["dst-host"] ?? ""));
    for (const host of clean) {
      if (!existingHosts.has(host)) {
        await client.add("/ip/hotspot/walled-garden", { "dst-host": host, comment: "auto:hotspot-config" }).catch(() => {});
      }
    }
  } finally {
    await client.close();
  }
}

async function applyHotspotProfile(db: any, orgId: string, sessionTimeout: string): Promise<void> {
  const timeoutSec = parseInt(sessionTimeout, 10);
  if (!timeoutSec || timeoutSec < 60) return;
  const [router] = await db.select().from(routers)
    .where(and(eq(routers.orgId, orgId), eq(routers.isActive, true), eq(routers.isDefault, true)))
    .limit(1);
  if (!router) return;
  const client = await connectRouter(router);
  try {
    const profiles = await client.print("/ip/hotspot/user/profile").catch(() => [] as any[]);
    for (const p of profiles as any[]) {
      if (p[".id"]) {
        await client.exec("/ip/hotspot/user/profile", "set", {
          ".id": p[".id"],
          "session-timeout": `${timeoutSec}s`,
        }).catch(() => {});
      }
    }
  } finally {
    await client.close();
  }
}

export const settingsRouter = router({
  get: authedProcedure.input(z.object({ key: z.string() })).query(async ({ ctx, input }) => {
    return getSetting(ctx.db, ctx.orgId, input.key);
  }),

  set: adminProcedure.input(z.object({
    key: z.string(),
    value: z.string(),
    encrypted: z.boolean().optional(),
    description: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    await setSetting(ctx.db, ctx.orgId, input.key, input.value, {
      encrypted: input.encrypted,
      description: input.description,
    });
    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "update", "setting", ctx.orgId, { key: input.key });
    return { ok: true };
  }),

  setBulk: adminProcedure
    .input(z.array(z.object({ key: z.string(), value: z.string(), encrypted: z.boolean().optional() })))
    .mutation(async ({ ctx, input }) => {
      for (const { key, value, encrypted } of input) {
        await setSetting(ctx.db, ctx.orgId, key, value, { encrypted });
      }
      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "update", "settings_bulk", ctx.orgId, { keys: input.map((i) => i.key) });
      return { ok: true };
    }),

  listAll: authedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(appSettings).where(eq(appSettings.orgId, ctx.orgId));
    return rows.map((r) => ({ ...r, value: r.encrypted ? "••••••••" : r.value }));
  }),

  // ── CORS origins ──────────────────────────────────────────────────────────

  getCorsOrigins: authedProcedure.query(async ({ ctx }) => {
    const stored = await getSetting(ctx.db, ctx.orgId, SETTING_KEYS.CORS_ORIGINS);
    return { origins: stored ? stored.split(",").map((o) => o.trim()).filter(Boolean) : [] };
  }),

  setCorsOrigins: adminProcedure
    .input(z.object({ origins: z.array(z.string().url()) }))
    .mutation(async ({ ctx, input }) => {
      const value = input.origins.join(",");
      await setSetting(ctx.db, ctx.orgId, SETTING_KEYS.CORS_ORIGINS, value, {
        description: "Browser-allowed CORS origins (comma-separated URLs)",
      });
      refreshCorsOrigins(input.origins);
      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "update", "cors_origins", ctx.orgId, {});
      return { ok: true };
    }),

  // ── Portal JWT expiry ─────────────────────────────────────────────────────

  getPortalJwtExpires: authedProcedure.query(async ({ ctx }) => {
    const val = await getSetting(ctx.db, ctx.orgId, SETTING_KEYS.PORTAL_JWT_EXPIRES);
    return { expires: val ?? "7d" };
  }),

  setPortalJwtExpires: adminProcedure
    .input(z.object({ expires: z.string().regex(/^\d+[smhd]$/, "Format: 30m, 7d, 24h") }))
    .mutation(async ({ ctx, input }) => {
      await setSetting(ctx.db, ctx.orgId, SETTING_KEYS.PORTAL_JWT_EXPIRES, input.expires, {
        description: "Portal customer JWT session expiry (e.g. 7d, 24h)",
      });
      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "update", "portal_jwt_expires", ctx.orgId, { expires: input.expires });
      return { ok: true };
    }),

  // ── Payment configs ───────────────────────────────────────────────────────

  listPaymentConfigs: authedProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(paymentConfigs).where(eq(paymentConfigs.orgId, ctx.orgId));
  }),

  publicPaymentConfigs: publicProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select({
        method: paymentConfigs.method,
        accountNumber: paymentConfigs.accountNumber,
        accountType: paymentConfigs.accountType,
        instructions: paymentConfigs.instructions,
      }).from(paymentConfigs)
        .where(and(eq(paymentConfigs.orgId, input.orgId), eq(paymentConfigs.isActive, true)));
    }),

  upsertPaymentConfig: adminProcedure.input(z.object({
    method: z.enum(["bkash", "nagad", "rocket", "cash", "bank", "free"]),
    accountNumber: z.string(),
    accountType: z.string().optional(),
    instructions: z.string().optional(),
    isActive: z.boolean().default(true),
  })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db.select({ id: paymentConfigs.id }).from(paymentConfigs)
      .where(and(eq(paymentConfigs.orgId, ctx.orgId), eq(paymentConfigs.method, input.method as any))).limit(1);
    if (existing.length > 0) {
      await ctx.db.update(paymentConfigs).set({
        accountNumber: input.accountNumber,
        accountType: input.accountType,
        instructions: input.instructions,
        isActive: input.isActive,
      }).where(eq(paymentConfigs.id, existing[0].id));
    } else {
      await ctx.db.insert(paymentConfigs).values({
        orgId: ctx.orgId,
        method: input.method as any,
        accountNumber: input.accountNumber,
        accountType: input.accountType,
        instructions: input.instructions,
        isActive: input.isActive,
      });
    }
    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "update", "payment_config", ctx.orgId, { method: input.method });
    return { ok: true };
  }),

  deletePaymentConfig: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(paymentConfigs)
      .where(and(eq(paymentConfigs.id, input.id), eq(paymentConfigs.orgId, ctx.orgId)));
    return { ok: true };
  }),

  // ── Hotspot config ────────────────────────────────────────────────────────

  getHotspotConfig: authedProcedure.query(async ({ ctx }) => {
    const results = await Promise.all(
      HOTSPOT_CONFIG_KEYS.map((k) => getSetting(ctx.db, ctx.orgId, k)),
    );
    return Object.fromEntries(HOTSPOT_CONFIG_KEYS.map((k, i) => [k, results[i] ?? ""])) as Record<string, string>;
  }),

  setHotspotConfig: adminProcedure
    .input(z.record(z.string(), z.string()))
    .mutation(async ({ ctx, input }) => {
      await Promise.all(
        Object.entries(input).map(([key, value]) => setSetting(ctx.db, ctx.orgId, key, value)),
      );
      invalidateSettingCache(ctx.orgId);

      // Publish to Redis so other services know config changed
      try {
        await getRedis().publish("hotspot:config:changed", JSON.stringify({ orgId: ctx.orgId, ts: Date.now() }));
      } catch { /* non-fatal */ }

      // Async: apply MikroTik walled garden for configured domains
      const domains = [
        input.hotspot_primary_domain,
        input.hotspot_backup_domain,
        input.hotspot_api_domain,
      ].filter(Boolean) as string[];
      if (domains.length) {
        applyWalledGarden(ctx.db, ctx.orgId, domains).catch((err) =>
          logger.warn({ err }, "Walled garden apply failed (non-fatal)"),
        );
      }

      // Async: apply session timeout to MikroTik hotspot profiles
      if (input.hotspot_session_timeout) {
        applyHotspotProfile(ctx.db, ctx.orgId, input.hotspot_session_timeout).catch((err) =>
          logger.warn({ err }, "Hotspot profile apply failed (non-fatal)"),
        );
      }

      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "update", "hotspot_config", ctx.orgId, { keys: Object.keys(input) });
      return { ok: true };
    }),

  // Trigger full Caddy reload from DB virtual hosts
  applyCaddyConfig: adminProcedure.mutation(async ({ ctx }) => {
    const config = await buildCaddyConfig(ctx.db, ctx.orgId);
    await applyCaddyConfig(config);
    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "apply", "caddy_config", ctx.orgId, {});
    return { ok: true, applied: new Date().toISOString() };
  }),

  publicHotspotConfig: publicProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [primaryDomain, portalDomain] = await Promise.all([
        getSetting(ctx.db, input.orgId, SETTING_KEYS.HOTSPOT_PRIMARY_DOMAIN),
        getSetting(ctx.db, input.orgId, SETTING_KEYS.PORTAL_DOMAIN),
      ]);
      return { portalUrl: primaryDomain || portalDomain || "" };
    }),

  // ── Full debug panel (5 panels) ───────────────────────────────────────────

  getHotspotDebug: adminProcedure.query(async ({ ctx }) => {
    const redis = getRedis();
    const orgId = ctx.orgId;

    // Panel 1: Active hotspot users from MikroTik
    let activeUsers: {
      phone: string; mac: string; ip: string; uptime: string;
      bytesIn: string; bytesOut: string; router: string;
    }[] = [];
    let mikrotikError: string | null = null;
    let walledGarden: { dstHost: string; comment: string }[] = [];

    try {
      const [defaultRouter] = await ctx.db.select()
        .from(routers)
        .where(and(eq(routers.orgId, orgId), eq(routers.isActive, true), eq(routers.isDefault, true)))
        .limit(1);
      if (defaultRouter) {
        const client = await connectRouter(defaultRouter);
        try {
          const [active, wg] = await Promise.all([
            client.print("/ip/hotspot/active").catch(() => []),
            client.print("/ip/hotspot/walled-garden").catch(() => []),
          ]);
          activeUsers = (active as any[]).slice(0, 100).map((u: any) => ({
            phone: u.user ?? "",
            mac: u["mac-address"] ?? "",
            ip: u.address ?? "",
            uptime: u.uptime ?? "",
            bytesIn: u["bytes-in"] ?? "0",
            bytesOut: u["bytes-out"] ?? "0",
            router: defaultRouter.name,
          }));
          walledGarden = (wg as any[]).slice(0, 50).map((w: any) => ({
            dstHost: w["dst-host"] ?? "",
            comment: w.comment ?? "",
          }));
        } finally {
          await client.close();
        }
      }
    } catch (err: any) {
      mikrotikError = err?.message ?? "MikroTik connection failed";
    }

    // Panel 2: Pending approvals with full customer + package data
    const pendingApprovals = await ctx.db.select({
      id: orders.id,
      createdAt: orders.createdAt,
      paymentMethod: orders.paymentMethod,
      trxId: orders.trxId,
      amountBdt: orders.amountBdt,
      customerPhone: customers.phone,
      customerName: customers.fullName,
      packageName: packages.name,
    })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(packages, eq(orders.packageId, packages.id))
      .where(and(eq(orders.orgId, orgId), eq(orders.status, "pending")))
      .orderBy(desc(orders.createdAt))
      .limit(50);

    // Panel 3: Redis session tokens
    let sessionTokens: {
      key: string; phone: string; orgId: string; expiresInSec: number; createdAt: string;
    }[] = [];
    let sessionCount = 0;
    try {
      const keys = await redis.keys(`hotspot_sess:v1:*`);
      sessionCount = keys.length;
      const sample = keys.slice(0, 50);
      if (sample.length) {
        const pipeline = redis.pipeline();
        for (const k of sample) { pipeline.get(k); pipeline.ttl(k); }
        const results = await pipeline.exec();
        if (results) {
          for (let i = 0; i < sample.length; i++) {
            const raw = results[i * 2]?.[1] as string | null;
            const ttl = results[i * 2 + 1]?.[1] as number ?? -1;
            if (raw) {
              try {
                const sess = JSON.parse(raw);
                const shortKey = sample[i].replace("hotspot_sess:v1:", "");
                sessionTokens.push({
                  key: shortKey.slice(0, 8) + "…",
                  phone: sess.phone ?? sess.username ?? "–",
                  orgId: sess.orgId ?? "",
                  expiresInSec: ttl,
                  createdAt: sess.createdAt ?? "",
                });
              } catch { /* malformed */ }
            }
          }
        }
      }
    } catch { /* redis unavailable */ }

    // Panel 4: Redirect logs
    let redirectLogs: {
      mac: string; ip: string; redirectUrl: string; domain: string; success: boolean; ts: string;
    }[] = [];
    try {
      const raw = await redis.zrevrange(REDIRECT_LOG_KEY(orgId), 0, 99, "WITHSCORES");
      for (let i = 0; i < raw.length - 1; i += 2) {
        try { redirectLogs.push(JSON.parse(raw[i])); } catch { /* skip */ }
      }
    } catch { /* redis unavailable */ }

    // Panel 5: Auto-login logs
    let autoLoginLogs: {
      username: string; phone: string; loginUrl: string; success: boolean; reason: string; ts: string;
    }[] = [];
    try {
      const raw = await redis.zrevrange(AUTOLOGIN_LOG_KEY(orgId), 0, 99, "WITHSCORES");
      for (let i = 0; i < raw.length - 1; i += 2) {
        try { autoLoginLogs.push(JSON.parse(raw[i])); } catch { /* skip */ }
      }
    } catch { /* redis unavailable */ }

    return {
      activeUsers,
      pendingApprovals,
      sessionTokens,
      sessionCount,
      redirectLogs,
      autoLoginLogs,
      walledGarden,
      mikrotikError,
      timestamp: new Date().toISOString(),
    };
  }),

  // ── Health check ──────────────────────────────────────────────────────────

  getHealthStatus: adminProcedure.query(async ({ ctx }) => {
    const cached = await getCachedHealth(ctx.orgId);
    if (cached) return cached;
    // Run fresh check if no cached result
    return runHealthCheck(ctx.db, ctx.orgId).catch(() => null);
  }),

  runHealthCheck: adminProcedure.mutation(async ({ ctx }) => {
    return runHealthCheck(ctx.db, ctx.orgId);
  }),

  // ── Log ingestion endpoints (called internally by portal / hotspot pages) ─

  logRedirect: adminProcedure
    .input(z.object({
      mac: z.string().default(""),
      ip: z.string().default(""),
      redirectUrl: z.string().default(""),
      domain: z.string().default(""),
      success: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const redis = getRedis();
        const entry = JSON.stringify({ ...input, ts: new Date().toISOString() });
        await redis.zadd(REDIRECT_LOG_KEY(ctx.orgId), Date.now(), entry);
        await redis.zremrangebyrank(REDIRECT_LOG_KEY(ctx.orgId), 0, -(MAX_LOG_ENTRIES + 1));
      } catch { /* non-fatal */ }
      return { ok: true };
    }),

  logAutoLogin: adminProcedure
    .input(z.object({
      username: z.string().default(""),
      phone: z.string().default(""),
      loginUrl: z.string().default(""),
      success: z.boolean(),
      reason: z.string().default(""),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const redis = getRedis();
        const entry = JSON.stringify({ ...input, ts: new Date().toISOString() });
        await redis.zadd(AUTOLOGIN_LOG_KEY(ctx.orgId), Date.now(), entry);
        await redis.zremrangebyrank(AUTOLOGIN_LOG_KEY(ctx.orgId), 0, -(MAX_LOG_ENTRIES + 1));
      } catch { /* non-fatal */ }
      return { ok: true };
    }),

  // ── SMS config ────────────────────────────────────────────────────────────

  getSmsConfig: authedProcedure.query(async ({ ctx }) => {
    const [provider, apiKey, apiUser, senderId, whatsappNumber] = await Promise.all([
      getSetting(ctx.db, ctx.orgId, "sms_provider"),
      getSetting(ctx.db, ctx.orgId, "sms_api_key"),
      getSetting(ctx.db, ctx.orgId, "sms_api_user"),
      getSetting(ctx.db, ctx.orgId, "sms_sender_id"),
      getSetting(ctx.db, ctx.orgId, "whatsapp_support"),
    ]);
    return {
      provider: (provider ?? "") as SmsProvider | "",
      apiKey: apiKey ?? "",
      apiUser: apiUser ?? "",
      senderId: senderId ?? "",
      whatsappNumber: whatsappNumber ?? "",
    };
  }),

  getSmsLogs: authedProcedure
    .input(z.object({ limit: z.number().default(50), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const conditions: ReturnType<typeof eq>[] = [eq(smsLogs.orgId, ctx.orgId)];
      if (input.status) conditions.push(eq(smsLogs.status, input.status));
      return ctx.db.select().from(smsLogs).where(and(...conditions))
        .orderBy(desc(smsLogs.createdAt)).limit(input.limit);
    }),

  setSmsConfig: adminProcedure.input(z.object({
    provider: z.enum(SMS_PROVIDERS),
    apiKey: z.string(),
    apiUser: z.string().optional(),
    senderId: z.string().optional(),
    whatsappNumber: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    await setSetting(ctx.db, ctx.orgId, "sms_provider", input.provider);
    await setSetting(ctx.db, ctx.orgId, "sms_api_key", input.apiKey, { encrypted: true, description: "SMS API key (encrypted)" });
    await setSetting(ctx.db, ctx.orgId, "sms_api_user", input.apiUser ?? "");
    await setSetting(ctx.db, ctx.orgId, "sms_sender_id", input.senderId ?? "SKYNITY");
    if (input.whatsappNumber !== undefined) {
      await setSetting(ctx.db, ctx.orgId, "whatsapp_support", input.whatsappNumber);
    }
    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "update", "sms_config", ctx.orgId, { provider: input.provider });
    invalidateSettingCache(ctx.orgId);
    return { ok: true };
  }),

  // ── Revenue analytics snapshot ─────────────────────────────────────────────

  revenueAnalytics: adminProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 86_400_000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const last30 = new Date(now.getTime() - 30 * 86_400_000);

    const [todayRev, weekRev, monthRev, pendingCnt, churnCnt, totalTrials, approvedTrials] = await Promise.all([
      ctx.db.select({ s: sql<string>`coalesce(sum(amount_bdt),0)` }).from(orders)
        .where(and(eq(orders.orgId, ctx.orgId), eq(orders.status, "approved"), gte(orders.createdAt, todayStart))),
      ctx.db.select({ s: sql<string>`coalesce(sum(amount_bdt),0)` }).from(orders)
        .where(and(eq(orders.orgId, ctx.orgId), eq(orders.status, "approved"), gte(orders.createdAt, weekStart))),
      ctx.db.select({ s: sql<string>`coalesce(sum(amount_bdt),0)` }).from(orders)
        .where(and(eq(orders.orgId, ctx.orgId), eq(orders.status, "approved"), gte(orders.createdAt, monthStart))),
      ctx.db.select({ c: sql<number>`count(*)` }).from(orders)
        .where(and(eq(orders.orgId, ctx.orgId), eq(orders.status, "pending"))),
      ctx.db.select({ c: sql<number>`count(*)` }).from(subscriptions)
        .where(and(eq(subscriptions.orgId, ctx.orgId), eq(subscriptions.status, "expired"), gte(subscriptions.updatedAt, last30))),
      ctx.db.select({ c: sql<number>`count(*)` }).from(orders)
        .where(and(eq(orders.orgId, ctx.orgId), eq(orders.paymentMethod, "free"))),
      ctx.db.select({ c: sql<number>`count(*)` }).from(orders)
        .where(and(eq(orders.orgId, ctx.orgId), eq(orders.paymentMethod, "free"), eq(orders.status, "approved"))),
    ]);

    const total = Number(totalTrials[0]?.c ?? 0);
    const approved = Number(approvedTrials[0]?.c ?? 0);
    return {
      todayBdt: Number(todayRev[0]?.s ?? 0),
      weekBdt: Number(weekRev[0]?.s ?? 0),
      monthBdt: Number(monthRev[0]?.s ?? 0),
      pendingCount: Number(pendingCnt[0]?.c ?? 0),
      churnLast30: Number(churnCnt[0]?.c ?? 0),
      trialTotal: total,
      trialApproved: approved,
      trialConversionPct: total > 0 ? Math.round((approved / total) * 100) : 0,
    };
  }),

  // ── Incident log ──────────────────────────────────────────────────────────

  listIncidents: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(100) }))
    .query(async ({ ctx, input }) => {
      const { getIncidents } = await import("../services/incident/log.js");
      return getIncidents(ctx.orgId, input.limit);
    }),

  clearIncidents: adminProcedure.mutation(async ({ ctx }) => {
    const { clearIncidents } = await import("../services/incident/log.js");
    await clearIncidents(ctx.orgId);
    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "delete", "incident_log", ctx.orgId, {});
    return { ok: true };
  }),

  // ── SMS / notification templates ─────────────────────────────────────────
  getSmsTemplates: adminProcedure.query(async ({ ctx }) => {
    const raw = await getSetting(ctx.db, ctx.orgId, "sms_templates");
    const defaults = {
      welcome: "আসসালামু আলাইকুম {name}! ISP Nexus-এ স্বাগতম। আপনার ইন্টারনেট সংযোগ সক্রিয় হয়েছে। সাপোর্ট: {support_phone}",
      paymentReminder: "প্রিয় {name}, আপনার {amount} টাকার পেমেন্ট বকেয়া আছে। দ্রুত পরিশোধ করুন অন্যথায় সংযোগ বিচ্ছিন্ন হবে। বিকাশ/নগদ: {bkash_number}",
      expiryReminder: "প্রিয় {name}, আপনার ইন্টারনেট প্যাকেজ {days} দিনের মধ্যে মেয়াদ শেষ হবে। নবায়ন করতে কল করুন: {support_phone}",
      expiryAlert: "প্রিয় {name}, আপনার ইন্টারনেট সংযোগের মেয়াদ আজ শেষ হয়েছে। নবায়নের জন্য: {support_phone}",
      paymentSuccess: "প্রিয় {name}, আপনার {amount} টাকার পেমেন্ট সফলভাবে গ্রহণ হয়েছে। প্যাকেজ: {package_name}। ধন্যবাদ!",
      supportReplyOpen: "প্রিয় {name}, আপনার সাপোর্ট টিকেট #{ticket_id} পেয়েছি। শীঘ্রই সমাধান করব। ধন্যবাদ।",
      supportReplyClosed: "প্রিয় {name}, আপনার সমস্যা সমাধান হয়েছে (টিকেট #{ticket_id})। সন্তুষ্ট না হলে পুনরায় যোগাযোগ করুন।",
      trialApproved: "আপনার ফ্রি ট্রায়াল অনুমোদন হয়েছে! Username: {username}, Password: {password}। WiFi নাম: {ssid}",
    };
    if (!raw) return defaults;
    try { return { ...defaults, ...JSON.parse(raw) }; } catch { return defaults; }
  }),

  setSmsTemplates: adminProcedure
    .input(z.object({
      welcome: z.string().optional(),
      paymentReminder: z.string().optional(),
      expiryReminder: z.string().optional(),
      expiryAlert: z.string().optional(),
      paymentSuccess: z.string().optional(),
      supportReplyOpen: z.string().optional(),
      supportReplyClosed: z.string().optional(),
      trialApproved: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getSetting(ctx.db, ctx.orgId, "sms_templates");
      const current = existing ? JSON.parse(existing) : {};
      const merged = { ...current, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) };
      await setSetting(ctx.db, ctx.orgId, "sms_templates", JSON.stringify(merged));
      invalidateSettingCache(ctx.orgId);
      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "update", "sms_templates", ctx.orgId, {});
      return { ok: true };
    }),

  // ── Sales / commercial config ─────────────────────────────────────────────
  getSalesConfig: adminProcedure.query(async ({ ctx }) => {
    const raw = await getSetting(ctx.db, ctx.orgId, "sales_config");
    const defaults = {
      commissionModel: {
        defaultPct: 10,
        tiers: [
          { minCustomers: 0,  pct: 10, label: "Standard" },
          { minCustomers: 20, pct: 12, label: "Silver" },
          { minCustomers: 50, pct: 15, label: "Gold" },
          { minCustomers: 100, pct: 18, label: "Platinum" },
        ],
      },
      voucherPricing: [
        { durationHours: 1,  priceBdt: 10,  label: "1 ঘণ্টা" },
        { durationHours: 3,  priceBdt: 20,  label: "3 ঘণ্টা" },
        { durationHours: 12, priceBdt: 50,  label: "হাফ-ডে" },
        { durationHours: 24, priceBdt: 80,  label: "১ দিন" },
        { durationHours: 168, priceBdt: 400, label: "১ সপ্তাহ" },
        { durationHours: 720, priceBdt: 1200, label: "১ মাস" },
      ],
      resellerOnboarding: [
        "জাতীয় পরিচয়পত্র (NID) কপি সংগ্রহ",
        "ব্যবসায়িক ঠিকানা যাচাই",
        "বিকাশ/নগদ অ্যাকাউন্ট নম্বর নিবন্ধন",
        "কমিশন চুক্তিপত্র স্বাক্ষর",
        "অ্যাডমিন প্যানেলে রিসেলার অ্যাকাউন্ট তৈরি",
        "প্রশিক্ষণ সেশন সম্পন্ন",
        "প্রথম ৫ জন গ্রাহক অনবোর্ড করা",
        "পেমেন্ট কালেকশন প্রক্রিয়া বোঝানো",
      ],
      packagePricingGuide: {
        hotspot: { min: 30, max: 500, recommended: [30, 50, 100, 200, 500] },
        pppoe: { min: 400, max: 5000, recommended: [400, 600, 800, 1200, 2000] },
        margin: "কমপক্ষে ৩০% মার্জিন নিশ্চিত করুন",
      },
    };
    if (!raw) return defaults;
    try { return { ...defaults, ...JSON.parse(raw) }; } catch { return defaults; }
  }),

  setSalesConfig: adminProcedure
    .input(z.object({ config: z.record(z.unknown()) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getSetting(ctx.db, ctx.orgId, "sales_config");
      const current = existing ? JSON.parse(existing) : {};
      await setSetting(ctx.db, ctx.orgId, "sales_config", JSON.stringify({ ...current, ...input.config }));
      invalidateSettingCache(ctx.orgId);
      return { ok: true };
    }),
});
