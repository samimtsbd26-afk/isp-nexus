import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc } from "drizzle-orm";
import { router, publicProcedure } from "../middleware.js";
import { customers, packages, orders, subscriptions, invoices, supportTickets } from "@isp-nexus/db";
import { hashPassword, verifyPassword, encryptText } from "../lib/crypto.js";
import { signPortalToken, verifyPortalToken } from "../auth/session.js";
import { portalRegisterSchema, submitOrderSchema } from "@isp-nexus/shared";

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
    const [customer] = await ctx.db.select().from(customers).where(eq(customers.id, payload.customerId)).limit(1);
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
      const [pkg] = await ctx.db.select().from(packages).where(eq(packages.id, input.packageId)).limit(1);
      if (!pkg) throw new TRPCError({ code: "NOT_FOUND", message: "Package not found" });
      const [o] = await ctx.db.insert(orders).values({
        orgId: payload.orgId, customerId: payload.customerId,
        packageId: input.packageId, amountBdt: input.amountBdt,
        paymentMethod: input.paymentMethod, trxId: input.trxId,
        paymentFrom: input.paymentFrom, screenshotUrl: input.screenshotUrl,
        status: "pending",
      }).returning({ id: orders.id });
      return { orderId: o.id };
    }),

  myOrders: publicProcedure.input(z.object({ token: z.string() })).query(async ({ ctx, input }) => {
    const payload = await verifyPortalToken(input.token);
    if (!payload) throw new TRPCError({ code: "UNAUTHORIZED" });
    return ctx.db.select().from(orders).where(eq(orders.customerId, payload.customerId))
      .orderBy(desc(orders.createdAt));
  }),

  myInvoices: publicProcedure.input(z.object({ token: z.string() })).query(async ({ ctx, input }) => {
    const payload = await verifyPortalToken(input.token);
    if (!payload) throw new TRPCError({ code: "UNAUTHORIZED" });
    return ctx.db.select().from(invoices).where(eq(invoices.customerId, payload.customerId));
  }),

  changePassword: publicProcedure
    .input(z.object({ token: z.string(), currentPassword: z.string(), newPassword: z.string().min(6) }))
    .mutation(async ({ ctx, input }) => {
      const payload = await verifyPortalToken(input.token);
      if (!payload) throw new TRPCError({ code: "UNAUTHORIZED" });
      const [customer] = await ctx.db.select().from(customers).where(eq(customers.id, payload.customerId)).limit(1);
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
});
