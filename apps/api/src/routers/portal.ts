import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, asc } from "drizzle-orm";
import { router, publicProcedure } from "../middleware.js";
import { customers, packages, orders, subscriptions, invoices, supportTickets, routers, telegramConfigs, hotspotUsers, pppoeUsers } from "@isp-nexus/db";
import { hashPassword, verifyPassword, encryptText, decryptText } from "../lib/crypto.js";
import { signPortalToken, verifyPortalToken } from "../auth/session.js";
import { portalRegisterSchema, submitOrderSchema, guestOrderSchema, checkOrderSchema, trialRegisterSchema } from "@isp-nexus/shared";
import { getMikroTikClient } from "../services/mikrotik/client.js";
import { logger } from "../lib/logger.js";
import { sendOrderNotification, sendLoginAlert } from "../services/telegram/bot.js";
import { emitOrgEvent } from "../boot.js";
import { ensureHotspotProfile, syncHotspotRadiusUser } from "../services/hotspot/provisioning.js";
import { nextCustomerCode } from "./customer.js";

const portalAuthed = publicProcedure.use(async ({ ctx, next, input }: any) => {
  const token: string = input?.token;
  if (!token) throw new TRPCError({ code: "UNAUTHORIZED" });
  const payload = await verifyPortalToken(token);
  if (!payload) throw new TRPCError({ code: "UNAUTHORIZED" });
  const [customer] = await ctx.db.select().from(customers)
    .where(and(eq(customers.id, payload.customerId), eq(customers.orgId, payload.orgId)))
    .limit(1);
  if (!customer?.isActive) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, customer, orgId: payload.orgId } });
});

function validatePortalPayment(input: { paymentMethod: string; trxId?: string; paymentFrom?: string }, amountBdt: number) {
  if (input.paymentMethod === "free" && amountBdt > 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Free payment is only allowed for free packages" });
  }
  if (["bkash", "nagad", "rocket"].includes(input.paymentMethod) && (!input.trxId || !input.paymentFrom)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Transaction ID and payment phone are required" });
  }
}

async function assertUniqueTransaction(ctx: { db: any }, input: { orgId: string; paymentMethod: string; trxId?: string }) {
  if (!input.trxId || ["cash", "free"].includes(input.paymentMethod)) return;
  const [existing] = await ctx.db.select({ id: orders.id }).from(orders)
    .where(and(eq(orders.orgId, input.orgId), eq(orders.paymentMethod, input.paymentMethod as any), eq(orders.trxId, input.trxId)))
    .limit(1);
  if (existing) throw new TRPCError({ code: "CONFLICT", message: "Transaction ID already submitted" });
}

async function assertNoExistingHotspotUser(ctx: { db: any }, input: { orgId: string; phone: string }) {
  const [existing] = await ctx.db.select({ id: subscriptions.id }).from(subscriptions)
    .where(and(eq(subscriptions.orgId, input.orgId), eq(subscriptions.username, input.phone)))
    .limit(1);
  if (existing) throw new TRPCError({ code: "CONFLICT", message: "A trial or subscription already exists for this phone" });
}

