// Load .env from monorepo root (dev only — production uses real env vars)
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
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
import { appRouter } from "./router.js";
import { createContext } from "./context.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { initBot, stopBot } from "./services/telegram/bot.js";
import { startMonitoringWorker, startAlertsWorker, scheduleJobs } from "./jobs/queue.js";

const app = new Hono();

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
  cors: { origin: "*", credentials: true },
  path: "/socket.io",
});

io.on("connection", (socket) => {
  logger.debug({ id: socket.id }, "Socket connected");
  socket.on("join:router", (routerId: string) => socket.join(`router:${routerId}`));
  socket.on("disconnect", () => logger.debug({ id: socket.id }, "Socket disconnected"));
});

export { io };

async function bootstrap() {
  if (env.NODE_ENV === "production") {
    try {
      await initBot();
    } catch (err) {
      logger.warn({ err }, "Telegram bot failed to start — check TELEGRAM_BOT_TOKEN in .env");
    }
    const mWorker = startMonitoringWorker();
    const aWorker = startAlertsWorker();
    await scheduleJobs();

    process.on("SIGTERM", async () => {
      logger.info("Shutting down...");
      await stopBot();
      await mWorker.close();
      await aWorker.close();
      process.exit(0);
    });
  }
  logger.info("ISP Nexus API ready");
}

bootstrap().catch((err) => { logger.error(err); process.exit(1); });
