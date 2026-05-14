import { eq, and, gte, sql, desc, lt } from "drizzle-orm";
import { createDb } from "@isp-nexus/db";
import {
  routers, bandwidthSnapshots, resourceSnapshots,
  alertLogs, orders, activityLog, organizations,
} from "@isp-nexus/db";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { sendAlert } from "../telegram/bot.js";
import { getRedis } from "../../lib/redis.js";

export type IncidentSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface DetectedIncident {
  type: string;
  severity: IncidentSeverity;
  title: string;
  detail: string;
  routerId?: string;
  orgId: string;
  detectedAt: Date;
  clusterKey: string;
}

const db = createDb(env.DATABASE_URL);

// ── Deduplication: skip same cluster within cooldown window ──────────────────
const recentClusters = new Map<string, number>();
const COOLDOWN_MS = 10 * 60 * 1000;

function isDuplicate(key: string): boolean {
  const last = recentClusters.get(key);
  if (last && Date.now() - last < COOLDOWN_MS) return true;
  recentClusters.set(key, Date.now());
  return false;
}

// ── 1. Router disconnect detection ──────────────────────────────────────────
async function detectRouterDownIncidents(orgId: string): Promise<DetectedIncident[]> {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000);
  const routerList = await db
    .select({ id: routers.id, name: routers.name, lastSeenAt: routers.lastSeenAt, isActive: routers.isActive })
    .from(routers)
    .where(eq(routers.orgId, orgId));

  const incidents: DetectedIncident[] = [];
  for (const r of routerList) {
    if (!r.isActive) continue;
    const lastSeen = r.lastSeenAt ? new Date(r.lastSeenAt) : null;
    if (!lastSeen || lastSeen < cutoff) {
      const key = `router_down:${r.id}`;
      if (!isDuplicate(key)) {
        incidents.push({
          type: "router_down",
          severity: "CRITICAL",
          title: `Router Down: ${r.name}`,
          detail: `Router "${r.name}" has not reported in over 5 minutes. Last seen: ${lastSeen?.toISOString() ?? "never"}`,
          routerId: r.id,
          orgId,
          detectedAt: new Date(),
          clusterKey: key,
        });
      }
    }
  }
  return incidents;
}

// ── 2. Bandwidth spike detection (>3× rolling baseline) ─────────────────────
async function detectBandwidthSpikes(orgId: string): Promise<DetectedIncident[]> {
  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  const fiveMinAgo = new Date(now - 5 * 60 * 1000);

  const routerList = await db
    .select({ id: routers.id, name: routers.name })
    .from(routers)
    .where(and(eq(routers.orgId, orgId), eq(routers.isActive, true)));

  const incidents: DetectedIncident[] = [];
  for (const r of routerList) {
    const [baseline] = await db
      .select({ avgRx: sql<number>`avg(rx_rate_bps)`, avgTx: sql<number>`avg(tx_rate_bps)` })
      .from(bandwidthSnapshots)
      .where(and(eq(bandwidthSnapshots.routerId, r.id), gte(bandwidthSnapshots.capturedAt, oneHourAgo), lt(bandwidthSnapshots.capturedAt, fiveMinAgo)));

    const [recent] = await db
      .select({ avgRx: sql<number>`avg(rx_rate_bps)`, avgTx: sql<number>`avg(tx_rate_bps)` })
      .from(bandwidthSnapshots)
      .where(and(eq(bandwidthSnapshots.routerId, r.id), gte(bandwidthSnapshots.capturedAt, fiveMinAgo)));

    if (!baseline || !recent) continue;
    const baseRx = Number(baseline.avgRx ?? 0);
    const baselineMbps = baseRx / 1_000_000;
    const recentRx = Number(recent.avgRx ?? 0);
    const recentMbps = recentRx / 1_000_000;

    if (baseRx > 0 && recentRx > baseRx * 3 && recentMbps > 10) {
      const key = `bw_spike:${r.id}`;
      if (!isDuplicate(key)) {
        const severity: IncidentSeverity = recentMbps > 500 ? "CRITICAL" : recentMbps > 100 ? "WARNING" : "INFO";
        incidents.push({
          type: "bandwidth_spike",
          severity,
          title: `Bandwidth Spike: ${r.name}`,
          detail: `RX jumped from ${baselineMbps.toFixed(1)} Mbps baseline to ${recentMbps.toFixed(1)} Mbps (${((recentRx / baseRx) * 100 - 100).toFixed(0)}% increase)`,
          routerId: r.id,
          orgId,
          detectedAt: new Date(),
          clusterKey: key,
        });
      }
    }
  }
  return incidents;
}

