import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, isNull, desc } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { subscriptions, customers, packages, routers } from "@isp-nexus/db";
import { createSubscriptionSchema, packageActivationDurationSeconds } from "@isp-nexus/shared";
import { encryptText } from "../lib/crypto.js";
import { connectRouter, setMikroTikUserDisabled } from "../lib/mikrotik.js";
import { logActivity } from "../lib/activity.js";
import { logger } from "../lib/logger.js";

export const subscriptionRouter = router({
  list: authedProcedure
    .input(z.object({
      customerId: z.string().uuid().optional(),
      status: z.string().optional(),
      limit: z.number().default(100),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [eq(subscriptions.orgId, ctx.orgId), isNull(subscriptions.deletedAt)];
      if (input.customerId) conditions.push(eq(subscriptions.customerId, input.customerId));
      if (input.status) conditions.push(eq(subscriptions.status, input.status as any));
      const rows = await ctx.db.select({
        id: subscriptions.id, username: subscriptions.username, status: subscriptions.status,
        startedAt: subscriptions.startedAt, expiresAt: subscriptions.expiresAt,
        customerId: subscriptions.customerId, packageId: subscriptions.packageId,
        routerId: subscriptions.routerId, ipAddress: subscriptions.ipAddress,
        macAddress: subscriptions.macAddress, autoRenew: subscriptions.autoRenew,
        deletedAt: subscriptions.deletedAt,
        routerName: routers.name,
      }).from(subscriptions)
        .leftJoin(routers, eq(subscriptions.routerId, routers.id))
        .where(and(...conditions))
        .limit(input.limit).offset(input.offset);
      return rows;
    }),

  get: authedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [s] = await ctx.db.select().from(subscriptions)
      .where(and(eq(subscriptions.id, input.id), eq(subscriptions.orgId, ctx.orgId))).limit(1);
    if (!s) throw new TRPCError({ code: "NOT_FOUND" });
    const { passwordEncrypted: _, ...safe } = s;
    let router = null;
    if (s.routerId) {
      const [r] = await ctx.db.select({ id: routers.id, name: routers.name, host: routers.host }).from(routers)
        .where(eq(routers.id, s.routerId)).limit(1);
      router = r ?? null;
    }
    return { ...safe, router };
  }),

  create: adminProcedure.input(createSubscriptionSchema).mutation(async ({ ctx, input }) => {
    const [customer] = await ctx.db.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.orgId, ctx.orgId))).limit(1);
    if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
    const [pkg] = await ctx.db.select().from(packages)
      .where(and(eq(packages.id, input.packageId), eq(packages.orgId, ctx.orgId))).limit(1);
    if (!pkg) throw new TRPCError({ code: "NOT_FOUND", message: "Package not found" });
    const [r] = await ctx.db.select().from(routers)
      .where(and(eq(routers.id, input.routerId), eq(routers.orgId, ctx.orgId))).limit(1);
    if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Router not found" });

    const passwordEncrypted = encryptText(input.password);
    const activatedMs = packageActivationDurationSeconds(pkg) * 1000;
    const [s] = await ctx.db.insert(subscriptions).values({
      orgId: ctx.orgId, customerId: input.customerId, packageId: input.packageId,
      routerId: input.routerId, username: input.username, passwordEncrypted,
      ipAddress: input.ipAddress, macAddress: input.macAddress, notes: input.notes,
      expiresAt: new Date(Date.now() + activatedMs),
    }).returning();

    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "create", "subscription", s.id, { username: input.username, packageId: input.packageId });

    if (r && pkg) {
      let client;
      try {
        client = await connectRouter(r);
      } catch (decryptErr) {
        logger.warn({ err: decryptErr }, "Router password decrypt failed, skipping MikroTik provision");
        return s;
      }
      try {
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
      } catch (err) { /* MikroTik provision error — subscription still created */ }
      finally { await client.close().catch(() => {}); }
    }
    return s;
  }),

  suspend: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const [sub] = await ctx.db.select({ id: subscriptions.id, routerId: subscriptions.routerId, username: subscriptions.username })
      .from(subscriptions).where(and(eq(subscriptions.id, input.id), eq(subscriptions.orgId, ctx.orgId))).limit(1);
    if (!sub) throw new TRPCError({ code: "NOT_FOUND" });
    await ctx.db.update(subscriptions).set({ status: "suspended", updatedAt: new Date() })
      .where(and(eq(subscriptions.id, input.id), eq(subscriptions.orgId, ctx.orgId)));
    if (sub.routerId) {
      await setMikroTikUserDisabled(ctx.db, ctx.orgId, sub.routerId, sub.username, true).catch(() => {});
    }
    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "suspend", "subscription", input.id, {});
    return { ok: true };
  }),

  reactivate: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const [sub] = await ctx.db.select({ id: subscriptions.id, routerId: subscriptions.routerId, username: subscriptions.username })
      .from(subscriptions).where(and(eq(subscriptions.id, input.id), eq(subscriptions.orgId, ctx.orgId))).limit(1);
    if (!sub) throw new TRPCError({ code: "NOT_FOUND" });
    await ctx.db.update(subscriptions).set({ status: "active", updatedAt: new Date() })
      .where(and(eq(subscriptions.id, input.id), eq(subscriptions.orgId, ctx.orgId)));
    if (sub.routerId) {
      await setMikroTikUserDisabled(ctx.db, ctx.orgId, sub.routerId, sub.username, false).catch(() => {});
    }
    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "enable", "subscription", input.id, {});
    return { ok: true };
  }),

  cancel: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await ctx.db.update(subscriptions).set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(subscriptions.id, input.id), eq(subscriptions.orgId, ctx.orgId)));
    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "cancel", "subscription", input.id, {});
    return { ok: true };
  }),

  delete: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const [sub] = await ctx.db.select({ id: subscriptions.id, routerId: subscriptions.routerId, username: subscriptions.username })
      .from(subscriptions).where(and(eq(subscriptions.id, input.id), eq(subscriptions.orgId, ctx.orgId))).limit(1);
    if (!sub) throw new TRPCError({ code: "NOT_FOUND" });

    await ctx.db.update(subscriptions).set({
      deletedAt: new Date(),
      deletedBy: ctx.user?.id,
      status: "cancelled",
      updatedAt: new Date(),
    }).where(and(eq(subscriptions.id, input.id), eq(subscriptions.orgId, ctx.orgId)));

    if (sub.routerId) {
      await setMikroTikUserDisabled(ctx.db, ctx.orgId, sub.routerId, sub.username, true).catch(() => {});
    }

    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "delete", "subscription", input.id, {});
    return { ok: true };
  }),
});