export const portalRouter = router({
  register: publicProcedure
    .input(portalRegisterSchema.extend({ orgId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.select({ id: customers.id }).from(customers)
        .where(and(eq(customers.phone, input.phone), eq(customers.orgId, input.orgId))).limit(1);
      if (existing.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Phone already registered" });
      const passwordHash = await hashPassword(input.password);
      const code = await nextCustomerCode(ctx.db, input.orgId);
      const [customer] = await ctx.db.insert(customers).values({
        orgId: input.orgId, customerCode: code, fullName: input.fullName,
        phone: input.phone, email: input.email, passwordHash,
      }).returning({ id: customers.id, fullName: customers.fullName, phone: customers.phone });
      const token = await signPortalToken({ customerId: customer.id, orgId: input.orgId, type: "portal" });
      return { token, customer };
    }),

  login: publicProcedure
    .input(z.object({ orgId: z.string().uuid(), phone: z.string(), password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [customer] = await ctx.db.select().from(customers)
        .where(and(eq(customers.phone, input.phone), eq(customers.orgId, input.orgId))).limit(1);
      if (!customer?.passwordHash) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      const valid = await verifyPassword(input.password, customer.passwordHash);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      const token = await signPortalToken({ customerId: customer.id, orgId: customer.orgId, type: "portal" });
      // Non-blocking Telegram login alert to admin
      ctx.db.select({ chatId: telegramConfigs.chatId }).from(telegramConfigs)
        .where(and(eq(telegramConfigs.orgId, customer.orgId), eq(telegramConfigs.alertsEnabled, true))).limit(1)
        .then(([cfg]) => { if (cfg) sendLoginAlert(cfg.chatId, customer.fullName, customer.phone).catch(() => {}); })
        .catch(() => {});
      const { passwordHash: _, ...safe } = customer;
      return { token, customer: safe };
    }),

  me: publicProcedure.input(z.object({ token: z.string() })).query(async ({ ctx, input }) => {
    const payload = await verifyPortalToken(input.token);
    if (!payload) return null;
    const [customer] = await ctx.db.select().from(customers)
      .where(and(eq(customers.id, payload.customerId), eq(customers.orgId, payload.orgId))).limit(1);
    if (!customer) return null;
    const { passwordHash: _, ...safe } = customer;
    return safe;
  }),

  dashboard: portalAuthed.input(z.object({ token: z.string() })).query(async ({ ctx }) => {
    const customer = (ctx as any).customer;
    const orgId = ctx.orgId as string;
    const subs = await ctx.db.select().from(subscriptions)
      .where(and(eq(subscriptions.customerId, customer.id), eq(subscriptions.orgId, orgId)));
    const recentOrders = await ctx.db.select().from(orders)
      .where(and(eq(orders.customerId, customer.id), eq(orders.orgId, orgId))).orderBy(desc(orders.createdAt)).limit(5);
    const availablePkgs = await ctx.db.select().from(packages)
      .where(and(eq(packages.orgId, customer.orgId), eq(packages.isActive, true)));
    const { passwordHash: _, ...safeCustomer } = customer;
    return { customer: safeCustomer, subscriptions: subs, recentOrders, packages: availablePkgs };
  }),

  submitOrder: portalAuthed
    .input(submitOrderSchema.extend({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const customer = (ctx as any).customer;
      const orgId = ctx.orgId as string;
      const [pkg] = await ctx.db.select().from(packages)
        .where(and(eq(packages.id, input.packageId), eq(packages.orgId, orgId), eq(packages.isActive, true))).limit(1);
      if (!pkg) throw new TRPCError({ code: "NOT_FOUND", message: "Package not found" });
      validatePortalPayment(input, pkg.priceBdt);
      await assertUniqueTransaction(ctx, { ...input, orgId });
      const [o] = await ctx.db.insert(orders).values({
        orgId, customerId: customer.id,
        packageId: input.packageId, amountBdt: pkg.priceBdt,
        paymentMethod: input.paymentMethod, trxId: input.trxId,
        paymentFrom: input.paymentFrom, screenshotUrl: input.screenshotUrl,
        status: "pending",
      }).returning({ id: orders.id });
      return { orderId: o.id };
    }),

  myOrders: portalAuthed.input(z.object({ token: z.string() })).query(async ({ ctx }) => {
    const customer = (ctx as any).customer;
    const orgId = ctx.orgId as string;
    return ctx.db.select().from(orders)
      .where(and(eq(orders.customerId, customer.id), eq(orders.orgId, orgId)))
      .orderBy(desc(orders.createdAt));
  }),

  myInvoices: portalAuthed.input(z.object({ token: z.string() })).query(async ({ ctx }) => {
    const customer = (ctx as any).customer;
    const orgId = ctx.orgId as string;
    return ctx.db.select().from(invoices)
      .where(and(eq(invoices.customerId, customer.id), eq(invoices.orgId, orgId)));
  }),

  changePassword: portalAuthed
    .input(z.object({ token: z.string(), currentPassword: z.string(), newPassword: z.string().min(6) }))
    .mutation(async ({ ctx, input }) => {
      const customer = (ctx as any).customer;
      if (!customer?.passwordHash) throw new TRPCError({ code: "BAD_REQUEST" });
      const valid = await verifyPassword(input.currentPassword, customer.passwordHash);
      if (!valid) throw new TRPCError({ code: "BAD_REQUEST", message: "Incorrect current password" });
      const passwordHash = await hashPassword(input.newPassword);
      await ctx.db.update(customers).set({ passwordHash }).where(eq(customers.id, customer.id));
      return { ok: true };
    }),

  openTicket: portalAuthed
    .input(z.object({ token: z.string(), subject: z.string().min(5), message: z.string().min(10) }))
    .mutation(async ({ ctx, input }) => {
      const customer = (ctx as any).customer;
      const orgId = ctx.orgId as string;
      const [ticket] = await ctx.db.insert(supportTickets).values({
        orgId, customerId: customer.id,
        subject: input.subject, status: "open", priority: "medium",
      }).returning({ id: supportTickets.id });
      return { ticketId: ticket.id };
    }),

  publicPackages: publicProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(packages)
        .where(and(eq(packages.orgId, input.orgId), eq(packages.isActive, true)))
        .orderBy(asc(packages.sortOrder));
    }),

  guestOrder: publicProcedure
    .input(guestOrderSchema)
    .mutation(async ({ ctx, input }) => {
      let [customer] = await ctx.db.select().from(customers)
        .where(and(eq(customers.phone, input.phone), eq(customers.orgId, input.orgId))).limit(1);
      if (customer) {
        if (!customer.isActive) throw new TRPCError({ code: "UNAUTHORIZED", message: "Account is inactive" });
        if (customer.passwordHash && !(await verifyPassword(input.password, customer.passwordHash))) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
        }
      } else {
        const code = await nextCustomerCode(ctx.db, input.orgId);
        const passwordHash = await hashPassword(input.password);
        [customer] = await ctx.db.insert(customers).values({
          orgId: input.orgId, customerCode: code, fullName: input.fullName,
          phone: input.phone, passwordHash,
        }).returning();
      }

      const [pkg] = await ctx.db.select().from(packages)
        .where(and(eq(packages.id, input.packageId), eq(packages.orgId, input.orgId), eq(packages.isActive, true))).limit(1);
      if (!pkg) throw new TRPCError({ code: "NOT_FOUND", message: "Package not found" });

      if (input.isTrial) {
        if (!pkg.isTrial) throw new TRPCError({ code: "BAD_REQUEST", message: "Package is not available as a trial" });
        await assertNoExistingHotspotUser(ctx, input);
        const [r] = await ctx.db.select().from(routers)
          .where(and(eq(routers.orgId, input.orgId), eq(routers.isDefault, true), eq(routers.isActive, true))).limit(1);
        const passwordEncrypted = encryptText(input.password);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const [sub] = await ctx.db.insert(subscriptions).values({
          orgId: input.orgId, customerId: customer.id, packageId: input.packageId,
          routerId: r?.id ?? null, username: input.phone, passwordEncrypted,
          expiresAt, status: "active",
        }).returning();

        if (r && pkg) {
          const port = r.useSsl ? (r.sslPort ?? 8729) : r.port;
          const password = decryptText(r.passwordEncrypted);
          try {
            const client = await getMikroTikClient({ host: r.host, port, username: r.username, password, useSsl: r.useSsl });
            if (pkg.type === "pppoe") {
              const addData: Record<string, string> = {
                name: input.phone, password: input.password,
                service: "pppoe", profile: pkg.mikrotikProfileName ?? "default",
              };
              await client.add("/ppp/secret", addData);
            } else {
              const profile = pkg.mikrotikProfileName ?? "default";
              await ensureHotspotProfile(client, profile, pkg);
              await client.add("/ip/hotspot/user", {
                name: input.phone, password: input.password,
                profile,
              });
              await syncHotspotRadiusUser(ctx.db, input.phone, input.password, pkg, 7 * 24 * 60 * 60);
            }
            await client.close();
          } catch (err) { logger.error({ err }, "MikroTik provision error in guestOrder trial"); }
        }

        const token = await signPortalToken({ customerId: customer.id, orgId: input.orgId, type: "portal" });
        const { passwordHash: _, ...safe } = customer;
        return { token, customer: safe, isTrial: true };
      }

      validatePortalPayment(input, pkg.priceBdt);
      await assertUniqueTransaction(ctx, input);
      const [order] = await ctx.db.insert(orders).values({
        orgId: input.orgId, customerId: customer.id,
        packageId: input.packageId, amountBdt: pkg.priceBdt,
        paymentMethod: input.paymentMethod, trxId: input.trxId,
        paymentFrom: input.paymentFrom, status: "pending",
      }).returning({ id: orders.id });

      const [tgConfig] = await ctx.db.select().from(telegramConfigs)
        .where(eq(telegramConfigs.orgId, input.orgId)).limit(1);
      if (tgConfig) {
        await sendOrderNotification(tgConfig.chatId, { ...order, amountBdt: pkg.priceBdt, paymentMethod: input.paymentMethod }, customer, pkg);
      }

      // Real-time notification to admin panel
      emitOrgEvent(input.orgId, "order:new", {
        orgId: input.orgId,
        orderId: order.id,
        customerName: customer.fullName,
        customerPhone: customer.phone ?? "",
        amountBdt: pkg.priceBdt,
        paymentMethod: input.paymentMethod,
        trxId: input.trxId,
      });

      return { orderId: order.id, customerId: customer.id, isTrial: false };
    }),

  checkOrder: publicProcedure
    .input(checkOrderSchema.extend({ orgId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const [order] = await ctx.db.select().from(orders)
        .where(input.orgId ? and(eq(orders.id, input.orderId), eq(orders.orgId, input.orgId)) : eq(orders.id, input.orderId))
        .limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      const [customer] = await ctx.db.select().from(customers)
        .where(and(eq(customers.id, order.customerId), eq(customers.orgId, order.orgId)))
        .limit(1);
      if (!customer || customer.phone !== input.phone) throw new TRPCError({ code: "UNAUTHORIZED", message: "Phone mismatch" });
      if (!order.packageId) throw new TRPCError({ code: "BAD_REQUEST", message: "Order package is missing" });
      const [pkg] = await ctx.db.select().from(packages)
        .where(and(eq(packages.id, order.packageId), eq(packages.orgId, order.orgId)))
        .limit(1);
      const credentials = order.status === "approved" && order.subscriptionId
        ? await ctx.db.select({
          username: subscriptions.username,
          passwordEncrypted: subscriptions.passwordEncrypted,
        }).from(subscriptions)
          .where(and(eq(subscriptions.id, order.subscriptionId), eq(subscriptions.orgId, order.orgId)))
          .limit(1)
        : [];
      return {
        status: order.status,
        amountBdt: order.amountBdt,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt,
        packageName: pkg?.name ?? null,
        credentials: credentials[0] ? {
          username: credentials[0].username,
          password: decryptText(credentials[0].passwordEncrypted),
        } : null,
      };
    }),

  trialRegister: publicProcedure
    .input(trialRegisterSchema)
    .mutation(async ({ ctx, input }) => {
      let [customer] = await ctx.db.select().from(customers)
        .where(and(eq(customers.phone, input.phone), eq(customers.orgId, input.orgId))).limit(1);
      if (customer) {
        if (!customer.isActive) throw new TRPCError({ code: "UNAUTHORIZED", message: "Account is inactive" });
        if (customer.passwordHash && !(await verifyPassword(input.password, customer.passwordHash))) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
        }
      } else {
        const code = await nextCustomerCode(ctx.db, input.orgId);
        const passwordHash = await hashPassword(input.password);
        [customer] = await ctx.db.insert(customers).values({
          orgId: input.orgId, customerCode: code, fullName: input.fullName,
          phone: input.phone, passwordHash,
        }).returning();
      }

      const [pkg] = await ctx.db.select().from(packages)
        .where(and(eq(packages.id, input.packageId), eq(packages.orgId, input.orgId), eq(packages.isActive, true))).limit(1);
      if (!pkg) throw new TRPCError({ code: "NOT_FOUND", message: "Package not found" });
      if (!pkg.isTrial) throw new TRPCError({ code: "BAD_REQUEST", message: "Package is not available as a trial" });
      await assertNoExistingHotspotUser(ctx, input);

      const [r] = await ctx.db.select().from(routers)
        .where(and(eq(routers.orgId, input.orgId), eq(routers.isDefault, true), eq(routers.isActive, true))).limit(1);
      const passwordEncrypted = encryptText(input.password);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const [sub] = await ctx.db.insert(subscriptions).values({
        orgId: input.orgId, customerId: customer.id, packageId: input.packageId,
        routerId: r?.id ?? null, username: input.phone, passwordEncrypted,
        expiresAt, status: "active",
      }).returning();

      if (r && pkg) {
        const port = r.useSsl ? (r.sslPort ?? 8729) : r.port;
        const password = decryptText(r.passwordEncrypted);
        try {
          const client = await getMikroTikClient({ host: r.host, port, username: r.username, password, useSsl: r.useSsl });
          if (pkg.type === "pppoe") {
            const addData: Record<string, string> = {
              name: input.phone, password: input.password,
              service: "pppoe", profile: pkg.mikrotikProfileName ?? "default",
            };
            await client.add("/ppp/secret", addData);
          } else {
            const profile = pkg.mikrotikProfileName ?? "default";
            await ensureHotspotProfile(client, profile, pkg);
            await client.add("/ip/hotspot/user", {
              name: input.phone, password: input.password,
              profile,
            });
            await syncHotspotRadiusUser(ctx.db, input.phone, input.password, pkg, 7 * 24 * 60 * 60);
          }
          await client.close();
        } catch (err) { logger.error({ err }, "MikroTik provision error in trialRegister"); }
      }

      const token = await signPortalToken({ customerId: customer.id, orgId: input.orgId, type: "portal" });
      const { passwordHash: _, ...safe } = customer;
      return { token, customer: safe };
    }),

  macCheck: publicProcedure
    .input(z.object({ orgId: z.string().uuid(), mac: z.string().min(1).max(30) }))
    .query(async ({ ctx, input }) => {
      const cleanMac = input.mac.toLowerCase().replace(/[^0-9a-f:.-]/g, "");

      // Check hotspot users by MAC
      const [hotspot] = await ctx.db.select({ id: hotspotUsers.id, isActive: hotspotUsers.isActive, name: hotspotUsers.name })
        .from(hotspotUsers)
        .where(and(eq(hotspotUsers.orgId, input.orgId), eq(hotspotUsers.macAddress, cleanMac)))
        .limit(1);

      // Check PPPoE users by MAC (caller-id)
      const [pppoe] = await ctx.db.select({ id: pppoeUsers.id, isActive: pppoeUsers.isActive, name: pppoeUsers.name })
        .from(pppoeUsers)
        .where(and(eq(pppoeUsers.orgId, input.orgId), eq(pppoeUsers.callerId, cleanMac)))
        .limit(1);

      const knownUser = hotspot ?? pppoe;
      const hasActiveSession = !!(knownUser?.isActive);

      // Check subscription status via username
      let hasActiveSubscription = false;
      let hasExpiredSubscription = false;
      let hasTrial = false;

      if (knownUser?.name) {
        const [sub] = await ctx.db.select({ status: subscriptions.status, packageId: subscriptions.packageId })
          .from(subscriptions)
          .where(and(eq(subscriptions.orgId, input.orgId), eq(subscriptions.username, knownUser.name)))
          .orderBy(desc(subscriptions.createdAt))
          .limit(1);

        if (sub) {
          hasActiveSubscription = sub.status === "active";
          hasExpiredSubscription = sub.status === "expired" || sub.status === "suspended";

          // Check if this was a trial package
          if (sub.packageId) {
            const [pkg] = await ctx.db.select({ isTrial: packages.isTrial })
              .from(packages).where(eq(packages.id, sub.packageId)).limit(1);
            hasTrial = pkg?.isTrial ?? false;
          }
        }
      }

      const hasSubscription = !!(knownUser);
      const isNewDevice = !hasSubscription;

      return {
        hasSubscription,
        isNewDevice,
        hasTrial,
        hasActiveSubscription,
        hasExpiredSubscription,
        hasActiveSession,
        username: knownUser?.name ?? null,
      };
    }),
});