// ── 3. CPU / Memory spike detection ─────────────────────────────────────────
async function detectResourceSpikes(orgId: string): Promise<DetectedIncident[]> {
  const now = Date.now();
  const fiveMinAgo = new Date(now - 5 * 60 * 1000);

  const routerList = await db
    .select({ id: routers.id, name: routers.name })
    .from(routers)
    .where(and(eq(routers.orgId, orgId), eq(routers.isActive, true)));

  const incidents: DetectedIncident[] = [];
  for (const r of routerList) {
    const [recent] = await db
      .select({ avgCpu: sql<number>`avg(cpu_load_pct)`, avgFreeMem: sql<number>`avg(free_memory_mb)`, avgTotalMem: sql<number>`avg(total_memory_mb)` })
      .from(resourceSnapshots)
      .where(and(eq(resourceSnapshots.routerId, r.id), gte(resourceSnapshots.capturedAt, fiveMinAgo)));

    if (!recent) continue;
    const cpu = Number(recent.avgCpu ?? 0);
    const freeMem = Number(recent.avgFreeMem ?? 0);
    const totalMem = Number(recent.avgTotalMem ?? 1);
    const memUsedPct = totalMem > 0 ? ((totalMem - freeMem) / totalMem) * 100 : 0;

    if (cpu > 95) {
      const key = `cpu_critical:${r.id}`;
      if (!isDuplicate(key)) {
        incidents.push({
          type: "cpu_spike",
          severity: "CRITICAL",
          title: `CPU Critical: ${r.name}`,
          detail: `CPU load at ${cpu.toFixed(0)}% for the last 5 minutes`,
          routerId: r.id,
          orgId,
          detectedAt: new Date(),
          clusterKey: key,
        });
      }
    } else if (cpu > 80) {
      const key = `cpu_warn:${r.id}`;
      if (!isDuplicate(key)) {
        incidents.push({
          type: "cpu_spike",
          severity: "WARNING",
          title: `High CPU: ${r.name}`,
          detail: `CPU load at ${cpu.toFixed(0)}%`,
          routerId: r.id,
          orgId,
          detectedAt: new Date(),
          clusterKey: key,
        });
      }
    }

    if (memUsedPct > 90) {
      const key = `mem_critical:${r.id}`;
      if (!isDuplicate(key)) {
        incidents.push({
          type: "memory_spike",
          severity: memUsedPct > 95 ? "CRITICAL" : "WARNING",
          title: `Memory Critical: ${r.name}`,
          detail: `Memory usage at ${memUsedPct.toFixed(0)}% (${freeMem} MB free of ${totalMem} MB)`,
          routerId: r.id,
          orgId,
          detectedAt: new Date(),
          clusterKey: key,
        });
      }
    }
  }
  return incidents;
}

// ── 4. Payment fraud spike (unusual order volume in short window) ────────────
async function detectPaymentFraudSpike(orgId: string): Promise<DetectedIncident[]> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [recentOrders] = await db
    .select({ count: sql<number>`count(*)`, rejected: sql<number>`sum(case when status='rejected' then 1 else 0 end)` })
    .from(orders)
    .where(and(eq(orders.orgId, orgId), gte(orders.createdAt, oneHourAgo)));

  const incidents: DetectedIncident[] = [];
  const total = Number(recentOrders?.count ?? 0);
  const rejected = Number(recentOrders?.rejected ?? 0);
  const rejectedPct = total > 0 ? (rejected / total) * 100 : 0;

  if (total >= 10 && rejectedPct > 50) {
    const key = `payment_fraud:${orgId}`;
    if (!isDuplicate(key)) {
      incidents.push({
        type: "payment_fraud",
        severity: rejectedPct > 80 ? "CRITICAL" : "WARNING",
        title: "Payment Fraud Spike",
        detail: `${rejected}/${total} orders rejected in last hour (${rejectedPct.toFixed(0)}% rejection rate)`,
        orgId,
        detectedAt: new Date(),
        clusterKey: key,
      });
    }
  }
  return incidents;
}

