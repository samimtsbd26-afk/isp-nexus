// Load .env from monorepo root (dev only — production uses real env vars)
import { readFileSync } from "fs";
import { readFile } from "node:fs/promises";
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
import { and, asc, eq } from "drizzle-orm";
import { createDb, packages, routers, users } from "@isp-nexus/db";
import { appRouter } from "./router.js";
import { createContext } from "./context.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { verifyAccessToken } from "./auth/session.js";
import { initBot, stopBot } from "./services/telegram/bot.js";
import { setMonitoringEmitter, startMonitoringWorker, startAlertsWorker, startExpiryWorker, startSyncWorker, startSecurityWorker, scheduleJobs } from "./jobs/queue.js";

// Safety net: prevent node-routeros !empty crash from killing the whole API process
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — keeping process alive");
});
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled rejection — keeping process alive");
});

const app = new Hono();
const DEFAULT_PORTAL_ORG_ID = "212d7393-7375-4321-93f5-4789deb8b317";
const HOTSPOT_ASSET_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../hotspot");
const HOTSPOT_ASSET_EXTENSIONS = new Set([".html", ".css", ".js", ".png", ".webp", ".jpg", ".jpeg", ".svg"]);
const portalWriteHits = new Map<string, { count: number; resetAt: number }>();

app.use("*", secureHeaders());
app.use("*", cors({
  origin: [
    env.API_URL,
    env.APP_URL,
    env.PORTAL_URL,
    env.HOTSPOT_URL,
    "http://localhost:3000",
    "http://localhost:3002",
  ].filter(Boolean) as string[],
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

function rateLimitPortalWrite(c: any) {
  const ip = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = `${ip}:${c.req.path}`;
  const now = Date.now();
  const current = portalWriteHits.get(key);
  if (!current || current.resetAt <= now) {
    portalWriteHits.set(key, { count: 1, resetAt: now + 60_000 });
    return null;
  }
  current.count += 1;
  if (current.count > 20) return c.json({ error: "Too many requests" }, 429);
  return null;
}

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
  const limited = rateLimitPortalWrite(c);
  if (limited) return limited;
  try {
    const body = await c.req.json();
    const caller = await portalCaller(c);
    if (body.trial) {
      const pkg = await findPortalPackage(c, { packageId: body.packageId, trial: true });
      if (!pkg) return c.json({ error: "No trial package is available" }, 404);
      const data = await caller.portal.trialRegister({
        orgId: body.orgId || portalOrg(c),
        packageId: pkg.id,
        fullName: body.fullName,
        phone: body.phone,
        password: body.password,
      });
      return c.json({ data: { ...data, username: body.phone, password: body.password } });
    }
    const data = await caller.portal.register({
      orgId: body.orgId || portalOrg(c),
      username: body.phone,
      fullName: body.fullName,
      phone: body.phone,
      email: body.email || undefined,
      password: body.password,
    });
    return c.json({ data: { ...data, username: body.phone, password: body.password } });
  } catch (error) {
    return portalError(c, error);
  }
});

app.post("/api/portal/payment", async (c) => {
  const limited = rateLimitPortalWrite(c);
  if (limited) return limited;
  try {
    const body = await c.req.json();
    const pkg = await findPortalPackage(c, { packageId: body.packageId, packageCode: body.packageCode });
    if (!pkg) return c.json({ error: "Package not found" }, 404);
    const caller = await portalCaller(c);
    const data = await caller.portal.guestOrder({
      orgId: body.orgId || portalOrg(c),
      packageId: pkg.id,
      fullName: body.fullName,
      phone: body.phone,
      password: body.password,
      paymentMethod: body.paymentMethod,
      trxId: body.trxId,
      paymentFrom: body.paymentFrom,
      isTrial: false,
    });
    return c.json({ data: { ...data, username: body.phone, password: body.password } });
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

  socket.on("disconnect", () => logger.debug({ id: socket.id }, "Socket disconnected"));
});

export { io };

// Emit org-scoped events to all admins watching that org
export function emitOrgEvent(orgId: string, event: string, payload: unknown): void {
  io.to(`org:${orgId}`).emit(event, payload);
}

setMonitoringEmitter((room, event, payload) => {
  io.to(room).emit(event, payload);
});

async function bootstrap() {
  if (env.NODE_ENV === "production") {
    const mWorker = startMonitoringWorker();
    const aWorker = startAlertsWorker();
    const eWorker = startExpiryWorker();
    const sWorker = startSyncWorker();
    const secWorker = startSecurityWorker();
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
        sWorker.close(),
        secWorker.close(),
      ]);
      process.exit(0);
    });
  }
  logger.info("ISP Nexus API ready");
}

bootstrap().catch((err) => { logger.error(err); process.exit(1); });
