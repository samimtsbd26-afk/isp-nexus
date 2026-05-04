import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, asc } from "drizzle-orm";
import { router, publicProcedure } from "../middleware.js";
import { customers, packages, orders, subscriptions, invoices, supportTickets, routers, telegramConfigs } from "@isp-nexus/db";
import { hashPassword, verifyPassword, encryptText, decryptText } from "../lib/crypto.js";
import { signPortalToken, verifyPortalToken } from "../auth/session.js";
import { portalRegisterSchema, submitOrderSchema, guestOrderSchema, checkOrderSchema, trialRegisterSchema } from "@isp-nexus/shared";
import { getMikroTikClient } from "../services/mikrotik/client.js";
import { logger } from "../lib/logger.js";
import { sendOrderNotification } from "../services/telegram/bot.js";

const portalAuthed = publicProcedure.use(async ({ ctx, next, input }: any) => {
  const token: string = input?.token;
  if (!token) throw new TRPCError({ code: "UNAUTHORIZED" });
  const payload = await verifyPortalToken(token);
  if (!payload) throw new TRPCError({ code: "UNAUTHORIZED" });
  const [customer] = await ctx.db.select().from(customers).where(eq(customers.id, payload.customerId)).limit(1);
  if (!customer?.isActive) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, customer, orgId: payload.orgId } });
});

