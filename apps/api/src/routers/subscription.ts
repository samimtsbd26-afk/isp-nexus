import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { subscriptions, customers, packages, routers } from "@isp-nexus/db";
import { createSubscriptionSchema } from "@isp-nexus/shared";
import { encryptText, decryptText } from "../lib/crypto.js";
import { getMikroTikClient } from "../services/mikrotik/client.js";

export const subscriptionRouter = router({
  list: authedProcedure
    .input(z.object({ customerId: z.string().uuid().optional(), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select({
        id: subscriptions.id, username: subscriptions.username, status: subscriptions.status,
        startedAt: subscriptions.startedAt, expiresAt: subscriptions.expiresAt,
        customerId: subscriptions.customerId, packageId: subscriptions.packageId,
        routerId: subscriptions.routerId, ipAddress: subscriptions.ipAddress,
        autoRenew: subscriptions.autoRenew,
      }).from(subscriptions).where(eq(subscriptions.orgId, ctx.orgId));
    }),

  get: authedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [s] = await ctx.db.select().from(subscriptions)
      .where(and(eq(subscriptions.id, input.id), eq(subscriptions.orgId, ctx.orgId))).limit(1);
    if (!s) throw new TRPCError({ code: "NOT_FOUND" });
    const { passwordEncrypted: _, ...safe } = s;
    return safe;
  }),

  create: adminProcedure.input(createSubscriptionSchema).mutation(async ({ ctx, input }) => {
    const passwordEncrypted = encryptText(input.password);
    const [s] = await ctx.db.insert(subscriptions).values({
      orgId: ctx.orgId, customerId: input.customerId, packageId: input.packageId,
      routerId: input.routerId, username: input.username, passwordEncrypted,
      ipAddress: input.ipAddress, macAddress: input.macAddress, notes: input.notes,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).returning();

    const [pkg] = await ctx.db.select().from(packages).where(eq(packages.id, input.packageId)).limit(1);
    const [r] = await ctx.db.select().from(routers).where(eq(routers.id, input.routerId)).limit(1);
    if (r && pkg) {
      const password = decryptText(r.passwordEncrypted);
      try {
        const client = await getMikroTikClient({ host: r.host, port: r.port, username: r.username, password, useSsl: r.useSsl });
        if (pkg.type === "pppoe") {
          const addData: Record<string, string> = {
            name: input.username, password: input.password,
            service: "pppoe", profile: pkg.mikrotikProfileName ?? "default",
          };
          if (input.ipAddress) addData["remote-address"] = input.ipAddress;
          await client.add("/ppp/secret", addData);
        } else {
          await client.add("/ip/hotspot/user", {
            name: input.username, password: input.password,
            profile: pkg.mikrotikProfileName ?? "default",
          });
        }
        await client.close();
      } catch (err) { /* MikroTik provision error — subscription still created */ }
    }
    return s;
  }),

  suspend: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await ctx.db.update(subscriptions).set({ status: "suspended", updatedAt: new Date() })
      .where(and(eq(subscriptions.id, input.id), eq(subscriptions.orgId, ctx.orgId)));
    return { ok: true };
  }),

  reactivate: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await ctx.db.update(subscriptions).set({ status: "active", updatedAt: new Date() })
      .where(and(eq(subscriptions.id, input.id), eq(subscriptions.orgId, ctx.orgId)));
    return { ok: true };
  }),

  cancel: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await ctx.db.update(subscriptions).set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(subscriptions.id, input.id), eq(subscriptions.orgId, ctx.orgId)));
    return { ok: true };
  }),
});
