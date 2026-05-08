import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { hotspotTemplates, routers, hotspotUsers } from "@isp-nexus/db";
import { decryptText } from "../lib/crypto.js";
import { getMikroTikClient, type MikroTikApi } from "../services/mikrotik/client.js";

async function getRouterClient(db: any, orgId: string, routerId: string): Promise<MikroTikApi> {
  const [r] = await db.select().from(routers)
    .where(and(eq(routers.id, routerId), eq(routers.orgId, orgId))).limit(1);
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Router not found" });
  const password = decryptText(r.passwordEncrypted);
  const port = r.useSsl ? (r.sslPort ?? 8729) : r.port;
  return getMikroTikClient({ host: r.host, port, username: r.username, password, useSsl: r.useSsl });
}

const routerIdInput = z.object({ routerId: z.string().uuid() });
const SHARED_POOL_MBPS = 450;

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseRateBps(value: unknown): number {
  if (typeof value === "number") return value;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const match = raw.match(/^([\d.]+)\s*([kKmMgG]?)(?:bps)?$/);
  if (!match) return toNumber(raw);
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "g") return amount * 1_000_000_000;
  if (unit === "m") return amount * 1_000_000;
  if (unit === "k") return amount * 1_000;
  return amount;
}

function mbpsFromBps(value: number): number {
  return Math.round((value / 1_000_000) * 10) / 10;
}

