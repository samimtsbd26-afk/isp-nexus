import { Queue, Worker } from "bullmq";
import { getBullRedis } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { createDb } from "@isp-nexus/db";
import { env } from "../lib/env.js";
import {
  resourceSnapshots,
  bandwidthSnapshots,
  pingSnapshots,
  sfpSnapshots,
  pingTargets,
  routers,
  telegramConfigs,
  alertLogs,
  organizations,
} from "@isp-nexus/db";
import { and, eq } from "drizzle-orm";
import { connectRouter, type MikroTikApi } from "../lib/mikrotik.js";
import { sendAlert } from "../services/telegram/bot.js";

function getQueueConnection() {
  return { connection: getBullRedis() };
}

export function getMonitoringQueue(): Queue {
  return new Queue("monitoring", getQueueConnection());
}

export function getAlertsQueue(): Queue {
  return new Queue("alerts", getQueueConnection());
}

type MonitoringEvent = "resource:update" | "bandwidth:update" | "alert:new";
type MonitoringEmitter = (room: string, event: MonitoringEvent, payload: unknown) => void;

let emitMonitoring: MonitoringEmitter | null = null;

export function setMonitoringEmitter(emitter: MonitoringEmitter): void {
  emitMonitoring = emitter;
}

function numberFrom(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function integerFrom(value: unknown): number {
  return Math.round(numberFrom(value) ?? 0);
}

function interfaceName(row: Record<string, any>): string | null {
  return row.name ?? row.interface ?? row["interface-name"] ?? null;
}

function trafficRate(row: Record<string, any>, dashed: string, camel: string): number {
  return integerFrom(row[dashed] ?? row[camel]);
}

function parsePingSummary(rows: Record<string, any>[]): {
  avgMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  packetLossPct: number | null;
} {
  const summary = rows.find((row) => row["packet-loss"] != null || row.packetLoss != null) ?? rows.at(-1);
  const timeValues = rows
    .map((row) => numberFrom(row.time ?? row["time-ms"] ?? row.timeMs))
    .filter((value): value is number => value != null);

  return {
    avgMs: numberFrom(summary?.["avg-rtt"] ?? summary?.avgRtt) ?? (timeValues.length ? timeValues.reduce((sum, value) => sum + value, 0) / timeValues.length : null),
    minMs: numberFrom(summary?.["min-rtt"] ?? summary?.minRtt) ?? (timeValues.length ? Math.min(...timeValues) : null),
    maxMs: numberFrom(summary?.["max-rtt"] ?? summary?.maxRtt) ?? (timeValues.length ? Math.max(...timeValues) : null),
    packetLossPct: numberFrom(summary?.["packet-loss"] ?? summary?.packetLoss),
  };
}

export function startMonitoringWorker(): Worker {
  const db = createDb(env.DATABASE_URL);
  return new Worker("monitoring", async (job) => {
    const allRouters = await db.select().from(routers).where(eq(routers.isActive, true));
    logger.info({ jobId: job.id, routers: allRouters.length }, "Monitoring job started");
    for (const r of allRouters) {
      let client: MikroTikApi | null = null;
      try {
        client = await connectRouter(r);
        const [res] = await client.print("/system/resource");
        const [health] = await client.print("/system/health").catch((err) => {
          logger.warn({ err, routerId: r.id }, "Router health fetch failed");
          return [];
        });

        const freeMemMb = Math.round(integerFrom(res?.["free-memory"] ?? res?.freeMemory) / 1048576);
        const totalMemMb = Math.round(integerFrom(res?.["total-memory"] ?? res?.totalMemory) / 1048576);
        const cpuLoad = integerFrom(res?.["cpu-load"] ?? res?.cpuLoad);
        const tempC = numberFrom(health?.temperature);
        const voltV = numberFrom(health?.voltage);
        const uptime = integerFrom(res?.["uptime-seconds"] ?? res?.uptimeSeconds);

        await db.insert(resourceSnapshots).values({
          routerId: r.id, cpuLoadPct: cpuLoad, freeMemoryMb: freeMemMb,
          totalMemoryMb: totalMemMb, temperatureC: tempC, voltageV: voltV, uptimeSeconds: uptime,
        });

        await db.update(routers).set({ cpuLoad, freeMemoryMb: freeMemMb, temperatureCelsius: tempC, lastSeenAt: new Date() })
          .where(eq(routers.id, r.id));

        emitMonitoring?.(`router:${r.id}`, "resource:update", {
          routerId: r.id,
          cpuLoadPct: cpuLoad,
          freeMemoryMb: freeMemMb,
          totalMemoryMb: totalMemMb,
          temperatureC: tempC ?? undefined,
          voltageV: voltV ?? undefined,
        });

        const interfaces = await client.print("/interface");
        const ifaceNames = interfaces
          .map((iface: Record<string, any>) => interfaceName(iface))
          .filter((n): n is string => !!n);
        const liveInterfaces: Array<{ name: string; rxBps: number; txBps: number }> = [];
        if (ifaceNames.length > 0) {
          const trafficRows = await client
            .exec("/interface", "monitor-traffic", { interface: ifaceNames.join(","), once: "" })
            .catch((err: unknown) => {
              logger.warn({ err, routerId: r.id }, "Batch interface traffic fetch failed");
              return [] as Record<string, any>[];
            });
          const bwSnapshots: Array<{ routerId: string; interfaceName: string; rxRateBps: number; txRateBps: number }> = [];
          for (const traffic of trafficRows) {
            const name = interfaceName(traffic);
            if (!name) continue;
            const rxBps = trafficRate(traffic, "rx-bits-per-second", "rxBitsPerSecond");
            const txBps = trafficRate(traffic, "tx-bits-per-second", "txBitsPerSecond");
            liveInterfaces.push({ name, rxBps, txBps });
            bwSnapshots.push({ routerId: r.id, interfaceName: name, rxRateBps: rxBps, txRateBps: txBps });
          }
          if (bwSnapshots.length > 0) {
            await db.insert(bandwidthSnapshots).values(bwSnapshots);
          }
        }
        emitMonitoring?.(`router:${r.id}`, "bandwidth:update", { routerId: r.id, interfaces: liveInterfaces });

        const ethernetInterfaces = await client.print("/interface/ethernet").catch(() => []);
        for (const iface of ethernetInterfaces) {
          const name = interfaceName(iface);
          if (!name) continue;
          try {
            const [sfp] = await client.exec("/interface/ethernet", "monitor", { numbers: name, once: "" });
            const rxPowerDbm = numberFrom(sfp?.["sfp-rx-power"] ?? sfp?.sfpRxPower);
            const txPowerDbm = numberFrom(sfp?.["sfp-tx-power"] ?? sfp?.sfpTxPower);
            const temperatureC = numberFrom(sfp?.["sfp-temperature"] ?? sfp?.sfpTemperature);
            const voltageV = numberFrom(sfp?.["sfp-supply-voltage"] ?? sfp?.sfpSupplyVoltage);
            const currentMa = numberFrom(sfp?.["sfp-tx-bias-current"] ?? sfp?.sfpTxBiasCurrent);
            const wavelengthNm = numberFrom(sfp?.["sfp-wavelength"] ?? sfp?.sfpWavelength);
            if (rxPowerDbm == null && txPowerDbm == null && temperatureC == null && voltageV == null && currentMa == null && wavelengthNm == null) continue;
            await db.insert(sfpSnapshots).values({
              routerId: r.id,
              interfaceName: name,
              rxPowerDbm,
              txPowerDbm,
              temperatureC,
              voltageV,
              currentMa,
              wavelengthNm: wavelengthNm == null ? null : Math.round(wavelengthNm),
            });
          } catch (err) {
            logger.warn({ err, routerId: r.id, interfaceName: name }, "SFP fetch failed");
          }
        }

        const targets = await db.select().from(pingTargets)
          .where(and(eq(pingTargets.routerId, r.id), eq(pingTargets.isActive, true)));
        for (const target of targets) {
          try {
            const rows = await client.exec("/", "ping", { address: target.target, count: String(target.count) });
            const summary = parsePingSummary(rows);
            await db.insert(pingSnapshots).values({
              routerId: r.id,
              targetHost: target.target,
              ...summary,
            });
          } catch (err) {
            logger.warn({ err, routerId: r.id, target: target.target }, "Ping target fetch failed");
          }
        }
        logger.info({
          routerId: r.id,
          interfaces: liveInterfaces.map((iface) => iface.name),
          pingTargets: targets.length,
        }, "Monitoring snapshots inserted and emitted");
      } catch (err) {
        logger.warn({ err, routerId: r.id }, "Monitoring job failed for router");
      } finally {
        await client?.close().catch((err) => logger.warn({ err, routerId: r.id }, "Router client close failed"));
      }
    }
  }, getQueueConnection());
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
        emitMonitoring?.(`router:${r.id}`, "alert:new", {
          routerId: r.id,
          routerName: r.name,
          alertType: "cpu",
          message: msg,
          severity: "warning",
        });
      }
    }
  }, getQueueConnection());
}

