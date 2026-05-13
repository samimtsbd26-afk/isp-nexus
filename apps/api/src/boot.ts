// Load .env from monorepo root (dev only — production uses real env vars)
import { readFileSync } from "fs";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve, dirname, normalize } from "path";
import { fileURLToPath } from "url";
try {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const envFile = readFileSync(resolve(root, ".env"), "utf8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
} catch { /* no .env file — use real env vars */ }

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { trpcServer } from "@hono/trpc-server";
import { Server as SocketIOServer } from "socket.io";
import type { IncomingMessage, ServerResponse } from "http";
import { and, asc, desc, eq } from "drizzle-orm";
import { createDb, customers, orders, packages, routers, subscriptions, telegramConfigs, users } from "@isp-nexus/db";
import { appRouter } from "./router.js";
import { createContext } from "./context.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { encryptText, decryptText } from "./lib/crypto.js";
import { getRedis } from "./lib/redis.js";
import { verifyAccessToken } from "./auth/session.js";
import { initBot, stopBot, sendTrialRequestNotification, sendNewUserCreatedNotification } from "./services/telegram/bot.js";
import { formatPackageDurationShort, buildPlanDisplay } from "@isp-nexus/shared";
import { startMonitoringWorker, startAlertsWorker, startExpiryWorker, startSyncWorker, startSecurityWorker, startWarningWorker, startRetentionWorker, scheduleJobs, setMonitoringEmitter } from "./jobs/queue.js";
import { allowedCorsOrigins, refreshCorsOrigins } from "./lib/cors-state.js";

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception — exiting");
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled rejection");
});

const app = new Hono();
const DEFAULT_PORTAL_ORG_ID = "212d7393-7375-4321-93f5-4789deb8b317";
const HOTSPOT_ASSET_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../hotspot");
const HOTSPOT_ASSET_EXTENSIONS = new Set([".html", ".css", ".js", ".png", ".webp", ".jpg", ".jpeg", ".svg"]);
const portalWriteHits = new Map<string, { count: number; resetAt: number }>();

// Seed CORS origins from env at startup
refreshCorsOrigins(env.CORS_ORIGINS.split(","));

const HOTSPOT_SESSION_TTL_SEC = 12 * 3600;
function hotspotSessionRedisKey(token: string) {
  return `hotspot_sess:v1:${token}`;
}

app.use("*", secureHeaders());
app.use("*", cors({
  origin: (origin) => {
    if (!origin) return "";
    return allowedCorsOrigins.has(origin) ? origin : "";
  },
  credentials: true,
}));

app.use("/api/trpc/*", trpcServer({
  router: appRouter,
  endpoint: "/api/trpc",
  createContext: (_opts, c) => createContext(c) as any,
}));

function portalOrg(c: any) {
  return c.req.query("orgId") || c.req.query("org") || DEFAULT_PORTAL_ORG_ID;
}

function packageCode(value: string | null | undefined) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function portalCaller(c: any) {
  return appRouter.createCaller(await createContext(c));
}

async function findPortalPackage(c: any, input: { packageId?: string; packageCode?: string; trial?: boolean }) {
  const ctx = await createContext(c);
  const orgId = portalOrg(c);
  const rows = await ctx.db.select().from(packages)
    .where(and(eq(packages.orgId, orgId), eq(packages.isActive, true)))
    .orderBy(asc(packages.sortOrder));
  if (input.packageId) {
    const found = rows.find((pkg) => pkg.id === input.packageId);
    if (found) return found;
  }
  if (input.trial) {
    const found = rows.find((pkg) => pkg.isTrial);
    if (found) return found;
    return null;
  }
  const code = packageCode(input.packageCode);
  return rows.find((pkg) => packageCode(pkg.name) === code || packageCode((pkg as any).code) === code) ?? rows[0] ?? null;
}

