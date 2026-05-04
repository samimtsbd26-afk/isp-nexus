import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { routers } from "@isp-nexus/db";
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
    try {
      const users = await client.print("/ip/hotspot/user", { name: input.name });
      const user = users[0];
      if (user?.[".id"]) await client.remove("/ip/hotspot/user", user[".id"]);
      return { ok: true };
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

  getLiveStats: authedProcedure.input(routerIdInput).query(async ({ ctx, input }) => {
    const client = await getRouterClient(ctx.db, ctx.orgId, input.routerId);
    try {
      const [identity] = await client.print("/system/identity");
      const [resource] = await client.print("/system/resource");
      const interfaces = await client.print("/interface");
      const activePppoe = await client.print("/ppp/active");
      const activeHotspot = await client.print("/ip/hotspot/active");
      const queues = await client.print("/queue/simple");
      const firewallFilter = await client.print("/ip/firewall/filter");
      const routes = await client.print("/ip/route");

      const runningIfaces = interfaces.filter((i: any) => i.running === "true" || i.running === true);

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
