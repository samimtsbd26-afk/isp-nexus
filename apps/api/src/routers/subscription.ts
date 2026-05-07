import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, isNull } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { subscriptions, customers, packages, routers } from "@isp-nexus/db";
import { createSubscriptionSchema } from "@isp-nexus/shared";
import { encryptText, decryptText } from "../lib/crypto.js";
import { getMikroTikClient } from "../services/mikrotik/client.js";
import { logActivity } from "../lib/activity.js";

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
      return ctx.db.select({
        id: subscriptions.id, username: subscriptions.username, status: subscriptions.status,
        startedAt: subscriptions.startedAt, expiresAt: subscriptions.expiresAt,
        customerId: subscriptions.customerId, packageId: subscriptions.packageId,
        routerId: subscriptions.routerId, ipAddress: subscriptions.ipAddress,
        autoRenew: subscriptions.autoRenew, deletedAt: subscriptions.deletedAt,
      }).from(subscriptions).where(and(...conditions)).limit(input.limit).offset(input.offset);
    }),

  get: authedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [s] = await ctx.db.select().from(subscriptions)
      .where(and(eq(subscriptions.id, input.id), eq(subscriptions.orgId, ctx.orgId))).limit(1);
    if (!s) throw new TRPCError({ code: "NOT_FOUND" });
    const { passwordEncrypted: _, ...safe } = s;
    return safe;
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
    const [s] = await ctx.db.insert(subscriptions).values({
      orgId: ctx.orgId, customerId: input.customerId, packageId: input.packageId,
      routerId: input.routerId, username: input.username, passwordEncrypted,
      ipAddress: input.ipAddress, macAddress: input.macAddress, notes: input.notes,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).returning();

    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "create", "subscription", s.id, { username: input.username, packageId: input.packageId });

    if (r && pkg) {
      let password: string;
      try {
        password = decryptText(r.passwordEncrypted);
      } catch (decryptErr) {
        console.warn("Router password decrypt failed, skipping MikroTik provision", decryptErr);
        return s;
      }
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
    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "suspend", "subscription", input.id, {});
    return { ok: true };
  }),

  reactivate: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await ctx.db.update(subscriptions).set({ status: "active", updatedAt: new Date() })
      .where(and(eq(subscriptions.id, input.id), eq(subscriptions.orgId, ctx.orgId)));
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
    const [sub] = await ctx.db.select({ id: subscriptions.id }).from(subscriptions)
      .where(and(eq(subscriptions.id, input.id), eq(subscriptions.orgId, ctx.orgId))).limit(1);
    if (!sub) throw new TRPCError({ code: "NOT_FOUND" });
    
    // Soft delete only
    await ctx.db.update(subscriptions).set({
      deletedAt: new Date(),
      deletedBy: ctx.user?.id,
      status: "cancelled",
      updatedAt: new Date(),
    }).where(and(eq(subscriptions.id, input.id), eq(subscriptions.orgId, ctx.orgId)));
    
    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "delete", "subscription", input.id, {});
    return { ok: true };
  }),
});