function portalError(c: any, error: any) {
  const status = error?.code === "NOT_FOUND" ? 404 : error?.code === "CONFLICT" ? 409 : error?.code === "UNAUTHORIZED" ? 401 : 400;
  return c.json({ error: error?.message || "Portal request failed" }, status);
}

function getClientIp(c: any): string {
  return c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function pruneExpiredPortalWriteHits(now: number) {
  if (portalWriteHits.size < 500) return;
  for (const [k, v] of portalWriteHits) {
    if (v.resetAt <= now) portalWriteHits.delete(k);
  }
  if (portalWriteHits.size > 20_000) {
    logger.warn({ count: portalWriteHits.size }, "Portal rate-limit map overflow — clearing");
    portalWriteHits.clear();
  }
}

function rateLimitPortalWrite(c: any, maxPerMinute = 8) {
  const ip = getClientIp(c);
  const key = `${ip}:${c.req.path}`;
  const now = Date.now();
  pruneExpiredPortalWriteHits(now);
  const current = portalWriteHits.get(key);
  if (!current || current.resetAt <= now) {
    portalWriteHits.set(key, { count: 1, resetAt: now + 60_000 });
    return null;
  }
  current.count += 1;
  if (current.count > maxPerMinute) return c.json({ error: "Too many requests. Please wait a minute." }, 429);
  return null;
}

app.post("/api/portal/hotspot-session", async (c) => {
  const limited = rateLimitPortalWrite(c, 12);
  if (limited) return limited;
  try {
    const body = await c.req.json();
    const phone = String(body.phone || "").trim();
    const password = String(body.password || "");
    if (!/^01\d{9}$/.test(phone)) return c.json({ error: "Invalid phone" }, 400);
    if (!password || password.length < 6) return c.json({ error: "Invalid password" }, 400);
    const orgId = body.orgId || portalOrg(c);
    const caller = await portalCaller(c);
    await caller.portal.login({ orgId, phone, password });
    const token = randomBytes(32).toString("hex");
    const payload = encryptText(JSON.stringify({ phone, password }));
    const redis = getRedis();
    await redis.set(hotspotSessionRedisKey(token), payload, "EX", HOTSPOT_SESSION_TTL_SEC);
    await redis.set(`hotspot_phone_sess:${orgId}:${phone}`, token, "EX", HOTSPOT_SESSION_TTL_SEC);
    return c.json({ data: { sessionToken: token, expiresInSec: HOTSPOT_SESSION_TTL_SEC } });
  } catch (error) {
    return portalError(c, error);
  }
});

app.post("/api/portal/hotspot-session/resolve", async (c) => {
  const limited = rateLimitPortalWrite(c, 40);
  if (limited) return limited;
  try {
    const body = await c.req.json();
    const token = String(body.sessionToken || "");
    if (!/^[0-9a-f]{64}$/.test(token)) return c.json({ error: "Invalid session" }, 400);
    const redis = getRedis();
    const key = hotspotSessionRedisKey(token);
    const enc = await redis.get(key);
    if (!enc) return c.json({ error: "Session expired or invalid" }, 401);
    let phone: string;
    let password: string;
    try {
      const j = JSON.parse(decryptText(enc)) as { phone?: string; password?: string };
      phone = String(j.phone || "");
      password = String(j.password || "");
    } catch {
      return c.json({ error: "Session corrupted" }, 401);
    }
    if (!phone || !password) return c.json({ error: "Session invalid" }, 401);
    await redis.expire(key, HOTSPOT_SESSION_TTL_SEC);
    return c.json({ data: { phone, password } });
  } catch (error) {
    return portalError(c, error);
  }
});

app.post("/api/portal/hotspot-session/revoke", async (c) => {
  const limited = rateLimitPortalWrite(c, 24);
  if (limited) return limited;
  try {
    const body = await c.req.json().catch(() => ({}));
    const token = String((body as { sessionToken?: string }).sessionToken || "");
    if (!token) return c.json({ error: "sessionToken required" }, 400);
    await getRedis().del(hotspotSessionRedisKey(token));
    return c.json({ data: { ok: true } });
  } catch (error) {
    return portalError(c, error);
  }
});

app.get("/api/portal/packages", async (c) => {
  try {
    const caller = await portalCaller(c);
    const data = await caller.portal.publicPackages({ orgId: portalOrg(c) });
    return c.json({ data });
  } catch (error) {
    return portalError(c, error);
  }
});

app.get("/api/portal/trial/status", async (c) => {
  try {
    const pkg = await findPortalPackage(c, { trial: true });
    return c.json({ data: { available: Boolean(pkg), packageId: pkg?.id ?? null } });
  } catch (error) {
    return portalError(c, error);
  }
});

app.post("/api/portal/register", async (c) => {
  const limited = rateLimitPortalWrite(c, 5);
  if (limited) return limited;
  try {
    const body = await c.req.json();

    // IP-based trial rate limit removed — now handled by phone+MAC duplicate checks in portal.trialRegister
    
    // Validation
    if (!body.fullName || String(body.fullName).trim().length < 2) {
      return c.json({ error: "Name must be at least 2 characters" }, 400);
    }
    if (!body.phone || String(body.phone).trim().length < 10) {
      return c.json({ error: "Phone number is invalid" }, 400);
    }
    if (!body.password || String(body.password).length < 6) {
      return c.json({ error: "Password must be at least 6 characters" }, 400);
    }
    
    const caller = await portalCaller(c);
    if (body.trial) {
      const orgId = body.orgId || portalOrg(c);
      const pkg = await findPortalPackage(c, { packageId: body.packageId, trial: true });
      if (!pkg) return c.json({ error: "ট্রায়াল প্যাকেজ পাওয়া যায়নি" }, 404);
      const mac = String(body.mac || body.debug?.mac || "").toLowerCase().replace(/[^0-9a-f:.-]/g, "").slice(0, 17);
      const ip = String(body.ip || body.debug?.ip || c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "").trim().slice(0, 45);
      const ua = String(body.debug?.userAgent || c.req.header("user-agent") || "").slice(0, 300);
      const data = await caller.portal.trialRegister({
        orgId,
        packageId: pkg.id,
        fullName: String(body.fullName).trim(),
        phone: String(body.phone).trim(),
        password: String(body.password),
        macAddress: mac || undefined,
        ipAddress: ip || undefined,
        userAgent: ua || undefined,
      });
      // Telegram notification with inline Approve/Reject buttons
      const ctx2 = await createContext(c);
      const [tgConfig] = await ctx2.db.select({ chatId: telegramConfigs.chatId })
        .from(telegramConfigs).where(eq(telegramConfigs.orgId, orgId)).limit(1);
      if (tgConfig) {
        const msgId = await sendTrialRequestNotification(
          tgConfig.chatId, data.orderId,
          { fullName: String(body.fullName).trim(), phone: String(body.phone).trim() },
          pkg, mac, ip, ua,
        );
        if (msgId) {
          await ctx2.db.update(orders).set({ telegramMessageId: msgId }).where(eq(orders.id, data.orderId));
        }
      }
      emitOrgEvent(orgId, "order:new", {
        orgId, orderId: data.orderId,
        customerName: String(body.fullName).trim(),
        customerPhone: String(body.phone).trim(),
        amountBdt: 0, paymentMethod: "free", trxId: null,
      });
      if (data.customerId) {
        emitCustomerEvent(data.customerId, "order:created", { orderId: data.orderId, amountBdt: 0, isTrial: true });
      }
      emitOrgEvent(orgId, "customer:new", {
        orgId,
        customerId: data.customerId,
        fullName: String(body.fullName).trim(),
        phone: String(body.phone).trim(),
        packageName: pkg.name,
        pendingApproval: true,
      });
      return c.json({ data: { pending: true, orderId: data.orderId, message: "আপনার রিকোয়েস্ট পাঠানো হয়েছে। অ্যাডমিন অনুমোদন দিলে আপনি WiFi ব্যবহার করতে পারবেন।" } });
    }
    const orgId = body.orgId || portalOrg(c);
    const data = await caller.portal.register({
      orgId,
      username: String(body.phone).trim(),
      fullName: String(body.fullName).trim(),
      phone: String(body.phone).trim(),
      email: body.email || undefined,
      password: String(body.password),
    });
    const ctxReg = await createContext(c);
    const [tgReg] = await ctxReg.db.select({ chatId: telegramConfigs.chatId })
      .from(telegramConfigs).where(eq(telegramConfigs.orgId, orgId)).limit(1);
    if (tgReg?.chatId) {
      await sendNewUserCreatedNotification(tgReg.chatId, {
        name: String(body.fullName).trim(),
        phone: String(body.phone).trim(),
        packageName: "—",
      });
    }
    emitOrgEvent(orgId, "customer:new", {
      orgId,
      customerId: data.customer.id,
      fullName: String(body.fullName).trim(),
      phone: String(body.phone).trim(),
      packageName: null,
      pendingApproval: false,
    });
    return c.json({ data: { ...data, username: body.phone, password: body.password } });
  } catch (error) {
    logger.error({ err: error }, "Portal register error");
    return portalError(c, error);
  }
});

app.post("/api/portal/payment", async (c) => {
  const limited = rateLimitPortalWrite(c);
  if (limited) return limited;
  try {
    const body = await c.req.json();
    if (!body.fullName || String(body.fullName).trim().length < 2) {
      return c.json({ error: "পুরো নাম প্রদান করুন (কমপক্ষে ২ অক্ষর)" }, 400);
    }
    if (!body.phone || String(body.phone).trim().length < 10) {
      return c.json({ error: "সঠিক ফোন নম্বর প্রদান করুন" }, 400);
    }
    if (!body.password || String(body.password).length < 6) {
      return c.json({ error: "পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে" }, 400);
    }
    if (!body.paymentMethod) {
      return c.json({ error: "পেমেন্ট মেথড নির্বাচন করুন" }, 400);
    }
    const pkg = await findPortalPackage(c, { packageId: body.packageId, packageCode: body.packageCode });
    if (!pkg) return c.json({ error: "প্যাকেজ পাওয়া যায়নি" }, 404);
    const caller = await portalCaller(c);
    // Permission check for existing customers
    const ctx2 = await createContext(c);
    const [existingCustomer] = await ctx2.db.select({ id: customers.id, permissions: customers.permissions }).from(customers)
      .where(and(eq(customers.phone, String(body.phone).trim()), eq(customers.orgId, body.orgId || portalOrg(c)))).limit(1);
    if (existingCustomer) {
      const perms = Array.isArray(existingCustomer.permissions) ? existingCustomer.permissions : [];
      if (!perms.includes("billing")) {
        return c.json({ error: "Customer does not have billing permission" }, 403);
      }
    }

    const data = await caller.portal.guestOrder({
      orgId: body.orgId || portalOrg(c),
      packageId: pkg.id,
      fullName: String(body.fullName).trim(),
      phone: String(body.phone).trim(),
      password: String(body.password),
      paymentMethod: body.paymentMethod,
      trxId: body.trxId || undefined,
      paymentFrom: body.paymentFrom || undefined,
      isTrial: false,
    });
    if (data.customerId) {
      emitCustomerEvent(data.customerId, "order:created", { orderId: data.orderId, amountBdt: pkg.priceBdt });
    }
    return c.json({ data: { ...data, username: body.phone, password: body.password } });
  } catch (error) {
    return portalError(c, error);
  }
});

// Approval status check — hotspot state engine (login.html polls this; no Telegram alert)
app.get("/api/portal/approval-status", async (c) => {
  try {
    const phone = c.req.query("phone");
    const orgId = c.req.query("orgId") || portalOrg(c);
    if (!phone) return c.json({ error: "phone required" }, 400);
    const ctx = await createContext(c);
    const [customer] = await ctx.db.select({
      id: customers.id,
      isActive: customers.isActive,
      fullName: customers.fullName,
      phone: customers.phone,
    })
      .from(customers).where(and(eq(customers.phone, phone), eq(customers.orgId, orgId))).limit(1);
    if (!customer) {
      return c.json({ data: { approved: false, status: "no_customer", customerName: null } });
    }
    if (!customer.isActive) {
      return c.json({
        data: {
          approved: false,
          status: "blocked",
          customerName: customer.fullName ?? null,
          phone: customer.phone,
        },
      });
    }

    const now = new Date();
    const rows = await ctx.db.select({
      id: subscriptions.id,
      status: subscriptions.status,
      expiresAt: subscriptions.expiresAt,
      packageName: packages.name,
      downloadMbps: packages.downloadMbps,
      uploadMbps: packages.uploadMbps,
      durationValue: packages.durationValue,
      durationUnit: packages.durationUnit,
      validityDays: packages.validityDays,
    })
      .from(subscriptions)
      .leftJoin(packages, eq(subscriptions.packageId, packages.id))
      .where(and(eq(subscriptions.customerId, customer.id), eq(subscriptions.orgId, orgId)))
      .orderBy(desc(subscriptions.expiresAt));

    const active = rows.find((r) => r.status === "active" && r.expiresAt && new Date(r.expiresAt) > now);
    if (active) {
      const dur = {
        durationValue: active.durationValue,
        durationUnit: active.durationUnit,
        validityDays: active.validityDays,
      };
      const planDisplay = buildPlanDisplay(active.packageName, dur);
      return c.json({
        data: {
          approved: true,
          status: "active",
          expiresAt: active.expiresAt,
          packageName: active.packageName,
          planDisplay,
          durationShort: formatPackageDurationShort(dur),
          downloadMbps: active.downloadMbps,
          uploadMbps: active.uploadMbps,
          customerName: customer.fullName ?? null,
          phone: customer.phone,
        },
      });
    }

    const [pendingOrder] = await ctx.db.select({
      id: orders.id,
      paymentMethod: orders.paymentMethod,
      amountBdt: orders.amountBdt,
      trxId: orders.trxId,
      paymentFrom: orders.paymentFrom,
      createdAt: orders.createdAt,
      packageName: packages.name,
    })
      .from(orders)
      .leftJoin(packages, eq(orders.packageId, packages.id))
      .where(and(eq(orders.customerId, customer.id), eq(orders.orgId, orgId), eq(orders.status, "pending")))
      .orderBy(desc(orders.createdAt))
      .limit(1);

    if (pendingOrder) {
      const isTrialQueue = pendingOrder.paymentMethod === "free";
      if (isTrialQueue) {
        return c.json({
          data: {
            approved: false,
            status: "pending",
            orderId: pendingOrder.id,
            customerName: customer.fullName ?? null,
            phone: customer.phone,
          },
        });
      }
      return c.json({
        data: {
          approved: false,
          status: "payment_pending",
          orderId: pendingOrder.id,
          trxId: pendingOrder.trxId ?? null,
          amountBdt: pendingOrder.amountBdt,
          paymentMethod: pendingOrder.paymentMethod,
          paymentFrom: pendingOrder.paymentFrom ?? null,
          packageName: pendingOrder.packageName ?? null,
          createdAt: pendingOrder.createdAt,
          customerName: customer.fullName ?? null,
          phone: customer.phone,
        },
      });
    }

    const latest = rows[0];
    if (latest && (latest.status === "expired" || (latest.expiresAt && new Date(latest.expiresAt) <= now))) {
      const dur = {
        durationValue: latest.durationValue,
        durationUnit: latest.durationUnit,
        validityDays: latest.validityDays,
      };
      return c.json({
        data: {
          approved: false,
          status: "expired",
          expiresAt: latest.expiresAt,
          packageName: latest.packageName,
          planDisplay: buildPlanDisplay(latest.packageName, dur),
          durationShort: formatPackageDurationShort(dur),
          downloadMbps: latest.downloadMbps,
          uploadMbps: latest.uploadMbps,
          customerName: customer.fullName ?? null,
          phone: customer.phone,
        },
      });
    }

    return c.json({
      data: {
        approved: false,
        status: "no_subscription",
        customerName: customer.fullName ?? null,
        phone: customer.phone,
      },
    });
  } catch (error) {
    return portalError(c, error);
  }
});

app.post("/api/portal/login", async (c) => {
  const limited = rateLimitPortalWrite(c);
  if (limited) return limited;
  try {
    const body = await c.req.json();
    const caller = await portalCaller(c);
    const data = await caller.portal.login({
      orgId: body.orgId || portalOrg(c),
      phone: body.phone || body.username,
      password: body.password,
    });
    return c.json({ data: { ...data, username: body.phone || body.username } });
  } catch (error) {
    return portalError(c, error);
  }
});

// Payment configs — returns active payment methods for hotspot portal
app.get("/api/portal/payment-configs", async (c) => {
  try {
    const caller = await portalCaller(c);
    const data = await caller.settings.publicPaymentConfigs({ orgId: portalOrg(c) });
    return c.json({ data });
  } catch (error) {
    return portalError(c, error);
  }
});

// Payment status — hotspot portal polls this after payment submission
app.get("/api/portal/payment-status", async (c) => {
  try {
    const orderId = c.req.query("orderId");
    if (!orderId) return c.json({ error: "orderId required" }, 400);
    const ctx = await createContext(c);
    const [order] = await ctx.db.select({
      id: orders.id,
      status: orders.status,
      subscriptionId: orders.subscriptionId,
    }).from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) return c.json({ error: "Order not found" }, 404);
    return c.json({ data: { status: order.status, active: order.status === "approved" } });
  } catch (error) {
    return portalError(c, error);
  }
});

