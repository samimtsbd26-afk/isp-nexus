import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { routers } from "@isp-nexus/db";
import { encryptText } from "../lib/crypto.js";
import { createRouterSchema } from "@isp-nexus/shared";
import { connectRouter } from "../lib/mikrotik.js";
import { logActivity } from "../lib/activity.js";
import { logger } from "../lib/logger.js";
import {
  buildFullProvisioningScript,
  buildBlockIpScript,
  buildUnblockIpScript,
  buildFirewallBaselineScript,
} from "../services/mikrotik/templates.js";
import type { PortPlan } from "../services/mikrotik/templates.js";

type FullPortPlan = PortPlan & {
  hotspotSubnet?: string;
  hotspotPool?: string;
  hotspotGateway?: string;
  pppoeLocalPool?: string;
  lanSubnet?: string;
  lanGateway?: string;
};
import { pushScriptViaApi, exportRouterConfig } from "../services/mikrotik/provisioning.js";
import { registerRouterNas, deregisterRouterNas } from "../services/radius/nas.js";
import { provisionRouterWireguardPeer, getPeerClientConf } from "../services/wireguard/provisioning.js";
import { env } from "../lib/env.js";

const PORT_PLAN_SCHEMA = z.object({
  wan: z.string().default("ether1"),
  hotspot: z.string().default("ether2"),
  pppoe: z.string().default("ether3"),
  lan: z.string().default("ether4"),
  admin: z.string().default("ether5"),
  hotspotSubnet: z.string().default("192.168.88.0/24"),
  hotspotPool: z.string().default("192.168.88.10-192.168.88.254"),
  hotspotGateway: z.string().default("192.168.88.1"),
  pppoeLocalPool: z.string().default("10.10.0.0/24"),
  lanSubnet: z.string().default("192.168.1.0/24"),
  lanGateway: z.string().default("192.168.1.1"),
});

