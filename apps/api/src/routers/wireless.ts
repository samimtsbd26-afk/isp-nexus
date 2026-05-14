import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { routers, wirelessAps, wirelessScans, telegramConfigs } from "@isp-nexus/db";
import { connectRouter, type MikroTikApi } from "../lib/mikrotik.js";
import { logger } from "../lib/logger.js";
import { sendAlert } from "../services/telegram/bot.js";
import { logActivity } from "../lib/activity.js";

// ── helpers ──────────────────────────────────────────────────────────────────

function parseNum(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function parseSignal(v: unknown): number | null {
  // MikroTik reports signal as "-72" or "72"
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).replace(/[^\d-]/g, "");
  const n = parseInt(s, 10);
  if (isNaN(n)) return null;
  return n > 0 ? -n : n; // ensure negative dBm
}

function healthColor(metric: "cpu" | "mem" | "signal" | "ccq", value: number): "green" | "yellow" | "red" {
  if (metric === "cpu") return value < 70 ? "green" : value < 90 ? "yellow" : "red";
  if (metric === "mem") return value > 40 ? "green" : value > 20 ? "yellow" : "red";
  if (metric === "signal") return value >= -65 ? "green" : value >= -80 ? "yellow" : "red";
  if (metric === "ccq") return value >= 80 ? "green" : value >= 50 ? "yellow" : "red";
  return "green";
}

// ── wireless router ───────────────────────────────────────────────────────────