export function startExpiryWorker(): Worker {
  const db = createDb(env.DATABASE_URL);
  return new Worker("expiry", async (job) => {
    logger.info({ jobId: job.id }, "Expiry job started");
    const { disableExpiredSubscriptions } = await import("../services/subscriptions/expiry.js");
    const result = await disableExpiredSubscriptions();
    logger.info({ result }, "Expiry job completed");
  }, getQueueConnection());
}

export function startWarningWorker(): Worker {
  const db = createDb(env.DATABASE_URL);
  return new Worker("warnings", async (job) => {
    logger.info({ jobId: job.id }, "Warning job started");
    const { sendExpiryWarnings } = await import("../services/subscriptions/expiry.js");
    await sendExpiryWarnings();
    logger.info({ jobId: job.id }, "Warning job completed");
  }, getQueueConnection());
}

export function startSyncWorker(): Worker {
  const db = createDb(env.DATABASE_URL);
  return new Worker("sync", async (job) => {
    logger.info({ jobId: job.id }, "Sync job started");
    const { syncHotspotUsersFromMikroTik, syncPppoeUsersFromMikroTik } = await import("../services/mikrotik/sync.js");
    await syncHotspotUsersFromMikroTik();
    await syncPppoeUsersFromMikroTik();
    logger.info({ jobId: job.id }, "Sync job completed");
  }, getQueueConnection());
}