export const routerMgmtRouter = router({

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  list: authedProcedure.query(async ({ ctx }) => {
    return ctx.db.select({
      id: routers.id, name: routers.name, host: routers.host, port: routers.port,
      useSsl: routers.useSsl, isDefault: routers.isDefault, isActive: routers.isActive,
      identity: routers.identity, model: routers.model, rosVersion: routers.rosVersion,
      cpuLoad: routers.cpuLoad, freeMemoryMb: routers.freeMemoryMb,
      temperatureCelsius: routers.temperatureCelsius, lastSeenAt: routers.lastSeenAt,
      wireguardPeerIp: routers.wireguardPeerIp,
      provisionStatus: routers.provisionStatus,
      provisionPushedAt: routers.provisionPushedAt,
      portPlan: routers.portPlan,
    }).from(routers).where(eq(routers.orgId, ctx.orgId));
  }),

  get: authedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [r] = await ctx.db.select().from(routers)
      .where(and(eq(routers.id, input.id), eq(routers.orgId, ctx.orgId))).limit(1);
    if (!r) throw new TRPCError({ code: "NOT_FOUND" });
    const { passwordEncrypted: _, ...safe } = r;
    return safe;
  }),

  create: adminProcedure.input(createRouterSchema).mutation(async ({ ctx, input }) => {
    const passwordEncrypted = encryptText(input.password);
    if (input.isDefault) {
      await ctx.db.update(routers).set({ isDefault: false }).where(eq(routers.orgId, ctx.orgId));
    }
    const [r] = await ctx.db.insert(routers).values({
      orgId: ctx.orgId, name: input.name, host: input.host,
      port: input.port, sslPort: input.sslPort, username: input.username,
      passwordEncrypted, useSsl: input.useSsl,
      wireguardPeerIp: input.wireguardPeerIp,
      isDefault: input.isDefault,
      provisionStatus: "pending",
    }).returning({ id: routers.id, name: routers.name, host: routers.host });
    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "create", "router", r.id, { host: input.host });
    return r;
  }),

  update: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().optional(), host: z.string().optional(),
      port: z.number().optional(), username: z.string().optional(),
      password: z.string().optional(), useSsl: z.boolean().optional(),
      isDefault: z.boolean().optional(), isActive: z.boolean().optional(),
      wireguardPeerIp: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, password, ...rest } = input;
      const data: Record<string, unknown> = { ...rest, updatedAt: new Date() };
      if (password) data.passwordEncrypted = encryptText(password);
      if (input.isDefault) {
        await ctx.db.update(routers).set({ isDefault: false }).where(eq(routers.orgId, ctx.orgId));
      }
      await ctx.db.update(routers).set(data)
        .where(and(eq(routers.id, id), eq(routers.orgId, ctx.orgId)));
      return { ok: true };
    }),

  delete: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const [r] = await ctx.db.select({ host: routers.host, wireguardPeerIp: routers.wireguardPeerIp })
      .from(routers).where(and(eq(routers.id, input.id), eq(routers.orgId, ctx.orgId))).limit(1);
    if (!r) throw new TRPCError({ code: "NOT_FOUND" });
    await ctx.db.delete(routers).where(and(eq(routers.id, input.id), eq(routers.orgId, ctx.orgId)));
    // Deregister from RADIUS NAS
    if (r.wireguardPeerIp) {
      await deregisterRouterNas(ctx.db, r.wireguardPeerIp).catch(() => {});
    }
    await deregisterRouterNas(ctx.db, r.host).catch(() => {});
    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "delete", "router", input.id, { host: r.host });
    return { ok: true };
  }),

  // ── Connection test ───────────────────────────────────────────────────────────

  testConnection: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const [r] = await ctx.db.select().from(routers)
      .where(and(eq(routers.id, input.id), eq(routers.orgId, ctx.orgId))).limit(1);
    if (!r) throw new TRPCError({ code: "NOT_FOUND" });
    try {
      const client = await connectRouter(r);
      const [identity] = await client.print("/system/identity");
      const [resource] = await client.print("/system/resource");
      await client.close();
      await ctx.db.update(routers).set({
        identity: identity?.name ?? null,
        model: resource?.boardName ?? null,
        rosVersion: resource?.version ?? null,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(routers.id, r.id));
      return { ok: true, identity: identity?.name ?? "unknown", model: resource?.boardName ?? null, version: resource?.version ?? null };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }),

  // ── Port plan ─────────────────────────────────────────────────────────────────

  updatePortPlan: adminProcedure
    .input(z.object({ id: z.string().uuid(), portPlan: PORT_PLAN_SCHEMA }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await ctx.db.select({ id: routers.id })
        .from(routers).where(and(eq(routers.id, input.id), eq(routers.orgId, ctx.orgId))).limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.update(routers).set({ portPlan: input.portPlan, updatedAt: new Date() })
        .where(eq(routers.id, input.id));
      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "update", "router_port_plan", input.id, {});
      return { ok: true };
    }),

  // ── Provisioning ─────────────────────────────────────────────────────────────

  previewProvisioningScript: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      portPlan: PORT_PLAN_SCHEMA.optional(),
      sharedPoolMbps: z.number().default(450),
    }))
    .query(async ({ ctx, input }) => {
      const [r] = await ctx.db.select().from(routers)
        .where(and(eq(routers.id, input.id), eq(routers.orgId, ctx.orgId))).limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND" });

      const portPlan = (input.portPlan ?? r.portPlan ?? {}) as FullPortPlan;
      if (!portPlan.wan) throw new TRPCError({ code: "BAD_REQUEST", message: "Port plan not configured. Set port plan first." });

      const script = buildFullProvisioningScript({
        routerName: r.name,
        ports: portPlan,
        ip: {
          hotspotSubnet: portPlan.hotspotSubnet ?? "192.168.88.0/24",
          hotspotPool: portPlan.hotspotPool ?? "192.168.88.10-192.168.88.254",
          hotspotGateway: portPlan.hotspotGateway ?? "192.168.88.1",
          pppoeLocalPool: portPlan.pppoeLocalPool ?? "10.10.0.0/24",
          lanSubnet: portPlan.lanSubnet ?? "192.168.1.0/24",
          lanGateway: portPlan.lanGateway ?? "192.168.1.1",
        },
        radius: {
          vpsIp: env.API_URL.replace(/^https?:\/\//, "").split(":")[0]!,
          secret: env.RADIUS_SECRET,
          authPort: env.RADIUS_AUTH_PORT,
          acctPort: env.RADIUS_ACCT_PORT,
        },
        hotspotDnsName: env.HOTSPOT_URL?.replace(/^https?:\/\//, "") ?? "hotspot.skynity.org",
        hotspotLoginUrl: env.HOTSPOT_URL ?? "https://hotspot.skynity.org",
      }, input.sharedPoolMbps);

      return { script, lines: script.split("\n").length };
    }),

  pushConfig: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      sharedPoolMbps: z.number().default(450),
    }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await ctx.db.select().from(routers)
        .where(and(eq(routers.id, input.id), eq(routers.orgId, ctx.orgId))).limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND" });

      const portPlan = r.portPlan as FullPortPlan | null;
      if (!portPlan?.wan) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Port plan not configured. Go to Port Plan tab first." });
      }

      await ctx.db.update(routers).set({ provisionStatus: "provisioning", updatedAt: new Date() })
        .where(eq(routers.id, r.id));

      let result: { ok: boolean; method: string; output: string; error?: string };
      try {
        const client = await connectRouter(r);
        const script = buildFullProvisioningScript({
          routerName: r.name,
          ports: portPlan,
          ip: {
            hotspotSubnet: portPlan.hotspotSubnet ?? "192.168.88.0/24",
            hotspotPool: portPlan.hotspotPool ?? "192.168.88.10-192.168.88.254",
            hotspotGateway: portPlan.hotspotGateway ?? "192.168.88.1",
            pppoeLocalPool: portPlan.pppoeLocalPool ?? "10.10.0.0/24",
            lanSubnet: portPlan.lanSubnet ?? "192.168.1.0/24",
            lanGateway: portPlan.lanGateway ?? "192.168.1.1",
          },
          radius: {
            vpsIp: env.API_URL.replace(/^https?:\/\//, "").split(":")[0]!,
            secret: env.RADIUS_SECRET,
            authPort: env.RADIUS_AUTH_PORT,
            acctPort: env.RADIUS_ACCT_PORT,
          },
          hotspotDnsName: env.HOTSPOT_URL?.replace(/^https?:\/\//, "") ?? "hotspot.skynity.org",
          hotspotLoginUrl: env.HOTSPOT_URL ?? "https://hotspot.skynity.org",
        }, input.sharedPoolMbps);

        result = await pushScriptViaApi(client, script);
        await client.close();
      } catch (err: any) {
        await ctx.db.update(routers).set({
          provisionStatus: "error",
          provisionError: err.message,
          updatedAt: new Date(),
        }).where(eq(routers.id, r.id));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }

      const newStatus = result.ok ? "provisioned" : "error";
      await ctx.db.update(routers).set({
        provisionStatus: newStatus,
        provisionError: result.ok ? null : result.output,
        provisionPushedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(routers.id, r.id));

      // Auto-register in RADIUS NAS after successful provision
      if (result.ok) {
        const nasIp = r.wireguardPeerIp ?? r.host;
        await registerRouterNas(ctx.db, {
          nasname: nasIp,
          shortname: r.name.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 30),
          description: `MikroTik: ${r.name} (${r.host})`,
        }).catch((e) => logger.warn({ e }, "NAS registration failed — continue"));
      }

      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "exec", "router_provision", r.id, {
        ok: result.ok,
        method: result.method,
      });

      return { ok: result.ok, method: result.method, output: result.output };
    }),

  // ── Backup / Export ───────────────────────────────────────────────────────────

  exportBackup: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await ctx.db.select().from(routers)
        .where(and(eq(routers.id, input.id), eq(routers.orgId, ctx.orgId))).limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND" });
      try {
        const client = await connectRouter(r);
        const config = await exportRouterConfig(client);
        await client.close();
        await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "exec", "router_export", r.id, {});
        return { config, exportedAt: new Date().toISOString() };
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  // ── IP block / unblock ───────────────────────────────────────────────────────

  blockIp: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      ip: z.string().ip(),
      reason: z.string().default("Blocked by admin"),
    }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await ctx.db.select().from(routers)
        .where(and(eq(routers.id, input.id), eq(routers.orgId, ctx.orgId))).limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND" });

      const comment = `ISP-BLOCK:${input.ip}`;
      const script = buildBlockIpScript(input.ip, comment);
      const client = await connectRouter(r);
      try {
        await pushScriptViaApi(client, script);
        await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "exec", "ip_block", r.id, { ip: input.ip });
        return { ok: true };
      } finally { await client.close(); }
    }),

  unblockIp: adminProcedure
    .input(z.object({ id: z.string().uuid(), ip: z.string().ip() }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await ctx.db.select().from(routers)
        .where(and(eq(routers.id, input.id), eq(routers.orgId, ctx.orgId))).limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND" });

      const comment = `ISP-BLOCK:${input.ip}`;
      const script = buildUnblockIpScript(comment);
      const client = await connectRouter(r);
      try {
        await pushScriptViaApi(client, script);
        await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "exec", "ip_unblock", r.id, { ip: input.ip });
        return { ok: true };
      } finally { await client.close(); }
    }),

  // ── VPN (WireGuard interface) toggle ─────────────────────────────────────────

  toggleVpn: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      wgInterface: z.string().default("wg0"),
      enable: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await ctx.db.select().from(routers)
        .where(and(eq(routers.id, input.id), eq(routers.orgId, ctx.orgId))).limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND" });

      const action = input.enable ? "disabled=no" : "disabled=yes";
      const script = `/interface wireguard set [find name="${input.wgInterface}"] ${action}`;
      const client = await connectRouter(r);
      try {
        await pushScriptViaApi(client, script);
        await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "exec", "vpn_toggle", r.id, { enable: input.enable });
        return { ok: true };
      } finally { await client.close(); }
    }),

  // ── Firewall sync (push baseline rules) ──────────────────────────────────────

  syncFirewall: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await ctx.db.select().from(routers)
        .where(and(eq(routers.id, input.id), eq(routers.orgId, ctx.orgId))).limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND" });

      const portPlan = r.portPlan as FullPortPlan | null;
      if (!portPlan?.wan) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Port plan required before firewall sync." });
      }

      const script = buildFirewallBaselineScript(portPlan);
      const client = await connectRouter(r);
      try {
        const result = await pushScriptViaApi(client, script);
        await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "exec", "firewall_sync", r.id, { ok: result.ok });
        return { ok: result.ok, output: result.output };
      } finally { await client.close(); }
    }),

  // ── WireGuard peer provisioning for this router ───────────────────────────────

  provisionWgPeer: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      peerIp: z.string().default("10.100.0.2"),
      vpsPublicIp: z.string().ip(),
      vpsServerPublicKey: z.string().optional(),
      label: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await ctx.db.select({ id: routers.id, name: routers.name })
        .from(routers).where(and(eq(routers.id, input.id), eq(routers.orgId, ctx.orgId))).limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND" });

      const result = await provisionRouterWireguardPeer(ctx.db, ctx.orgId, r.id, {
        label: input.label ?? r.name,
        wgInterface: env.WG_INTERFACE,
        peerIp: input.peerIp,
        vpsWgIp: env.WG_SERVER_IP.split("/")[0]!,
        vpsPublicIp: input.vpsPublicIp,
        vpsWgPort: env.WG_LISTEN_PORT,
        vpsServerPublicKey: input.vpsServerPublicKey,
      });

      // Update router with WireGuard peer IP
      await ctx.db.update(routers).set({ wireguardPeerIp: input.peerIp, updatedAt: new Date() })
        .where(eq(routers.id, r.id));

      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "create", "wg_peer", r.id, { peerIp: input.peerIp });

      return {
        peerId: result.peerId,
        publicKey: result.publicKey,
        allowedAddress: result.allowedAddress,
        clientConf: result.clientConf,
        vpsScript: result.routerScript,
      };
    }),

  getWgPeerConf: adminProcedure
    .input(z.object({ peerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const conf = await getPeerClientConf(ctx.db, input.peerId);
      if (!conf) throw new TRPCError({ code: "NOT_FOUND", message: "Peer not found or has no private key" });
      return { conf };
    }),
});