// Voucher redeem — hotspot portal voucher box
app.post("/api/portal/redeem-voucher", async (c) => {
  const limited = rateLimitPortalWrite(c);
  if (limited) return limited;
  try {
    const body = await c.req.json();
    if (!body.code) return c.json({ error: "Voucher code required" }, 400);
    const caller = await portalCaller(c);
    const data = await caller.portal.redeemVoucher({
      orgId: body.orgId || portalOrg(c),
      code: String(body.code).toUpperCase().trim(),
      mac: body.mac || undefined,
      ip: body.ip || undefined,
    });
    return c.json({ data });
  } catch (error) {
    return portalError(c, error);
  }
});

function hotspotAssetMime(path: string) {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  return "application/octet-stream";
}

app.get("/api/hotspot-assets/*", async (c) => {
  let raw = c.req.path.replace(/^\/api\/hotspot-assets\/?/, "");
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return c.json({ error: "Invalid asset path" }, 400);
  }
  const clean = normalize(raw).replace(/^(\.\.[/\\])+/, "");
  if (!clean || clean.startsWith(".") || clean.includes("..") || clean.includes("\\") || !HOTSPOT_ASSET_EXTENSIONS.has(clean.slice(clean.lastIndexOf(".")).toLowerCase())) {
    return c.json({ error: "Invalid asset path" }, 400);
  }
  const filePath = resolve(HOTSPOT_ASSET_ROOT, clean);
  if (!filePath.startsWith(HOTSPOT_ASSET_ROOT)) return c.json({ error: "Invalid asset path" }, 400);
  try {
    const body = await readFile(filePath);
    return new Response(body, {
      headers: {
        "content-type": hotspotAssetMime(filePath),
        "content-length": String(body.length),
        "cache-control": "no-store",
      },
    });
  } catch {
    return c.json({ error: "Asset not found" }, 404);
  }
});

