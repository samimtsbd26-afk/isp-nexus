import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, like, desc, sql } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { customers, subscriptions, orders, appSettings } from "@isp-nexus/db";
import { createCustomerSchema } from "@isp-nexus/shared";
import { hashPassword } from "../lib/crypto.js";

/**
 * Generate the next customer code from the database.
 * Uses an `app_settings` row with key='customer_counter' to persist
 * the counter across server restarts, avoiding ID collisions.
 */
async function nextCustomerCode(db: any, orgId: string): Promise<string> {
  const key = "customer_counter";

  // Atomically increment the counter using a transaction
  const code = await db.transaction(async (tx: any) => {
    const [existing] = await tx.select().from(appSettings)
      .where(and(eq(appSettings.orgId, orgId), eq(appSettings.key, key))).limit(1);

    let nextVal: number;
    if (existing) {
      nextVal = parseInt(existing.value, 10) + 1;
      await tx.update(appSettings)
        .set({ value: String(nextVal), updatedAt: new Date() })
        .where(eq(appSettings.id, existing.id));
    } else {
      // First customer: count existing customers to avoid collision,
      // then start from 1000 or the count, whichever is higher
      const [{ count }] = await tx.select({ count: sql<number>`count(*)` })
        .from(customers).where(eq(customers.orgId, orgId));
      nextVal = Math.max(Number(count) + 1, 1001);
      await tx.insert(appSettings).values({ orgId, key, value: String(nextVal) });
    }
    return nextVal;
  });

  return `C${String(code).padStart(5, "0")}`;
}

export const customerRouter = router({
  list: authedProcedure
    .input(z.object({ search: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db.select({
        id: customers.id, customerCode: customers.customerCode, fullName: customers.fullName,
        phone: customers.phone, email: customers.email, isActive: customers.isActive,
        createdAt: customers.createdAt,
      }).from(customers).where(eq(customers.orgId, ctx.orgId)).limit(input.limit).offset(input.offset);
      return result;
    }),

  get: authedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [c] = await ctx.db.select().from(customers)
      .where(and(eq(customers.id, input.id), eq(customers.orgId, ctx.orgId))).limit(1);
    if (!c) throw new TRPCError({ code: "NOT_FOUND" });
    const { passwordHash: _, ...safe } = c;
    const subs = await ctx.db.select().from(subscriptions).where(eq(subscriptions.customerId, c.id));
    return { ...safe, subscriptions: subs };
  }),

  create: adminProcedure.input(createCustomerSchema).mutation(async ({ ctx, input }) => {
    const code = await nextCustomerCode(ctx.db, ctx.orgId);
    const passwordHash = input.phone ? await hashPassword(input.phone.slice(-6)) : null;
    const [c] = await ctx.db.insert(customers).values({
      orgId: ctx.orgId, customerCode: code, fullName: input.fullName,
      phone: input.phone, email: input.email, address: input.address,
      nid: input.nid, notes: input.notes, referredBy: input.referredBy,
      ...(passwordHash ? { passwordHash } : {}),
    }).returning({ id: customers.id, customerCode: customers.customerCode, fullName: customers.fullName });
    return c;
  }),

  update: adminProcedure
    .input(z.object({
      id: z.string().uuid(), fullName: z.string().optional(), phone: z.string().optional(),
      email: z.string().email().optional(), address: z.string().optional(),
      nid: z.string().optional(), notes: z.string().optional(), isActive: z.boolean().optional(),
      telegramChatId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await ctx.db.update(customers).set({ ...data, updatedAt: new Date() })
        .where(and(eq(customers.id, id), eq(customers.orgId, ctx.orgId)));
      return { ok: true };
    }),

  delete: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(customers).where(and(eq(customers.id, input.id), eq(customers.orgId, ctx.orgId)));
    return { ok: true };
  }),

  getReferrals: authedProcedure.input(z.object({ customerId: z.string().uuid() })).query(async ({ ctx, input }) => {
    return ctx.db.select({
      id: customers.id, fullName: customers.fullName, phone: customers.phone,
      customerCode: customers.customerCode, createdAt: customers.createdAt,
    }).from(customers).where(and(eq(customers.referredBy, input.customerId), eq(customers.orgId, ctx.orgId)));
  }),
});
