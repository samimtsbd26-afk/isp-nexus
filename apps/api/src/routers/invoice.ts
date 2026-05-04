import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { router, authedProcedure } from "../middleware.js";
import { invoices, customers, orders } from "@isp-nexus/db";
import { generateInvoicePdf } from "../services/billing/invoice.js";

export const invoiceRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(invoices).where(eq(invoices.orgId, ctx.orgId));
  }),

  get: authedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [inv] = await ctx.db.select().from(invoices)
      .where(and(eq(invoices.id, input.id), eq(invoices.orgId, ctx.orgId))).limit(1);
    if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
    return inv;
  }),

  generatePdf: authedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [inv] = await ctx.db.select().from(invoices)
      .where(and(eq(invoices.id, input.id), eq(invoices.orgId, ctx.orgId))).limit(1);
    if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
    const [customer] = await ctx.db.select().from(customers).where(eq(customers.id, inv.customerId)).limit(1);
    const [order] = await ctx.db.select().from(orders).where(eq(orders.id, inv.orderId)).limit(1);
    if (!customer || !order) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const pdf = generateInvoicePdf(inv, customer, order);
    return { base64: pdf.toString("base64"), filename: `${inv.invoiceNumber}.pdf` };
  }),
});