app.onError((err, c) => {
  logger.error(err, "Global unhandled error");
  return c.json({ error: { message: err.message || "Internal Server Error", code: "INTERNAL_SERVER_ERROR" } }, 500);
});

app.get("/api/health", (c) => c.json({ ok: true, ts: new Date().toISOString() }));

const server = serve({
  fetch: app.fetch,
  port: env.PORT_API,
  hostname: "0.0.0.0",
}, (info) => {
  logger.info(`ISP Nexus API running on port ${info.port}`);
});

const io = new SocketIOServer(server as any, {
  cors: {
    origin: [
      env.API_URL,
      env.APP_URL,
      env.PORTAL_URL,
      env.HOTSPOT_URL,
      "http://localhost:3000",
      "http://localhost:3002",
    ].filter(Boolean) as string[],
    credentials: true,
  },
  path: "/socket.io",
});

const socketDb = createDb(env.DATABASE_URL);

io.use(async (socket, next) => {
  const authToken = typeof socket.handshake.auth.token === "string" ? socket.handshake.auth.token : null;
  const authHeader = socket.handshake.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const accessCookie = socket.handshake.headers.cookie?.match(/(?:^|;\s*)isp_access=([^;]+)/)?.[1] ?? null;
  const payload = await verifyAccessToken(authToken ?? bearerToken ?? accessCookie ?? "");
  if (!payload) return next(new Error("Unauthorized"));

  const [user] = await socketDb.select({ id: users.id, orgId: users.orgId }).from(users)
    .where(and(eq(users.id, payload.userId), eq(users.orgId, payload.orgId), eq(users.isActive, true))).limit(1);
  if (!user) return next(new Error("Unauthorized"));

  socket.data.userId = user.id;
  socket.data.orgId = user.orgId;
  return next();
});

