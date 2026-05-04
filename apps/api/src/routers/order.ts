import { z } from "zod";
import { randomBytes } from "crypto";
import { TRPCError } from "@trpc/server";
import { eq, and, desc } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { orders, invoices, subscriptions, customers, packages, routers, telegramConfigs } from "@isp-nexus/db";
import { encryptText, decryptText } from "../lib/crypto.js";
import { getMikroTikClient } from "../services/mikrotik/client.js";
import { logger } from "../lib/logger.js";
import { sendApprovalNotification } from "../services/telegram/bot.js";
import { generateInvoicePdf } from "../services/billing/invoice.js";
import { ensureHotspotProfile, syncHotspotRadiusUser } from "../services/hotspot/provisioning.js";

export const orderRouter = router({
  list: adminProcedure
    .input(z.object({ status: z.string().optional(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(orders).where(eq(orders.orgId, ctx.orgId))
        .orderBy(desc(orders.createdAt)).limit(input.limit);
    }),

  listPending: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(orders)
      .where(and(eq(orders.orgId, ctx.orgId), eq(orders.status, "pending")))
      .orderBy(desc(orders.createdAt));
  }),

  get: adminProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [o] = await ctx.db.select().from(orders)
      .where(and(eq(orders.id, input.id), eq(orders.orgId, ctx.orgId))).limit(1);
    if (!o) throw new TRPCError({ code: "NOT_FOUND" });
    return o;
  }),

  approve: adminProcedure
    .input(z.object({ id: z.string().uuid(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [o] = await ctx.db.select().from(orders)
        .where(and(eq(orders.id, input.id), eq(orders.orgId, ctx.orgId))).limit(1);
      if (!o) throw new TRPCError({ code: "NOT_FOUND" });
      if (o.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Order already processed" });
      if (!o.packageId) throw new TRPCError({ code: "BAD_REQUEST", message: "Order package is missing" });
      const packageId = o.packageId;
      const [orderPkg] = await ctx.db.select().from(packages)
        .where(and(eq(packages.id, packageId), eq(packages.orgId, ctx.orgId), eq(packages.isActive, true))).limit(1);
      if (!orderPkg) throw new TRPCError({ code: "NOT_FOUND", message: "Package not found" });
      if (o.amountBdt !== orderPkg.priceBdt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Order amount does not match package price" });
      }

      if (!o.subscriptionId) {
        const [customer] = await ctx.db.select().from(customers)
          .where(and(eq(customers.id, o.customerId), eq(customers.orgId, ctx.orgId))).limit(1);
        const [pkg] = await ctx.db.select().from(packages)
          .where(and(eq(packages.id, packageId), eq(packages.orgId, ctx.orgId), eq(packages.isActive, true))).limit(1);
        const [r] = await ctx.db.select().from(routers)
          .where(and(eq(routers.orgId, ctx.orgId), eq(routers.isDefault, true), eq(routers.isActive, true))).limit(1);

        if (!customer?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Customer is inactive" });

        if (pkg) {
          const validityDays = pkg.validityDays ?? 30;
          const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);
          const subPassword = randomBytes(9).toString("base64url");
          const passwordEncrypted = encryptText(subPassword);
          const username = customer.phone;

          if (pkg.type !== "static") {
            if (!r) throw new TRPCError({ code: "BAD_REQUEST", message: "Active default router not found" });
            const port = r.useSsl ? (r.sslPort ?? 8729) : r.port;
            const password = decryptText(r.passwordEncrypted);
            let client: Awaited<ReturnType<typeof getMikroTikClient>> | null = null;
            try {
              client = await getMikroTikClient({ host: r.host, port, username: r.username, password, useSsl: r.useSsl });
              if (pkg.type === "pppoe") {
                await client.add("/ppp/secret", {
                  name: username, password: subPassword,
                  service: "pppoe", profile: pkg.mikrotikProfileName ?? "default",
                });
              } else {
                const profile = pkg.mikrotikProfileName ?? "default";
                await ensureHotspotProfile(client, profile, pkg);
                await client.add("/ip/hotspot/user", {
                  name: username, password: subPassword,
                  profile,
                });
                await syncHotspotRadiusUser(ctx.db, username, subPassword, pkg, validityDays * 24 * 60 * 60);
              }
            } catch (err) {
              logger.error({ err }, "MikroTik provision error in order approval");
              throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Router provisioning failed" });
            } finally {
              await client?.close().catch((err) => logger.warn({ err }, "MikroTik client close failed in order approval"));
            }
          }

          const [sub] = await ctx.db.insert(subscriptions).values({
            orgId: ctx.orgId, customerId: customer.id, packageId: pkg.id,
            routerId: r?.id ?? null, username, passwordEncrypted,
            expiresAt, status: "active",
          }).returning();

          await ctx.db.update(orders).set({ subscriptionId: sub.id, updatedAt: new Date() }).where(eq(orders.id, o.id));
        }
      } else {
        const [subscription] = await ctx.db.select({ id: subscriptions.id }).from(subscriptions)
          .where(and(eq(subscriptions.id, o.subscriptionId), eq(subscriptions.orgId, ctx.orgId))).limit(1);
        if (!subscription) throw new TRPCError({ code: "NOT_FOUND", message: "Subscription not found" });
        await ctx.db.update(subscriptions).set({ status: "active", updatedAt: new Date() })
          .where(and(eq(subscriptions.id, o.subscriptionId), eq(subscriptions.orgId, ctx.orgId)));
      }

      await ctx.db.update(orders).set({
        status: "approved", reviewedBy: ctx.user.id,
        reviewedAt: new Date(), reviewNote: input.note, updatedAt: new Date(),
      }).where(and(eq(orders.id, o.id), eq(orders.orgId, ctx.orgId)));

      const invoiceNum = `INV-${Date.now()}`;
      const [inv] = await ctx.db.insert(invoices).values({
        orgId: ctx.orgId, orderId: o.id, invoiceNumber: invoiceNum,
        customerId: o.customerId, amountBdt: o.amountBdt,
        taxBdt: 0, totalBdt: o.amountBdt, paidAt: new Date(),
      }).returning();

      const [customer] = await ctx.db.select().from(customers)
        .where(and(eq(customers.id, o.customerId), eq(customers.orgId, ctx.orgId))).limit(1);
      const [pkg] = await ctx.db.select().from(packages)
        .where(and(eq(packages.id, packageId), eq(packages.orgId, ctx.orgId))).limit(1);
      const [tgConfig] = await ctx.db.select().from(telegramConfigs)
        .where(eq(telegramConfigs.orgId, ctx.orgId)).limit(1);
      if (tgConfig && customer && pkg) {
        await sendApprovalNotification(tgConfig.chatId, customer, pkg);
      }

      return { ok: true, invoiceId: inv.id };
    }),

  reject: adminProcedure
    .input(z.object({ id: z.string().uuid(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(orders).set({
        status: "rejected", reviewedBy: ctx.user.id,
        reviewedAt: new Date(), reviewNote: input.note, updatedAt: new Date(),
      }).where(and(eq(orders.id, input.id), eq(orders.orgId, ctx.orgId)));
      return { ok: true };
    }),

  refund: adminProcedure
    .input(z.object({ id: z.string().uuid(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(orders).set({
        status: "refunded", reviewedBy: ctx.user.id,
        reviewedAt: new Date(), reviewNote: input.note, updatedAt: new Date(),
      }).where(and(eq(orders.id, input.id), eq(orders.orgId, ctx.orgId)));
      return { ok: true };
    }),
});