// ── 5. Login failure spike ───────────────────────────────────────────────────
async function detectLoginFailureSpike(orgId: string): Promise<DetectedIncident[]> {
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
  const [loginFails] = await db
    .select({ count: sql<number>`count(*)` })
    .from(activityLog)
    .where(and(
      eq(activityLog.orgId, orgId),
      eq(activityLog.action, "login_failed"),
      gte(activityLog.createdAt, fifteenMinAgo),
    ));

  const incidents: DetectedIncident[] = [];
  const fails = Number(loginFails?.count ?? 0);
  if (fails >= 20) {
    const key = `login_fail_spike:${orgId}`;
    if (!isDuplicate(key)) {
      incidents.push({
        type: "login_failure_spike",
        severity: fails >= 50 ? "CRITICAL" : "WARNING",
        title: "Login Failure Spike",
        detail: `${fails} failed login attempts in the last 15 minutes — possible brute force`,
        orgId,
        detectedAt: new Date(),
        clusterKey: key,
      });
    }
  }
  return incidents;
}

// ── 6. Redis memory spike ────────────────────────────────────────────────────
async function detectRedisMemorySpike(): Promise<DetectedIncident[]> {
  const redis = getRedis();
  const incidents: DetectedIncident[] = [];
  try {
    const info = await redis.info("memory");
    const lines = Object.fromEntries(info.split("\n").map((l) => l.split(":").map((s) => s.trim())));
    const usedBytes = Number(lines["used_memory"] ?? 0);
    const maxBytes = Number(lines["maxmemory"] ?? 0);
    if (maxBytes > 0) {
      const pct = (usedBytes / maxBytes) * 100;
      const key = `redis_mem:global`;
      if (pct > 90 && !isDuplicate(key)) {
        incidents.push({
          type: "redis_memory_spike",
          severity: pct > 95 ? "CRITICAL" : "WARNING",
          title: "Redis Memory Critical",
          detail: `Redis using ${pct.toFixed(0)}% of max memory (${(usedBytes / 1048576).toFixed(0)} MB / ${(maxBytes / 1048576).toFixed(0)} MB)`,
          orgId: "global",
          detectedAt: new Date(),
          clusterKey: key,
        });
      }
    }
  } catch (err) {
    logger.warn({ err }, "Redis memory check failed");
  }
  return incidents;
}

// ── Main entry: run all detectors, persist, emit ─────────────────────────────
export async function runAnomalyDetection(
  orgId: string,
  emit?: (event: string, payload: unknown) => void,
): Promise<DetectedIncident[]> {
  const [routerDown, bwSpikes, resourceSpikes, fraudSpikes, loginSpikes, redisSpikes] = await Promise.allSettled([
    detectRouterDownIncidents(orgId),
    detectBandwidthSpikes(orgId),
    detectResourceSpikes(orgId),
    detectPaymentFraudSpike(orgId),
    detectLoginFailureSpike(orgId),
    detectRedisMemorySpike(),
  ]);

  const allIncidents: DetectedIncident[] = [
    ...(routerDown.status === "fulfilled" ? routerDown.value : []),
    ...(bwSpikes.status === "fulfilled" ? bwSpikes.value : []),
    ...(resourceSpikes.status === "fulfilled" ? resourceSpikes.value : []),
    ...(fraudSpikes.status === "fulfilled" ? fraudSpikes.value : []),
    ...(loginSpikes.status === "fulfilled" ? loginSpikes.value : []),
    ...(redisSpikes.status === "fulfilled" ? redisSpikes.value : []),
  ];

  if (allIncidents.length === 0) return [];

  // Persist to alertLogs and notify via Telegram
  for (const incident of allIncidents) {
    try {
      await db.insert(alertLogs).values({
        orgId: incident.orgId === "global" ? orgId : incident.orgId,
        routerId: incident.routerId ?? null,
        alertType: incident.type,
        message: `[${incident.severity}] ${incident.title}: ${incident.detail}`,
        severity: incident.severity.toLowerCase() as "info" | "warning" | "critical",
      });
      emit?.(`org:${orgId}`, { type: "incident:new", incident });
      logger.info({ orgId, type: incident.type, severity: incident.severity }, "Anomaly detected");
    } catch (err) {
      logger.warn({ err, clusterKey: incident.clusterKey }, "Failed to persist incident");
    }
  }

  return allIncidents;
}

// ── Cluster summary: group incidents by type for dashboard ──────────────────
export function clusterIncidents(incidents: DetectedIncident[]): Record<string, DetectedIncident[]> {
  const clusters: Record<string, DetectedIncident[]> = {};
  for (const inc of incidents) {
    (clusters[inc.type] ??= []).push(inc);
  }
  return clusters;
}
