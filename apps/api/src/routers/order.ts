import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { orders, invoices, subscriptions, customers } from "@isp-nexus/db";
import { generateInvoicePdf } from "../services/billing/invoice.js";

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

      await ctx.db.update(orders).set({
        status: "approved", reviewedBy: ctx.user.id,
        reviewedAt: new Date(), reviewNote: input.note, updatedAt: new Date(),
      }).where(eq(orders.id, o.id));

      if (o.subscriptionId) {
        await ctx.db.update(subscriptions).set({ status: "active", updatedAt: new Date() })
          .where(eq(subscriptions.id, o.subscriptionId));
      }

      const invoiceNum = `INV-${Date.now()}`;
      const [inv] = await ctx.db.insert(invoices).values({
        orgId: ctx.orgId, orderId: o.id, invoiceNumber: invoiceNum,
        customerId: o.customerId, amountBdt: o.amountBdt,
        taxBdt: 0, totalBdt: o.amountBdt, paidAt: new Date(),
      }).returning();

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