export const wirelessRouter = router({

  // List all APs with latest metrics
  listAps: authedProcedure.query(async ({ ctx }) => {
    const aps = await ctx.db
      .select()
      .from(wirelessAps)
      .where(eq(wirelessAps.orgId, ctx.orgId))
      .orderBy(desc(wirelessAps.updatedAt));
    return aps.map((ap) => ({
      ...ap,
      health: {
        cpu: ap.cpuLoad != null ? healthColor("cpu", ap.cpuLoad) : "green",
        mem: ap.freeMemoryMb != null && ap.totalMemoryMb
          ? healthColor("mem", Math.round((ap.freeMemoryMb / ap.totalMemoryMb) * 100))
          : "green",
        signal: ap.signalStrength != null ? healthColor("signal", ap.signalStrength) : "green",
        ccq: ap.ccq != null ? healthColor("ccq", ap.ccq) : "green",
      },
    }));
  }),

  // Refresh AP data from live MikroTik routers
  syncAps: adminProcedure.mutation(async ({ ctx }) => {
    const allRouters = await ctx.db
      .select()
      .from(routers)
      .where(and(eq(routers.orgId, ctx.orgId), eq(routers.isActive, true)));

    let synced = 0;
    for (const r of allRouters) {
      let client: MikroTikApi | null = null;
      try {
        client = await connectRouter(r);

        const [ifaces, resources, registrations] = await Promise.all([
          client.print("/interface/wireless").catch(() => []),
          client.print("/system/resource").catch(() => []),
          client.print("/interface/wireless/registration-table").catch(() => []),
        ]);

        const res = resources[0] ?? {};
        const totalMemBytes = parseNum(res["total-memory"]) ?? 0;
        const freeMemBytes = parseNum(res["free-memory"]) ?? 0;
        const cpuLoad = parseNum(res["cpu-load"]);
        const totalMemMb = totalMemBytes > 0 ? Math.round(totalMemBytes / 1024 / 1024) : null;
        const freeMemMb = freeMemBytes > 0 ? Math.round(freeMemBytes / 1024 / 1024) : null;
        const uptime = String(res["uptime"] ?? "");

        for (const iface of ifaces) {
          if (iface.type !== "wlan" && !String(iface.name).startsWith("wlan") && !String(iface.name).startsWith("wifi")) continue;

          const clientsForIface = registrations.filter((reg: any) => reg.interface === iface.name);

          const existing = await ctx.db.select({ id: wirelessAps.id }).from(wirelessAps)
            .where(and(
              eq(wirelessAps.routerId, r.id),
              eq(wirelessAps.interfaceName, String(iface.name)),
            )).limit(1);

          const apData = {
            orgId: ctx.orgId,
            routerId: r.id,
            interfaceName: String(iface.name),
            ssid: iface.ssid ? String(iface.ssid) : null,
            macAddress: iface["mac-address"] ? String(iface["mac-address"]) : null,
            band: iface.band ? String(iface.band) : null,
            channel: iface.channel ? String(iface.channel) : null,
            frequency: parseNum(iface.frequency),
            channelWidth: iface["channel-width"] ? String(iface["channel-width"]) : null,
            txPower: parseNum(iface["tx-power"]),
            noiseFloor: parseSignal(iface["noise-floor"]),
            signalStrength: parseSignal(iface["signal-strength"]),
            ccq: parseNum(iface.ccq),
            txRate: parseNum(iface["tx-rate"]),
            rxRate: parseNum(iface["rx-rate"]),
            registeredClients: clientsForIface.length,
            cpuLoad: cpuLoad != null ? Math.round(cpuLoad) : null,
            freeMemoryMb: freeMemMb,
            totalMemoryMb: totalMemMb,
            uptime,
            isOnline: true,
            lastSeenAt: new Date(),
            updatedAt: new Date(),
          };

          if (existing.length > 0) {
            await ctx.db.update(wirelessAps).set(apData).where(eq(wirelessAps.id, existing[0].id));
          } else {
            await ctx.db.insert(wirelessAps).values(apData);
          }
          synced++;
        }
      } catch (err) {
        logger.warn({ routerId: r.id, err }, "Wireless sync failed for router");
        // Mark all APs for this router as offline
        await ctx.db.update(wirelessAps).set({ isOnline: false, updatedAt: new Date() })
          .where(eq(wirelessAps.routerId, r.id));
      } finally {
        await client?.close().catch(() => {});
      }
    }

    return { synced };
  }),

  // Run channel scan on a specific interface
  runChannelScan: adminProcedure
    .input(z.object({ routerId: z.string().uuid(), interfaceName: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await ctx.db.select().from(routers)
        .where(and(eq(routers.id, input.routerId), eq(routers.orgId, ctx.orgId))).limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Router not found" });

      let client: MikroTikApi | null = null;
      try {
        client = await connectRouter(r);

        // Backup current wireless settings before scan
        const currentIface = await client.print("/interface/wireless", { name: input.interfaceName }).catch(() => []);

        const scanResults = await client.exec("/interface/wireless", "scan", {
          ".id": currentIface[0]?.id ?? "*0",
          duration: "3",
        }).catch(() => []);

        // Delete old scans for this interface
        await ctx.db.delete(wirelessScans)
          .where(and(
            eq(wirelessScans.routerId, input.routerId),
            eq(wirelessScans.interfaceName, input.interfaceName),
          ));

        const inserted: string[] = [];
        for (const result of scanResults) {
          const [row] = await ctx.db.insert(wirelessScans).values({
            orgId: ctx.orgId,
            routerId: input.routerId,
            interfaceName: input.interfaceName,
            frequency: parseNum(result.frequency),
            channel: result.channel ? String(result.channel) : null,
            ssid: result.ssid ? String(result.ssid) : null,
            bssid: result.address ? String(result.address) : null,
            signalStrength: parseSignal(result["signal-strength"]),
            band: result.band ? String(result.band) : null,
            radioCount: parseNum(result["radio-count"]) ?? 1,
          }).returning({ id: wirelessScans.id });
          inserted.push(row.id);
        }

        await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "scan", "wireless_ap", input.routerId, {
          interface: input.interfaceName,
          results: inserted.length,
        });

        return { scanned: inserted.length };
      } finally {
        await client?.close().catch(() => {});
      }
    }),

  // Get latest channel scan results
  getChannelScans: authedProcedure
    .input(z.object({ routerId: z.string().uuid(), interfaceName: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(wirelessScans)
        .where(and(
          eq(wirelessScans.routerId, input.routerId),
          eq(wirelessScans.interfaceName, input.interfaceName),
          eq(wirelessScans.orgId, ctx.orgId),
        ))
        .orderBy(desc(wirelessScans.signalStrength));
    }),

  // Apply channel change (safe action with backup)
  applyChannel: adminProcedure
    .input(z.object({
      routerId: z.string().uuid(),
      interfaceName: z.string(),
      channel: z.string(),
      frequency: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await ctx.db.select().from(routers)
        .where(and(eq(routers.id, input.routerId), eq(routers.orgId, ctx.orgId))).limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Router not found" });

      let client: MikroTikApi | null = null;
      try {
        client = await connectRouter(r);

        const [iface] = await client.print("/interface/wireless", { name: input.interfaceName }).catch(() => [undefined]);
        if (!iface) throw new TRPCError({ code: "NOT_FOUND", message: "Wireless interface not found on router" });

        // Store old channel in activity log as rollback data
        await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "update", "wireless_channel", input.routerId, {
          interface: input.interfaceName,
          oldChannel: iface.channel,
          newChannel: input.channel,
          rollback: { channel: iface.channel, frequency: iface.frequency },
        });

        await client.exec("/interface/wireless", "set", {
          ".id": iface.id,
          channel: input.channel,
          ...(input.frequency ? { frequency: String(input.frequency) } : {}),
        });

        return { ok: true, applied: input.channel };
      } finally {
        await client?.close().catch(() => {});
      }
    }),

  // Change TX power
  applyTxPower: adminProcedure
    .input(z.object({
      routerId: z.string().uuid(),
      interfaceName: z.string(),
      txPower: z.number().int().min(0).max(30),
    }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await ctx.db.select().from(routers)
        .where(and(eq(routers.id, input.routerId), eq(routers.orgId, ctx.orgId))).limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Router not found" });

      let client: MikroTikApi | null = null;
      try {
        client = await connectRouter(r);

        const [iface] = await client.print("/interface/wireless", { name: input.interfaceName }).catch(() => [undefined]);
        if (!iface) throw new TRPCError({ code: "NOT_FOUND", message: "Wireless interface not found" });

        await client.exec("/interface/wireless", "set", {
          ".id": iface.id,
          "tx-power": String(input.txPower),
          "tx-power-mode": "card-rates",
        });

        await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "update", "wireless_txpower", input.routerId, {
          interface: input.interfaceName,
          txPower: input.txPower,
        });

        return { ok: true };
      } finally {
        await client?.close().catch(() => {});
      }
    }),

  // Reboot AP / wireless interface
  rebootAp: adminProcedure
    .input(z.object({ routerId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await ctx.db.select().from(routers)
        .where(and(eq(routers.id, input.routerId), eq(routers.orgId, ctx.orgId))).limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Router not found" });

      let client: MikroTikApi | null = null;
      try {
        client = await connectRouter(r);

        await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "reboot", "router", input.routerId, {});

        // Fire and forget — router will reboot immediately
        client.exec("/system", "reboot", {}).catch(() => {});
        return { ok: true };
      } finally {
        await client?.close().catch(() => {});
      }
    }),

  // Disable/enable wireless interface
  setInterfaceEnabled: adminProcedure
    .input(z.object({
      routerId: z.string().uuid(),
      interfaceName: z.string(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await ctx.db.select().from(routers)
        .where(and(eq(routers.id, input.routerId), eq(routers.orgId, ctx.orgId))).limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Router not found" });

      let client: MikroTikApi | null = null;
      try {
        client = await connectRouter(r);

        const [iface] = await client.print("/interface/wireless", { name: input.interfaceName }).catch(() => [undefined]);
        if (!iface) throw new TRPCError({ code: "NOT_FOUND", message: "Wireless interface not found" });

        if (input.enabled) {
          await client.exec("/interface/wireless", "enable", { ".id": iface.id });
        } else {
          await client.exec("/interface/wireless", "disable", { ".id": iface.id });
        }

        await logActivity(ctx.db, ctx.orgId, ctx.user?.id, input.enabled ? "enable" : "disable", "wireless_interface", input.routerId, {
          interface: input.interfaceName,
        });

        return { ok: true };
      } finally {
        await client?.close().catch(() => {});
      }
    }),

  // Get live client list for an AP
  getRegistrationTable: authedProcedure
    .input(z.object({ routerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [r] = await ctx.db.select().from(routers)
        .where(and(eq(routers.id, input.routerId), eq(routers.orgId, ctx.orgId))).limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Router not found" });

      let client: MikroTikApi | null = null;
      try {
        client = await connectRouter(r);

        const regs = await client.print("/interface/wireless/registration-table").catch(() => []);

        return regs.map((reg: any) => ({
          macAddress: String(reg["mac-address"] ?? ""),
          interface: String(reg.interface ?? ""),
          signalStrength: parseSignal(reg["signal-strength"]),
          signalToNoise: parseNum(reg["signal-to-noise"]),
          txRate: parseNum(reg["tx-rate"]),
          rxRate: parseNum(reg["rx-rate"]),
          uptime: String(reg.uptime ?? ""),
          txBytes: parseNum(reg["tx-bytes"]),
          rxBytes: parseNum(reg["rx-bytes"]),
          ccq: parseNum(reg.ccq),
          frameError: parseNum(reg["frame-error"]),
          packetsLost: parseNum(reg["packets-lost"]),
          comment: reg.comment ? String(reg.comment) : null,
        }));
      } finally {
        await client?.close().catch(() => {});
      }
    }),

  // Channel recommendations based on scan data
  getChannelRecommendations: authedProcedure
    .input(z.object({ routerId: z.string().uuid(), interfaceName: z.string() }))
    .query(async ({ ctx, input }) => {
      const scans = await ctx.db.select().from(wirelessScans)
        .where(and(
          eq(wirelessScans.routerId, input.routerId),
          eq(wirelessScans.interfaceName, input.interfaceName),
          eq(wirelessScans.orgId, ctx.orgId),
        ));

      if (scans.length === 0) return { recommendations: [], bestChannel: null, congestionMap: {} };

      // Count APs per channel
      const congestionMap: Record<string, { count: number; avgSignal: number; signals: number[] }> = {};
      for (const s of scans) {
        const ch = s.channel ?? s.frequency?.toString() ?? "unknown";
        if (!congestionMap[ch]) congestionMap[ch] = { count: 0, avgSignal: 0, signals: [] };
        congestionMap[ch].count++;
        if (s.signalStrength != null) congestionMap[ch].signals.push(s.signalStrength);
      }
      for (const ch of Object.keys(congestionMap)) {
        const { signals } = congestionMap[ch];
        congestionMap[ch].avgSignal = signals.length > 0
          ? Math.round(signals.reduce((a, b) => a + b, 0) / signals.length)
          : -100;
      }

      // Determine if 2.4 or 5GHz
      const has5GHz = scans.some((s) => (s.frequency ?? 0) > 4000);

      const recommendations: Array<{ channel: string; interference: "low" | "medium" | "high"; apCount: number; avgSignal: number }> = [];

      if (has5GHz) {
        // 5GHz — recommend non-DFS channels with least congestion
        const channels5 = ["36", "40", "44", "48", "149", "153", "157", "161"];
        for (const ch of channels5) {
          const info = congestionMap[ch] ?? { count: 0, avgSignal: -100, signals: [] };
          recommendations.push({
            channel: ch,
            interference: info.count === 0 ? "low" : info.count <= 2 ? "medium" : "high",
            apCount: info.count,
            avgSignal: info.avgSignal,
          });
        }
      } else {
        // 2.4GHz — only non-overlapping channels: 1, 6, 11
        for (const ch of ["1", "6", "11"]) {
          const info = congestionMap[ch] ?? { count: 0, avgSignal: -100, signals: [] };
          recommendations.push({
            channel: ch,
            interference: info.count === 0 ? "low" : info.count <= 2 ? "medium" : "high",
            apCount: info.count,
            avgSignal: info.avgSignal,
          });
        }
      }

      recommendations.sort((a, b) => a.apCount - b.apCount || b.avgSignal - a.avgSignal);
      const bestChannel = recommendations[0]?.channel ?? null;

      return { recommendations, bestChannel, congestionMap: Object.fromEntries(
        Object.entries(congestionMap).map(([k, v]) => [k, { count: v.count, avgSignal: v.avgSignal }])
      )};
    }),

  // Send Telegram alert for AP issue
  sendApAlert: adminProcedure
    .input(z.object({
      message: z.string().max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const [tg] = await ctx.db.select().from(telegramConfigs)
        .where(and(eq(telegramConfigs.orgId, ctx.orgId), eq(telegramConfigs.alertsEnabled, true))).limit(1);
      if (!tg) return { ok: false, reason: "Telegram not configured" };

      await sendAlert(tg.chatId, `📡 *Wireless Alert*\n\n${input.message}`);
      return { ok: true };
    }),
});