export const mikrotikRouter = router({
  getDeviceInfo: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try {
      const [identity] = await client.print("/system/identity");
      const [resource] = await client.print("/system/resource");
      const [routerboard] = await client.print("/system/routerboard");
      const [health] = await client.print("/system/health");
      return { identity: identity?.name, ...resource, ...routerboard, ...health };
    } finally { await client.close(); }
  }),

  getInterfaces: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return await client.print("/interface"); }
    finally { await client.close(); }
  }),

  getInterfaceTraffic: authedProcedure.input(z.object({ routerId: z.string().uuid(), interfaces: z.string() })).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return await client.exec("/interface", "monitor-traffic", { interface: input.interfaces, once: "" }); }
    finally { await client.close(); }
  }),

  getPppoeUsers: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return await client.print("/ppp/secret"); }
    finally { await client.close(); }
  }),

  addPppoeUser: adminProcedure.input(z.object({
    routerId: z.string().uuid(), name: z.string(), password: z.string(),
    profile: z.string().default("default"), service: z.string().default("pppoe"),
    remoteAddress: z.string().optional(), comment: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const { routerId, ...data } = input;
    const client = await getRouterClient(ctx.db, ctx.orgId, routerId);
    try {
      const addData: Record<string, string> = { name: data.name, password: data.password, profile: data.profile, service: data.service };
      if (data.remoteAddress) addData["remote-address"] = data.remoteAddress;
      if (data.comment) addData.comment = data.comment;
      await client.add("/ppp/secret", addData);
      return { ok: true };
    } finally { await client.close(); }
  }),

  removePppoeUser: adminProcedure.input(z.object({ routerId: z.string().uuid(), name: z.string() })).mutation(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try {
      const users = await client.print("/ppp/secret", { name: input.name });
      const user = users[0];
      if (user?.[".id"]) await client.remove("/ppp/secret", user[".id"]);
      return { ok: true };
    } finally { await client.close(); }
  }),

  getActivePppoeSessions: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return await client.print("/ppp/active"); }
    finally { await client.close(); }
  }),

  getHotspotUsers: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return await client.print("/ip/hotspot/user"); }
    finally { await client.close(); }
  }),

  addHotspotUser: adminProcedure.input(z.object({
    routerId: z.string().uuid(), name: z.string(), password: z.string(),
    profile: z.string().default("default"), macAddress: z.string().optional(), comment: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const { routerId, ...data } = input;
    const client = await getRouterClient(ctx.db, ctx.orgId, routerId);
    try {
      const addData: Record<string, string> = { name: data.name, password: data.password, profile: data.profile };
      if (data.macAddress) addData["mac-address"] = data.macAddress;
      if (data.comment) addData.comment = data.comment;
      await client.add("/ip/hotspot/user", addData);
      return { ok: true };
    } finally { await client.close(); }
  }),

  removeHotspotUser: adminProcedure.input(z.object({ routerId: z.string().uuid(), name: z.string() })).mutation(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    const logs: string[] = [];
    try {
      const name = input.name;

      // 1. Remove active session
      try {
        const actives = await client.print("/ip/hotspot/active", { user: name });
        for (const a of actives) {
          if (a?.[".id"]) {
            await client.remove("/ip/hotspot/active", a[".id"]);
            logs.push("active removed");
          }
        }
      } catch { /* ignore if not found */ }

      // 2. Remove cookie
      try {
        const cookies = await client.print("/ip/hotspot/cookie", { user: name });
        for (const c of cookies) {
          if (c?.[".id"]) {
            await client.remove("/ip/hotspot/cookie", c[".id"]);
            logs.push("cookie removed");
          }
        }
      } catch { /* ignore if not found */ }

      // 3. Remove host
      try {
        const hosts = await client.print("/ip/hotspot/host", { user: name });
        for (const h of hosts) {
          if (h?.[".id"]) {
            await client.remove("/ip/hotspot/host", h[".id"]);
            logs.push("host removed");
          }
        }
      } catch { /* ignore if not found */ }

      // 4. Remove IP binding (if exists)
      try {
        const bindings = await client.print("/ip/hotspot/ip-binding", { comment: name });
        for (const b of bindings) {
          if (b?.[".id"]) {
            await client.remove("/ip/hotspot/ip-binding", b[".id"]);
            logs.push("binding removed");
          }
        }
      } catch { /* ignore if not found */ }

      // 5. Remove hotspot user
      try {
        const users = await client.print("/ip/hotspot/user", { name });
        const user = users[0];
        if (user?.[".id"]) {
          await client.remove("/ip/hotspot/user", user[".id"]);
          logs.push("user removed");
        }
      } catch { /* ignore if not found */ }

      // 6. Remove DB record
      try {
        await ctx.db.delete(hotspotUsers)
          .where(and(eq(hotspotUsers.orgId, ctx.orgId), eq(hotspotUsers.routerId, input.routerId), eq(hotspotUsers.name, name)));
        logs.push("db removed");
      } catch { /* ignore if not found */ }

      return { ok: true, logs };
    } finally { await client.close(); }
  }),

  getActiveHotspotSessions: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return await client.print("/ip/hotspot/active"); }
    finally { await client.close(); }
  }),

  getQueues: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return await client.print("/queue/simple"); }
    finally { await client.close(); }
  }),

  addQueue: adminProcedure.input(z.object({
    routerId: z.string().uuid(), name: z.string(), target: z.string(),
    maxLimit: z.string(), burstLimit: z.string().optional(), comment: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const { routerId, ...data } = input;
    const client = await getRouterClient(ctx.db, ctx.orgId, routerId);
    try {
      const addData: Record<string, string> = { name: data.name, target: data.target, "max-limit": data.maxLimit };
      if (data.burstLimit) addData["burst-limit"] = data.burstLimit;
      if (data.comment) addData.comment = data.comment;
      await client.add("/queue/simple", addData);
      return { ok: true };
    } finally { await client.close(); }
  }),

  removeQueue: adminProcedure.input(z.object({ routerId: z.string().uuid(), id: z.string() })).mutation(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { await client.remove("/queue/simple", input.id); return { ok: true }; }
    finally { await client.close(); }
  }),

  getFirewallRules: authedProcedure.input(z.object({ routerId: z.string().uuid(), type: z.enum(["filter","nat","mangle","raw"]).default("filter") })).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return await client.print(`/ip/firewall/${input.type}`); }
    finally { await client.close(); }
  }),

  addFirewallRule: adminProcedure.input(z.object({
    routerId: z.string().uuid(), type: z.enum(["filter","nat","mangle","raw"]),
    chain: z.string(), action: z.string(), protocol: z.string().optional(),
    srcAddress: z.string().optional(), dstAddress: z.string().optional(),
    dstPort: z.string().optional(), comment: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const { routerId, type, ...data } = input;
    const client = await getRouterClient(ctx.db, ctx.orgId, routerId);
    try {
      const addData: Record<string, string> = { chain: data.chain, action: data.action };
      if (data.protocol) addData.protocol = data.protocol;
      if (data.srcAddress) addData["src-address"] = data.srcAddress;
      if (data.dstAddress) addData["dst-address"] = data.dstAddress;
      if (data.dstPort) addData["dst-port"] = data.dstPort;
      if (data.comment) addData.comment = data.comment;
      await client.add(`/ip/firewall/${type}`, addData);
      return { ok: true };
    } finally { await client.close(); }
  }),

  getDhcpLeases: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return await client.print("/ip/dhcp-server/lease"); }
    finally { await client.close(); }
  }),

  getSystemLogs: authedProcedure.input(z.object({ routerId: z.string().uuid(), limit: z.number().default(100) })).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return (await client.print("/log")).slice(0, input.limit); }
    finally { await client.close(); }
  }),

  getWireguardPeers: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return await client.print("/interface/wireguard/peers"); }
    finally { await client.close(); }
  }),

  addWireguardPeer: adminProcedure.input(z.object({
    routerId: z.string().uuid(), interface: z.string(), publicKey: z.string(),
    allowedAddress: z.string(), endpointAddress: z.string().optional(),
    endpointPort: z.number().optional(), persistentKeepalive: z.string().optional(), comment: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const { routerId, ...data } = input;
    const client = await getRouterClient(ctx.db, ctx.orgId, routerId);
    try {
      const addData: Record<string, string> = {
        interface: data.interface, "public-key": data.publicKey, "allowed-address": data.allowedAddress,
      };
      if (data.endpointAddress) addData["endpoint-address"] = data.endpointAddress;
      if (data.endpointPort) addData["endpoint-port"] = String(data.endpointPort);
      if (data.persistentKeepalive) addData["persistent-keepalive"] = data.persistentKeepalive;
      if (data.comment) addData.comment = data.comment;
      await client.add("/interface/wireguard/peers", addData);
      return { ok: true };
    } finally { await client.close(); }
  }),

  removeWireguardPeer: adminProcedure.input(z.object({ routerId: z.string().uuid(), id: z.string() })).mutation(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { await client.remove("/interface/wireguard/peers", input.id); return { ok: true }; }
    finally { await client.close(); }
  }),

  getIpAddresses: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return await client.print("/ip/address"); }
    finally { await client.close(); }
  }),

  getRoutes: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return await client.print("/ip/route"); }
    finally { await client.close(); }
  }),

  getSfpModules: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return await client.print("/interface/ethernet"); }
    finally { await client.close(); }
  }),

  getNeighbors: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return await client.print("/ip/neighbor"); }
    finally { await client.close(); }
  }),

  ping: authedProcedure.input(z.object({ routerId: z.string().uuid(), address: z.string(), count: z.number().default(4) })).mutation(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try {
      return await client.exec("/tool", "ping", { address: input.address, count: String(input.count) });
    } finally { await client.close(); }
  }),

  rebootRouter: adminProcedure.input(routerIdInput).mutation(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { await client.exec("/system", "reboot"); return { ok: true }; }
    finally { try { await client.close(); } catch {} }
  }),

  getHotspotProfiles: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return await client.print("/ip/hotspot/user/profile"); }
    finally { await client.close(); }
  }),

  getPppoeProfiles: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return await client.print("/ppp/profile"); }
    finally { await client.close(); }
  }),

  // === HOTSPOT CONTROL CENTER ===

  getHotspotHosts: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return await client.print("/ip/hotspot/host"); }
    finally { await client.close(); }
  }),

  removeHotspotHost: adminProcedure.input(z.object({ routerId: z.string().uuid(), id: z.string() })).mutation(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { await client.remove("/ip/hotspot/host", input.id); return { ok: true }; }
    finally { await client.close(); }
  }),

  getHotspotCookies: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return await client.print("/ip/hotspot/cookie"); }
    finally { await client.close(); }
  }),

  removeHotspotCookie: adminProcedure.input(z.object({ routerId: z.string().uuid(), id: z.string() })).mutation(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { await client.remove("/ip/hotspot/cookie", input.id); return { ok: true }; }
    finally { await client.close(); }
  }),

  getHotspotIpBindings: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return await client.print("/ip/hotspot/ip-binding"); }
    finally { await client.close(); }
  }),

  addHotspotIpBinding: adminProcedure.input(z.object({
    routerId: z.string().uuid(), macAddress: z.string(), address: z.string().optional(),
    toAddress: z.string().optional(), type: z.enum(["regular","bypassed","blocked"]).default("regular"),
    comment: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const { routerId, ...data } = input;
    const client = await getRouterClient(ctx.db, ctx.orgId, routerId);
    try {
      const addData: Record<string, string> = { "mac-address": data.macAddress, type: data.type };
      if (data.address) addData.address = data.address;
      if (data.toAddress) addData["to-address"] = data.toAddress;
      if (data.comment) addData.comment = data.comment;
      await client.add("/ip/hotspot/ip-binding", addData);
      return { ok: true };
    } finally { await client.close(); }
  }),

  removeHotspotIpBinding: adminProcedure.input(z.object({ routerId: z.string().uuid(), id: z.string() })).mutation(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { await client.remove("/ip/hotspot/ip-binding", input.id); return { ok: true }; }
    finally { await client.close(); }
  }),

  getHotspotServicePorts: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return await client.print("/ip/hotspot/service-port"); }
    finally { await client.close(); }
  }),

  getWalledGarden: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return await client.print("/ip/hotspot/walled-garden"); }
    finally { await client.close(); }
  }),

  addWalledGarden: adminProcedure.input(z.object({
    routerId: z.string().uuid(), dstHost: z.string().optional(), dstPort: z.string().optional(),
    action: z.enum(["allow","deny"]).default("allow"), comment: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const { routerId, ...data } = input;
    const client = await getRouterClient(ctx.db, ctx.orgId, routerId);
    try {
      const addData: Record<string, string> = { action: data.action };
      if (data.dstHost) addData["dst-host"] = data.dstHost;
      if (data.dstPort) addData["dst-port"] = data.dstPort;
      if (data.comment) addData.comment = data.comment;
      await client.add("/ip/hotspot/walled-garden", addData);
      return { ok: true };
    } finally { await client.close(); }
  }),

  removeWalledGarden: adminProcedure.input(z.object({ routerId: z.string().uuid(), id: z.string() })).mutation(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { await client.remove("/ip/hotspot/walled-garden", input.id); return { ok: true }; }
    finally { await client.close(); }
  }),

  getHotspotServers: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return await client.print("/ip/hotspot"); }
    finally { await client.close(); }
  }),

  getHotspotServerProfiles: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try { return await client.print("/ip/hotspot/profile"); }
    finally { await client.close(); }
  }),

  getLiveStats: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try {
      const [identity] = await client.print("/system/identity");
      const [resource] = await client.print("/system/resource");
      const interfaces = await client.print("/interface");
      const activePppoe = await client.print("/ppp/active");
      const activeHotspot = await client.print("/ip/hotspot/active");
      const hotspotUsers = await client.print("/ip/hotspot/user");
      const queues = await client.print("/queue/simple");
      const queueTree = await client.print("/queue/tree");
      const firewallFilter = await client.print("/ip/firewall/filter");
      const routes = await client.print("/ip/route");

      const runningIfaces = interfaces.filter((i: any) => i.running === "true" || i.running === true);
      const sharedQueues = queueTree.filter((q: any) => String(q.name ?? "").startsWith("skynity-shared-"));
      const currentSharedBps = sharedQueues.reduce((sum: number, queue: any) => sum + parseRateBps(queue.rate), 0);
      const packageUtilization = activeHotspot.reduce((acc: Record<string, { activeUsers: number; bytesIn: number; bytesOut: number }>, user: any) => {
        const profile = String(user.profile ?? "default");
        acc[profile] ??= { activeUsers: 0, bytesIn: 0, bytesOut: 0 };
        acc[profile].activeUsers += 1;
        acc[profile].bytesIn += toNumber(user.bytesIn);
        acc[profile].bytesOut += toNumber(user.bytesOut);
        return acc;
      }, {});
      const burstProfiles = new Set(
        (await client.print("/ip/hotspot/user/profile"))
          .filter((profile: any) => String(profile.name ?? "").startsWith("skynity_") && String(profile.rateLimit ?? profile["rate-limit"] ?? "").split(" ").length > 1)
          .map((profile: any) => profile.name),
      );

      return {
        identity: identity?.name ?? "Unknown",
        model: resource?.boardName ?? null,
        rosVersion: resource?.version ?? null,
        uptime: resource?.uptime ?? null,
        cpuLoad: resource?.cpuLoad ? Number(resource.cpuLoad) : null,
        totalMemoryMb: resource?.totalMemory ? Math.round(Number(resource.totalMemory) / 1024 / 1024) : null,
        freeMemoryMb: resource?.freeMemory ? Math.round(Number(resource.freeMemory) / 1024 / 1024) : null,
        totalHddSpaceMb: resource?.totalHddSpace ? Math.round(Number(resource.totalHddSpace) / 1024 / 1024) : null,
        freeHddSpaceMb: resource?.freeHddSpace ? Math.round(Number(resource.freeHddSpace) / 1024 / 1024) : null,
        architectureName: resource?.architectureName ?? null,
        cpuCount: resource?.cpuCount ? Number(resource.cpuCount) : null,
        cpuFrequency: resource?.cpuFrequency ? Number(resource.cpuFrequency) : null,
        interfaceCount: interfaces.length,
        runningInterfaceCount: runningIfaces.length,
        activePppoeCount: activePppoe.length,
        activeHotspotCount: activeHotspot.length,
        hotspotUserCount: hotspotUsers.length,
        sharedBandwidth: {
          totalPoolMbps: SHARED_POOL_MBPS,
          activeUsers: activeHotspot.length,
          currentSharedUsageMbps: mbpsFromBps(currentSharedBps),
          burstUsers: activeHotspot.filter((user: any) => burstProfiles.has(user.profile)).length,
          availablePoolMbps: Math.max(0, SHARED_POOL_MBPS - mbpsFromBps(currentSharedBps)),
          packageUtilization: Object.entries(packageUtilization).map(([profile, usage]) => ({
            profile,
            activeUsers: usage.activeUsers,
            bytesIn: usage.bytesIn,
            bytesOut: usage.bytesOut,
          })),
        },
        queueCount: queues.length,
        firewallRuleCount: firewallFilter.length,
        routeCount: routes.length,
        interfaces: runningIfaces.slice(0, 10).map((i: any) => ({
          name: i.name,
          type: i.type ?? "ether",
          rxByte: i.rxByte ? Number(i.rxByte) : 0,
          txByte: i.txByte ? Number(i.txByte) : 0,
        })),
      };
    } finally { await client.close(); }
  }),
});