export const portalRouter = router({
  register: publicProcedure
    .input(portalRegisterSchema.extend({ orgId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.select({ id: customers.id }).from(customers)
        .where(and(eq(customers.phone, input.phone), eq(customers.orgId, input.orgId))).limit(1);
      if (existing.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Phone already registered" });
      const passwordHash = await hashPassword(input.password);
      const code = `C${Date.now().toString().slice(-6)}`;
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

  dashboard: publicProcedure.input(z.object({ token: z.string() })).query(async ({ ctx, input }) => {
    const payload = await verifyPortalToken(input.token);
    if (!payload) throw new TRPCError({ code: "UNAUTHORIZED" });
    const [customer] = await ctx.db.select().from(customers).where(eq(customers.id, payload.customerId)).limit(1);
    if (!customer) throw new TRPCError({ code: "UNAUTHORIZED" });
    const subs = await ctx.db.select().from(subscriptions).where(eq(subscriptions.customerId, customer.id));
    const recentOrders = await ctx.db.select().from(orders)
      .where(eq(orders.customerId, customer.id)).orderBy(desc(orders.createdAt)).limit(5);
    const availablePkgs = await ctx.db.select().from(packages)
      .where(and(eq(packages.orgId, customer.orgId), eq(packages.isActive, true)));
    const { passwordHash: _, ...safeCustomer } = customer;
    return { customer: safeCustomer, subscriptions: subs, recentOrders, packages: availablePkgs };
  }),

  submitOrder: publicProcedure
    .input(submitOrderSchema.extend({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await verifyPortalToken(input.token);
      if (!payload) throw new TRPCError({ code: "UNAUTHORIZED" });
      const [customer] = await ctx.db.select().from(customers)
        .where(and(eq(customers.id, payload.customerId), eq(customers.orgId, payload.orgId))).limit(1);
      if (!customer?.isActive) throw new TRPCError({ code: "UNAUTHORIZED" });
      const [pkg] = await ctx.db.select().from(packages)
        .where(and(eq(packages.id, input.packageId), eq(packages.orgId, payload.orgId), eq(packages.isActive, true))).limit(1);
      if (!pkg) throw new TRPCError({ code: "NOT_FOUND", message: "Package not found" });
      const [o] = await ctx.db.insert(orders).values({
        orgId: payload.orgId, customerId: payload.customerId,
        packageId: input.packageId, amountBdt: pkg.priceBdt,
        paymentMethod: input.paymentMethod, trxId: input.trxId,
        paymentFrom: input.paymentFrom, screenshotUrl: input.screenshotUrl,
        status: "pending",
      }).returning({ id: orders.id });
      return { orderId: o.id };
    }),

  myOrders: publicProcedure.input(z.object({ token: z.string() })).query(async ({ ctx, input }) => {
    const payload = await verifyPortalToken(input.token);
    if (!payload) throw new TRPCError({ code: "UNAUTHORIZED" });
    return ctx.db.select().from(orders)
      .where(and(eq(orders.customerId, payload.customerId), eq(orders.orgId, payload.orgId)))
      .orderBy(desc(orders.createdAt));
  }),

  myInvoices: publicProcedure.input(z.object({ token: z.string() })).query(async ({ ctx, input }) => {
    const payload = await verifyPortalToken(input.token);
    if (!payload) throw new TRPCError({ code: "UNAUTHORIZED" });
    return ctx.db.select().from(invoices)
      .where(and(eq(invoices.customerId, payload.customerId), eq(invoices.orgId, payload.orgId)));
  }),

  changePassword: publicProcedure
    .input(z.object({ token: z.string(), currentPassword: z.string(), newPassword: z.string().min(6) }))
    .mutation(async ({ ctx, input }) => {
      const payload = await verifyPortalToken(input.token);
      if (!payload) throw new TRPCError({ code: "UNAUTHORIZED" });
      const [customer] = await ctx.db.select().from(customers)
        .where(and(eq(customers.id, payload.customerId), eq(customers.orgId, payload.orgId))).limit(1);
      if (!customer?.passwordHash) throw new TRPCError({ code: "BAD_REQUEST" });
      const valid = await verifyPassword(input.currentPassword, customer.passwordHash);
      if (!valid) throw new TRPCError({ code: "BAD_REQUEST", message: "Incorrect current password" });
      const passwordHash = await hashPassword(input.newPassword);
      await ctx.db.update(customers).set({ passwordHash }).where(eq(customers.id, customer.id));
      return { ok: true };
    }),

  openTicket: publicProcedure
    .input(z.object({ token: z.string(), subject: z.string().min(5), message: z.string().min(10) }))
    .mutation(async ({ ctx, input }) => {
      const payload = await verifyPortalToken(input.token);
      if (!payload) throw new TRPCError({ code: "UNAUTHORIZED" });
      const [ticket] = await ctx.db.insert(supportTickets).values({
        orgId: payload.orgId, customerId: payload.customerId,
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
        const code = `C${Date.now().toString().slice(-6)}`;
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
        const [r] = await ctx.db.select().from(routers)
          .where(and(eq(routers.orgId, input.orgId), eq(routers.isDefault, true))).limit(1);
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
              await client.add("/ip/hotspot/user", {
                name: input.phone, password: input.password,
                profile: pkg.mikrotikProfileName ?? "default",
              });
            }
            await client.close();
          } catch (err) { logger.error({ err }, "MikroTik provision error in guestOrder trial"); }
        }

        const token = await signPortalToken({ customerId: customer.id, orgId: input.orgId, type: "portal" });
        const { passwordHash: _, ...safe } = customer;
        return { token, customer: safe, isTrial: true };
      }

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

      return { orderId: order.id, customerId: customer.id, isTrial: false };
    }),

  checkOrder: publicProcedure
    .input(checkOrderSchema)
    .query(async ({ ctx, input }) => {
      const [order] = await ctx.db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      const [customer] = await ctx.db.select().from(customers).where(eq(customers.id, order.customerId)).limit(1);
      if (!customer || customer.phone !== input.phone) throw new TRPCError({ code: "UNAUTHORIZED", message: "Phone mismatch" });
      const [pkg] = await ctx.db.select().from(packages).where(eq(packages.id, order.packageId)).limit(1);
      return {
        status: order.status,
        amountBdt: order.amountBdt,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt,
        packageName: pkg?.name ?? null,
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
        const code = `C${Date.now().toString().slice(-6)}`;
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

      const [r] = await ctx.db.select().from(routers)
        .where(and(eq(routers.orgId, input.orgId), eq(routers.isDefault, true))).limit(1);
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
            await client.add("/ip/hotspot/user", {
              name: input.phone, password: input.password,
              profile: pkg.mikrotikProfileName ?? "default",
            });
          }
          await client.close();
        } catch (err) { logger.error({ err }, "MikroTik provision error in trialRegister"); }
      }

      const token = await signPortalToken({ customerId: customer.id, orgId: input.orgId, type: "portal" });
      const { passwordHash: _, ...safe } = customer;
      return { token, customer: safe };
    }),
});
