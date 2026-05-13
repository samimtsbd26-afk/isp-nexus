import { z } from "zod";
import { randomBytes } from "crypto";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, sql } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { orders, invoices, subscriptions, customers, packages, routers, telegramConfigs } from "@isp-nexus/db";
import { encryptText, decryptText } from "../lib/crypto.js";
import { connectRouter, type MikroTikApi } from "../lib/mikrotik.js";
import { logger } from "../lib/logger.js";
import { sendApprovalNotification } from "../services/telegram/bot.js";
import { nextInvoiceNumber, generateInvoicePdf } from "../services/billing/invoice.js";
import { ensureHotspotProfile, syncHotspotRadiusUser, syncHotspotDbUser } from "../services/hotspot/provisioning.js";
import { sendPaymentSuccessSms } from "../services/sms/index.js";
import { emitOrgEvent, emitCustomerEvent } from "../boot.js";
import { logActivity } from "../lib/activity.js";
import { hotspotPlanComment, packageActivationDurationSeconds, packageLimitUptimeHours } from "@isp-nexus/shared";

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

  trialRequests: adminProcedure
    .input(z.object({ limit: z.number().default(100) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select({
        id: orders.id,
        status: orders.status,
        mac: orders.paymentFrom,
        ip: orders.trxId,
        meta: orders.screenshotUrl,
        createdAt: orders.createdAt,
        reviewedAt: orders.reviewedAt,
        customerName: customers.fullName,
        customerPhone: customers.phone,
        packageName: packages.name,
        packageId: orders.packageId,
      })
      .from(orders)
      .innerJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(packages, eq(orders.packageId, packages.id))
      .where(and(eq(orders.orgId, ctx.orgId), eq(orders.paymentMethod, "free")))
      .orderBy(desc(orders.createdAt))
      .limit(input.limit);
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
      if (!o.packageId) throw new TRPCError({ code: "BAD_REQUEST", message: "প্যাকেজ প্রোফাইল পাওয়া যায়নি" });
      const packageId = o.packageId;
      const [pkg] = await ctx.db.select().from(packages)
        .where(and(eq(packages.id, packageId), eq(packages.orgId, ctx.orgId), eq(packages.isActive, true))).limit(1);
      if (!pkg) throw new TRPCError({ code: "NOT_FOUND", message: "প্যাকেজ প্রোফাইল পাওয়া যায়নি" });
      if (o.amountBdt !== pkg.priceBdt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Order amount does not match package price" });
      }

      if (!o.subscriptionId) {
        const [customer] = await ctx.db.select().from(customers)
          .where(and(eq(customers.id, o.customerId), eq(customers.orgId, ctx.orgId))).limit(1);
        const [r] = await ctx.db.select().from(routers)
          .where(and(eq(routers.orgId, ctx.orgId), eq(routers.isDefault, true), eq(routers.isActive, true))).limit(1);

        if (!customer?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Customer is inactive" });

        const trialSeconds = packageActivationDurationSeconds(pkg);
        const trialHours = packageLimitUptimeHours(pkg);
        const expiresAt = new Date(Date.now() + trialSeconds * 1000);
        const planComment = hotspotPlanComment(pkg);
        // For free trial orders, reuse the registration password stored in order metadata.
        // New orders use registrationMeta; old orders (pre-migration) fall back to screenshotUrl.
        let subPassword: string;
        let passwordEncrypted: string;
        const rawMeta = o.registrationMeta ?? o.screenshotUrl;
        if (o.paymentMethod === "free" && rawMeta) {
          try {
            const meta = JSON.parse(rawMeta) as { ep?: string };
            if (typeof meta.ep === "string" && meta.ep.split(":").length === 3) {
              passwordEncrypted = meta.ep;
              subPassword = decryptText(meta.ep);
            } else { throw new Error("invalid ep"); }
          } catch {
            subPassword = randomBytes(9).toString("base64url");
            passwordEncrypted = encryptText(subPassword);
          }
        } else {
          subPassword = randomBytes(9).toString("base64url");
          passwordEncrypted = encryptText(subPassword);
        }
        const username = customer.phone;

        if (pkg.type !== "static") {
          if (!r) throw new TRPCError({ code: "BAD_REQUEST", message: "Active default router not found" });
          if (pkg.type === "hotspot" && !pkg.mikrotikProfileName) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Router profile sync নেই" });
          }
          let client: MikroTikApi | null = null;
          try {
            client = await connectRouter(r);
            if (pkg.type === "pppoe") {
              await client.add("/ppp/secret", {
                name: username, password: subPassword,
                service: "pppoe", profile: pkg.mikrotikProfileName ?? "default",
              });
            } else {
              const profile = pkg.mikrotikProfileName!;
              await ensureHotspotProfile(client, profile, pkg);
              await client.add("/ip/hotspot/user", {
                name: username,
                password: subPassword,
                profile,
                "limit-uptime": `${trialHours}h`,
                comment: planComment,
              });
              await syncHotspotRadiusUser(ctx.db, username, subPassword, pkg, trialSeconds);
              await syncHotspotDbUser(ctx.db, ctx.orgId, r.id, username, subPassword, profile, planComment);
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
        await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "subscription.created", "subscription", sub.id, { username, packageName: pkg.name, durationSeconds: trialSeconds });

        await ctx.db.update(orders).set({ subscriptionId: sub.id, updatedAt: new Date() }).where(eq(orders.id, o.id));
      } else {
        // Renewal/upgrade: update existing subscription with new package + extended expiry
        const [existingSub] = await ctx.db.select().from(subscriptions)
          .where(and(eq(subscriptions.id, o.subscriptionId!), eq(subscriptions.orgId, ctx.orgId))).limit(1);
        if (!existingSub) throw new TRPCError({ code: "NOT_FOUND", message: "Subscription not found" });

        const renewSeconds = packageActivationDurationSeconds(pkg);
        const expiresAt = new Date(Date.now() + renewSeconds * 1000);

        await ctx.db.update(subscriptions).set({
          packageId: pkg.id,
          expiresAt,
          status: "active",
          updatedAt: new Date(),
        }).where(and(eq(subscriptions.id, o.subscriptionId!), eq(subscriptions.orgId, ctx.orgId)));

        await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "subscription.renewed", "subscription", o.subscriptionId!, {
          packageName: pkg.name, durationSeconds: renewSeconds,
        });

        // Non-blocking: update MikroTik profile + RADIUS for hotspot packages
        if (pkg.type === "hotspot" && pkg.mikrotikProfileName && existingSub.routerId) {
          const [r] = await ctx.db.select().from(routers)
            .where(and(eq(routers.id, existingSub.routerId), eq(routers.orgId, ctx.orgId))).limit(1);
          if (r) {
            connectRouter(r).then(async (client) => {
              try {
                await ensureHotspotProfile(client, pkg.mikrotikProfileName!, pkg);
                const hsUsers = await client.print("/ip/hotspot/user", { name: existingSub.username });
                if (hsUsers[0]?.id) {
                  await client.exec("/ip/hotspot/user", "set", {
                    numbers: hsUsers[0].id,
                    profile: pkg.mikrotikProfileName!,
                    comment: hotspotPlanComment(pkg),
                  }).catch(() => {});
                }
                const subPassword = decryptText(existingSub.passwordEncrypted);
                await syncHotspotRadiusUser(ctx.db, existingSub.username, subPassword, pkg, renewSeconds);
                await syncHotspotDbUser(ctx.db, ctx.orgId, r.id, existingSub.username, subPassword, pkg.mikrotikProfileName!, hotspotPlanComment(pkg));
              } catch (err) {
                logger.warn({ err }, "MikroTik profile update failed in renewal — non-blocking");
              } finally {
                await client.close().catch(() => {});
              }
            }).catch((err) => logger.warn({ err }, "MikroTik connect failed in renewal"));
          }
        }
      }

      await ctx.db.update(orders).set({
        status: "approved", reviewedBy: ctx.user.id,
        reviewedAt: new Date(), reviewNote: input.note, updatedAt: new Date(),
      }).where(and(eq(orders.id, o.id), eq(orders.orgId, ctx.orgId)));
      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "order.approved", "order", o.id, { amountBdt: o.amountBdt, packageName: pkg.name, paymentMethod: o.paymentMethod });

      const invoiceNum = await nextInvoiceNumber(ctx.db, ctx.orgId);
      const [inv] = await ctx.db.insert(invoices).values({
        orgId: ctx.orgId, orderId: o.id, invoiceNumber: invoiceNum,
        customerId: o.customerId, amountBdt: o.amountBdt,
        taxBdt: 0, totalBdt: o.amountBdt, paidAt: new Date(),
      }).returning();
      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "payment.received", "invoice", inv.id, { orderId: o.id, amountBdt: o.amountBdt, paymentMethod: o.paymentMethod });

      const [customer] = await ctx.db.select().from(customers)
        .where(and(eq(customers.id, o.customerId), eq(customers.orgId, ctx.orgId))).limit(1);
      const [tgConfig] = await ctx.db.select().from(telegramConfigs)
        .where(eq(telegramConfigs.orgId, ctx.orgId)).limit(1);
      if (tgConfig && customer) {
        await sendApprovalNotification(tgConfig.chatId, customer, pkg);
      }

      emitOrgEvent(ctx.orgId, "order:approved", {
        orgId: ctx.orgId,
        orderId: o.id,
        customerName: customer?.fullName ?? "Unknown",
        amountBdt: o.amountBdt,
        packageName: pkg.name,
      });

      emitCustomerEvent(o.customerId, "payment:paid", {
        orderId: o.id,
        invoiceId: inv.id,
        amountBdt: o.amountBdt,
        packageName: pkg.name,
      });

      const [pendingCount] = await ctx.db.select({ n: sql<number>`count(*)` }).from(orders)
        .where(and(eq(orders.orgId, ctx.orgId), eq(orders.status, "pending")));
      emitOrgEvent(ctx.orgId, "order:stats", {
        orgId: ctx.orgId,
        pendingCount: Number(pendingCount?.n ?? 0),
        todayRevenue: 0,
        totalActiveSubscriptions: 0,
      });

      sendPaymentSuccessSms(ctx.orgId, o.id).catch((err) =>
        logger.warn({ err, orderId: o.id }, "SMS send failed — non-blocking"),
      );

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
