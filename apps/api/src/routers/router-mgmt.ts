import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { routers } from "@isp-nexus/db";
import { encryptText, decryptText } from "../lib/crypto.js";
import { createRouterSchema } from "@isp-nexus/shared";
import { getMikroTikClient } from "../services/mikrotik/client.js";

export const routerMgmtRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    const result = await ctx.db.select({
      id: routers.id, name: routers.name, host: routers.host, port: routers.port,
      useSsl: routers.useSsl, isDefault: routers.isDefault, isActive: routers.isActive,
      identity: routers.identity, model: routers.model, rosVersion: routers.rosVersion,
      cpuLoad: routers.cpuLoad, freeMemoryMb: routers.freeMemoryMb,
      temperatureCelsius: routers.temperatureCelsius, lastSeenAt: routers.lastSeenAt,
      wireguardPeerIp: routers.wireguardPeerIp,
    }).from(routers).where(eq(routers.orgId, ctx.orgId));
    return result;
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
    }).returning({ id: routers.id, name: routers.name, host: routers.host });
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
      await ctx.db.update(routers).set(data).where(and(eq(routers.id, id), eq(routers.orgId, ctx.orgId)));
      return { ok: true };
    }),

  delete: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(routers).where(and(eq(routers.id, input.id), eq(routers.orgId, ctx.orgId)));
    return { ok: true };
  }),

  testConnection: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const [r] = await ctx.db.select().from(routers)
      .where(and(eq(routers.id, input.id), eq(routers.orgId, ctx.orgId))).limit(1);
    if (!r) throw new TRPCError({ code: "NOT_FOUND" });
    const password = decryptText(r.passwordEncrypted);
    const port = r.useSsl ? (r.sslPort ?? 8729) : r.port;
    try {
      const client = await getMikroTikClient({ host: r.host, port, username: r.username, password, useSsl: r.useSsl });
      const identity = await client.print("/system/identity");
      await client.close();
      return { ok: true, identity: identity[0]?.name ?? "unknown" };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }),
});