io.on("connection", (socket) => {
  logger.debug({ id: socket.id }, "Socket connected");

  // Auto-join the org room for admin-wide events (orders, payments, stats)
  socket.join(`org:${socket.data.orgId}`);

  socket.on("join:router", async (routerId: string) => {
    const [router] = await socketDb.select({ id: routers.id }).from(routers)
      .where(and(eq(routers.id, routerId), eq(routers.orgId, socket.data.orgId))).limit(1);
    if (router) socket.join(`router:${router.id}`);
  });

  socket.on("join:customer", (customerId: string) => {
    socket.join(`customer:${customerId}`);
  });

  socket.on("disconnect", () => logger.debug({ id: socket.id }, "Socket disconnected"));
});

export { io };

// Emit org-scoped events to all admins watching that org
export function emitOrgEvent(orgId: string, event: string, payload: unknown): void {
  io.to(`org:${orgId}`).emit(event, payload);
}

// Emit customer-scoped events to sockets watching a specific customer
export function emitCustomerEvent(customerId: string, event: string, payload: unknown): void {
  io.to(`customer:${customerId}`).emit(event, payload);
}

setMonitoringEmitter((room, event, payload) => {
  io.to(room).emit(event, payload);
});

async function bootstrap() {
  if (env.NODE_ENV === "production") {
    const mWorker = startMonitoringWorker();
    const aWorker = startAlertsWorker();
    const eWorker = startExpiryWorker();
    const wWorker = startWarningWorker();
    const sWorker = startSyncWorker();
    const secWorker = startSecurityWorker();
    const rWorker = startRetentionWorker();
    await scheduleJobs();
    initBot().catch((err) => {
      logger.warn({ err }, "Telegram bot failed to start — check TELEGRAM_BOT_TOKEN in .env");
    });

    process.on("SIGTERM", async () => {
      logger.info("Shutting down...");
      await stopBot();
      await Promise.allSettled([
        mWorker.close(),
        aWorker.close(),
        eWorker.close(),
        wWorker.close(),
        sWorker.close(),
        secWorker.close(),
        rWorker.close(),
      ]);
      process.exit(0);
    });
  }
  logger.info("ISP Nexus API ready");
}

bootstrap().catch((err) => { logger.error(err); process.exit(1); });
