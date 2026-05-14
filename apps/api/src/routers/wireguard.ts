import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { wireguardPeers, routers } from "@isp-nexus/db";
import { connectRouter } from "../lib/mikrotik.js";
import { encryptText, decryptText } from "../lib/crypto.js";
import { logActivity } from "../lib/activity.js";
import { logger } from "../lib/logger.js";
import { generateKeyPair, generatePresharedKey, buildClientConfig } from "../services/wireguard/keys.js";

export const wireguardRouter = router({

  listPeers: authedProcedure
    .input(z.object({ routerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [r] = await ctx.db.select({ id: routers.id }).from(routers)
        .where(and(eq(routers.id, input.routerId), eq(routers.orgId, ctx.orgId))).limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Router not found" });

      const peers = await ctx.db.select({
        id: wireguardPeers.id,
        label: wireguardPeers.label,
        interface: wireguardPeers.interface,
        publicKey: wireguardPeers.publicKey,
        allowedAddress: wireguardPeers.allowedAddress,
        allowedIps: wireguardPeers.allowedIps,
        endpointAddress: wireguardPeers.endpointAddress,
        endpointPort: wireguardPeers.endpointPort,
        persistentKeepalive: wireguardPeers.persistentKeepalive,
        lastHandshakeAt: wireguardPeers.lastHandshakeAt,
        rxBytes: wireguardPeers.rxBytes,
        txBytes: wireguardPeers.txBytes,
        comment: wireguardPeers.comment,
        disabled: wireguardPeers.disabled,
        isActive: wireguardPeers.isActive,
        hasPrivateKey: wireguardPeers.privateKeyEnc,
        updatedAt: wireguardPeers.updatedAt,
      }).from(wireguardPeers)
        .where(eq(wireguardPeers.routerId, input.routerId));

      return peers.map((p) => ({ ...p, hasPrivateKey: p.hasPrivateKey != null }));
    }),

  addPeer: adminProcedure
    .input(z.object({
      routerId: z.string().uuid(),
      interface: z.string().default("wg0"),
      allowedAddress: z.string().min(1),
      label: z.string().optional(),
      comment: z.string().optional(),
      persistentKeepalive: z.number().int().default(25),
      withPresharedKey: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await ctx.db.select().from(routers)
        .where(and(eq(routers.id, input.routerId), eq(routers.orgId, ctx.orgId))).limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Router not found" });

      const { privateKey, publicKey } = generateKeyPair();
      const presharedKey = input.withPresharedKey ? generatePresharedKey() : undefined;

      let mikrotikId: string | undefined;
      let client;
      try {
        client = await connectRouter(r);
        const addParams: Record<string, string> = {
          interface: input.interface,
          "public-key": publicKey,
          "allowed-address": input.allowedAddress,
          "persistent-keepalive": String(input.persistentKeepalive),
        };
        if (presharedKey) addParams["preshared-key"] = presharedKey;
        if (input.comment) addParams.comment = input.comment;

        const result = await client.add("/interface/wireguard/peers", addParams);
        mikrotikId = typeof result === "string" ? result : (result as any)?.[".id"] ?? undefined;
      } catch (err) {
        logger.warn({ err, routerId: r.id }, "WireGuard peer push to MikroTik failed — saving to DB only");
      } finally {
        await client?.close().catch(() => {});
      }

      const [saved] = await ctx.db.insert(wireguardPeers).values({
        routerId: input.routerId,
        mikrotikId: mikrotikId ?? null,
        interface: input.interface,
        publicKey,
        privateKeyEnc: encryptText(privateKey),
        presharedKeyEnc: presharedKey ? encryptText(presharedKey) : null,
        serverPublicKey: null,
        label: input.label ?? null,
        allowedAddress: input.allowedAddress,
        persistentKeepalive: input.persistentKeepalive,
        comment: input.comment ?? null,
      }).returning({ id: wireguardPeers.id });

      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "create", "wireguard_peer", saved.id, {
        interface: input.interface,
        allowedAddress: input.allowedAddress,
      });

      // Return private key and preshared key ONE TIME — admin must copy and give to client
      return {
        id: saved.id,
        publicKey,
        privateKey,
        presharedKey: presharedKey ?? null,
        allowedAddress: input.allowedAddress,
      };
    }),

  removePeer: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [peer] = await ctx.db.select().from(wireguardPeers)
        .where(eq(wireguardPeers.id, input.id)).limit(1);
      if (!peer) throw new TRPCError({ code: "NOT_FOUND" });

      const [r] = await ctx.db.select().from(routers)
        .where(and(eq(routers.id, peer.routerId), eq(routers.orgId, ctx.orgId))).limit(1);
      if (!r) throw new TRPCError({ code: "FORBIDDEN" });

      if (peer.mikrotikId) {
        let client;
        try {
          client = await connectRouter(r);
          await client.exec("/interface/wireguard/peers", "remove", { numbers: peer.mikrotikId });
        } catch (err) {
          logger.warn({ err, peerId: peer.id }, "WireGuard peer remove from MikroTik failed");
        } finally {
          await client?.close().catch(() => {});
        }
      }

      await ctx.db.delete(wireguardPeers).where(eq(wireguardPeers.id, input.id));
      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "delete", "wireguard_peer", input.id, {});
      return { ok: true };
    }),

  exportClientConfig: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      serverEndpoint: z.string().min(1),
      dns: z.string().optional(),
      allowedIps: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [peer] = await ctx.db.select().from(wireguardPeers)
        .where(eq(wireguardPeers.id, input.id)).limit(1);
      if (!peer) throw new TRPCError({ code: "NOT_FOUND" });

      const [r] = await ctx.db.select({ id: routers.id }).from(routers)
        .where(and(eq(routers.id, peer.routerId), eq(routers.orgId, ctx.orgId))).limit(1);
      if (!r) throw new TRPCError({ code: "FORBIDDEN" });

      if (!peer.privateKeyEnc) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No private key stored for this peer. It may have been created externally.",
        });
      }

      const privateKey = decryptText(peer.privateKeyEnc);
      const presharedKey = peer.presharedKeyEnc ? decryptText(peer.presharedKeyEnc) : undefined;

      const config = buildClientConfig({
        clientPrivateKey: privateKey,
        clientAddress: peer.allowedAddress ?? "",
        serverPublicKey: peer.serverPublicKey ?? "[SET_SERVER_PUBLIC_KEY]",
        serverEndpoint: input.serverEndpoint,
        presharedKey,
        dns: input.dns,
        allowedIps: input.allowedIps,
        persistentKeepalive: peer.persistentKeepalive ?? 25,
      });

      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "export", "wireguard_peer", input.id, {});
      return { config, filename: `wg-${peer.label ?? peer.id.slice(0, 8)}.conf` };
    }),

  syncPeers: adminProcedure
    .input(z.object({ routerId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await ctx.db.select().from(routers)
        .where(and(eq(routers.id, input.routerId), eq(routers.orgId, ctx.orgId))).limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND" });

      let client;
      try {
        client = await connectRouter(r);
        const peers = await client.print("/interface/wireguard/peers");
        let synced = 0;
        for (const p of peers) {
          const mikrotikId = p[".id"] ?? p.id;
          const pubKey = p["public-key"] ?? p.publicKey;
          if (!pubKey) continue;

          await ctx.db.insert(wireguardPeers).values({
            routerId: r.id,
            mikrotikId,
            interface: p.interface ?? "wg0",
            publicKey: pubKey,
            allowedAddress: p["allowed-address"] ?? p.allowedAddress ?? "",
            allowedIps: p["allowed-ips"] ?? p.allowedIps ?? null,
            endpointAddress: p["endpoint-address"] ?? p.endpointAddress ?? null,
            endpointPort: p["endpoint-port"] ? Number(p["endpoint-port"]) : null,
            persistentKeepalive: p["persistent-keepalive"] ? Number(p["persistent-keepalive"]) : 25,
            comment: p.comment ?? null,
            disabled: p.disabled === "true" || p.disabled === true,
          }).onConflictDoUpdate({
            target: [wireguardPeers.routerId, wireguardPeers.publicKey],
            set: {
              mikrotikId,
              allowedAddress: p["allowed-address"] ?? p.allowedAddress ?? "",
              disabled: p.disabled === "true" || p.disabled === true,
              updatedAt: new Date(),
            },
          });
          synced++;
        }
        await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "sync", "wireguard_peers", r.id, { synced });
        return { synced };
      } finally {
        await client?.close().catch(() => {});
      }
    }),

  generatePresharedKey: adminProcedure.mutation(async () => {
    return { key: generatePresharedKey() };
  }),
});