export function startSecurityWorker(): Worker {
  const db = createDb(env.DATABASE_URL);
  return new Worker("security", async (job) => {
    logger.info({ jobId: job.id }, "Security job started");
    const { checkSuspiciousActivity } = await import("../services/security/monitor.js");
    const orgs = await db.select().from(organizations);
    for (const org of orgs) {
      await checkSuspiciousActivity(org.id);
    }
    logger.info({ jobId: job.id }, "Security job completed");
  }, getQueueConnection());
}

export async function scheduleJobs(): Promise<void> {
  const monitoringQueue = getMonitoringQueue();
  const alertsQueue = getAlertsQueue();
  const expiryQueue = new Queue("expiry", getQueueConnection());
  const syncQueue = new Queue("sync", getQueueConnection());
  const securityQueue = new Queue("security", getQueueConnection());
  const warningQueue = new Queue("warnings", getQueueConnection());
  try {
    await monitoringQueue.add("collect", {}, { repeat: { every: 30_000 } });
    await alertsQueue.add("check", {}, { repeat: { every: 60_000 } });
    await expiryQueue.add("expire", {}, { repeat: { every: 15 * 60 * 1000 } }); // 15 min
    await warningQueue.add("warn", {}, { repeat: { every: 60 * 60 * 1000 } }); // 1 hour
    await syncQueue.add("sync", {}, { repeat: { every: 5 * 60 * 1000 } }); // 5 min
    await securityQueue.add("check", {}, { repeat: { every: 10 * 60 * 1000 } }); // 10 min
  } finally {
    await monitoringQueue.close();
    await alertsQueue.close();
    await expiryQueue.close();
    await warningQueue.close();
    await syncQueue.close();
    await securityQueue.close();
  }
  logger.info("BullMQ jobs scheduled");
}
