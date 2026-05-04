import { Queue, Worker } from "bullmq";
import { getRedis } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { createDb } from "@isp-nexus/db";
import { env } from "../lib/env.js";
import { resourceSnapshots, bandwidthSnapshots, routers, telegramConfigs, alertLogs } from "@isp-nexus/db";
import { eq } from "drizzle-orm";
import { decryptText } from "../lib/crypto.js";
import { getMikroTikClient } from "../services/mikrotik/client.js";
import { sendAlert } from "../services/telegram/bot.js";

const connection = { connection: getRedis() };

export const monitoringQueue = new Queue("monitoring", connection);
export const alertsQueue = new Queue("alerts", connection);

export function startMonitoringWorker(): Worker {
  const db = createDb(env.DATABASE_URL);
  return new Worker("monitoring", async (job) => {
    const allRouters = await db.select().from(routers).where(eq(routers.isActive, true));
    for (const r of allRouters) {
      try {
        const password = decryptText(r.passwordEncrypted);
        const client = await getMikroTikClient({ host: r.host, port: r.port, username: r.username, password, useSsl: r.useSsl });
        const [res] = await client.print("/system/resource");
        const [health] = await client.print("/system/health");
        const interfaces = await client.exec("/interface", "monitor-traffic", { interface: "all", once: "" });
        await client.close();

        const freeMemMb = Math.round(parseInt(res?.["free-memory"] || res?.freeMemory || "0") / 1048576);
        const totalMemMb = Math.round(parseInt(res?.["total-memory"] || res?.totalMemory || "0") / 1048576);
        const cpuLoad = parseInt(res?.["cpu-load"] || res?.cpuLoad || "0");
        const tempC = parseFloat(health?.temperature || "0") || null;
        const voltV = parseFloat(health?.voltage || "0") || null;
        const uptime = parseInt(res?.["uptime-seconds"] || res?.uptimeSeconds || "0");

        await db.insert(resourceSnapshots).values({
          routerId: r.id, cpuLoadPct: cpuLoad, freeMemoryMb: freeMemMb,
          totalMemoryMb: totalMemMb, temperatureC: tempC, voltageV: voltV, uptimeSeconds: uptime,
        });

        await db.update(routers).set({ cpuLoad, freeMemoryMb: freeMemMb, temperatureCelsius: tempC, lastSeenAt: new Date() })
          .where(eq(routers.id, r.id));

        for (const iface of interfaces) {
          if (!iface.name) continue;
          await db.insert(bandwidthSnapshots).values({
            routerId: r.id, interfaceName: iface.name,
            rxRateBps: parseInt(iface["rx-bits-per-second"] || iface.rxBitsPerSecond || "0"),
            txRateBps: parseInt(iface["tx-bits-per-second"] || iface.txBitsPerSecond || "0"),
          });
        }
      } catch (err) {
        logger.warn({ err, routerId: r.id }, "Monitoring job failed for router");
      }
    }
  }, connection);
}

export function startAlertsWorker(): Worker {
  const db = createDb(env.DATABASE_URL);
  return new Worker("alerts", async () => {
    const configs = await db.select().from(telegramConfigs).where(eq(telegramConfigs.alertsEnabled, true));
    for (const cfg of configs) {
      const [r] = cfg.routerId
        ? await db.select().from(routers).where(eq(routers.id, cfg.routerId)).limit(1)
        : [];
      if (!r) continue;
      if (r.cpuLoad && r.cpuLoad > cfg.cpuThreshold) {
        const msg = `⚠️ *HIGH CPU* on *${r.name}*\nCPU: ${r.cpuLoad}% (threshold: ${cfg.cpuThreshold}%)`;
        await sendAlert(cfg.chatId, msg);
        await db.insert(alertLogs).values({
          orgId: r.orgId, routerId: r.id, chatId: cfg.chatId,
          alertType: "cpu", message: msg, severity: "warning",
        });
      }
    }
  }, connection);
}

export async function scheduleJobs(): Promise<void> {
  await monitoringQueue.add("collect", {}, { repeat: { every: 30_000 } });
  await alertsQueue.add("check", {}, { repeat: { every: 60_000 } });
  logger.info("BullMQ jobs scheduled");
}
