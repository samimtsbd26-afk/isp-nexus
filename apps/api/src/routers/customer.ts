import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, like, desc, sql, isNull } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { customers, subscriptions, orders, appSettings, activityLog } from "@isp-nexus/db";
import { createCustomerSchema } from "@isp-nexus/shared";
import { hashPassword } from "../lib/crypto.js";
import { logActivity } from "../lib/activity.js";

/**
 * Generate the next customer code from the database.
 * Uses an `app_settings` row with key='customer_counter' to persist
 * the counter across server restarts, avoiding ID collisions.
 */
export async function nextCustomerCode(db: any, orgId: string): Promise<string> {
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
    .input(z.object({ 
      search: z.string().optional(), 
      limit: z.number().default(50), 
      offset: z.number().default(0),
      filter: z.enum(["active", "suspended", "expired", "deleted", "trial", "all"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [eq(customers.orgId, ctx.orgId)];
      
      if (input.filter === "deleted") {
        conditions.push(sql`${customers.deletedAt} IS NOT NULL`);
      } else if (input.filter === "active") {
        conditions.push(eq(customers.isActive, true));
        conditions.push(isNull(customers.deletedAt));
      } else if (input.filter === "suspended") {
        conditions.push(eq(customers.isActive, false));
        conditions.push(isNull(customers.deletedAt));
      } else if (input.filter === "all") {
        // no extra filter
      } else {
        // default: show non-deleted
        conditions.push(isNull(customers.deletedAt));
      }
      
      if (input.search) {
        conditions.push(
          sql`(${customers.fullName} ILIKE ${`%${input.search}%`} OR ${customers.phone} ILIKE ${`%${input.search}%`})`
        );
      }
      
      const result = await ctx.db.select({
        id: customers.id, customerCode: customers.customerCode, fullName: customers.fullName,
        phone: customers.phone, email: customers.email, address: customers.address,
        nid: customers.nid, telegramChatId: customers.telegramChatId, referredBy: customers.referredBy,
        createdBy: customers.createdBy, isActive: customers.isActive,
        deletedAt: customers.deletedAt, deletedBy: customers.deletedBy, deleteReason: customers.deleteReason,
        createdAt: customers.createdAt, updatedAt: customers.updatedAt,
      }).from(customers).where(and(...conditions)).limit(input.limit).offset(input.offset);
      return result;
    }),

  get: authedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [c] = await ctx.db.select().from(customers)
      .where(and(eq(customers.id, input.id), eq(customers.orgId, ctx.orgId))).limit(1);
    if (!c) throw new TRPCError({ code: "NOT_FOUND" });
    const { passwordHash: _, ...safe } = c;
    const subs = await ctx.db.select().from(subscriptions).where(eq(subscriptions.customerId, c.id));
    const ords = await ctx.db.select().from(orders).where(eq(orders.customerId, c.id)).orderBy(desc(orders.createdAt));
    const logs = await ctx.db.select().from(activityLog)
      .where(and(eq(activityLog.orgId, ctx.orgId), eq(activityLog.entityId, c.id)))
      .orderBy(desc(activityLog.createdAt))
      .limit(50);
    return { ...safe, subscriptions: subs, orders: ords, activityLogs: logs };
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
    
    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "create", "customer", c.id, { fullName: input.fullName, phone: input.phone });
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
      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "update", "customer", id, data);
      return { ok: true };
    }),

  delete: adminProcedure.input(z.object({ id: z.string().uuid(), reason: z.string().optional() })).mutation(async ({ ctx, input }) => {
    const [customer] = await ctx.db.select({ id: customers.id, fullName: customers.fullName, phone: customers.phone }).from(customers)
      .where(and(eq(customers.id, input.id), eq(customers.orgId, ctx.orgId))).limit(1);
    if (!customer) throw new TRPCError({ code: "NOT_FOUND" });
    
    // Soft delete only
    await ctx.db.update(customers).set({
      deletedAt: new Date(),
      deletedBy: ctx.user?.id,
      deleteReason: input.reason ?? null,
      isActive: false,
      updatedAt: new Date(),
    }).where(and(eq(customers.id, input.id), eq(customers.orgId, ctx.orgId)));
    
    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "delete", "customer", input.id, { reason: input.reason, fullName: customer.fullName });
    return { ok: true };
  }),

  restore: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const [customer] = await ctx.db.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.id), eq(customers.orgId, ctx.orgId), sql`${customers.deletedAt} IS NOT NULL`)).limit(1);
    if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found or not deleted" });
    
    await ctx.db.update(customers).set({
      deletedAt: null,
      deletedBy: null,
      deleteReason: null,
      isActive: true,
      updatedAt: new Date(),
    }).where(and(eq(customers.id, input.id), eq(customers.orgId, ctx.orgId)));
    
    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "restore", "customer", input.id, {});
    return { ok: true };
  }),

  permanentDelete: adminProcedure.input(z.object({ id: z.string().uuid(), confirm: z.literal("PERMANENT_DELETE") })).mutation(async ({ ctx, input }) => {
    const [customer] = await ctx.db.select({ id: customers.id, fullName: customers.fullName }).from(customers)
      .where(and(eq(customers.id, input.id), eq(customers.orgId, ctx.orgId))).limit(1);
    if (!customer) throw new TRPCError({ code: "NOT_FOUND" });
    
    // Get all related data for cleanup
    const subs = await ctx.db.select().from(subscriptions).where(eq(subscriptions.customerId, input.id));
    const ords = await ctx.db.select().from(orders).where(eq(orders.customerId, input.id));
    
    // TODO: Remove from MikroTik (Phase 2)
    
    // Hard delete subscriptions
    for (const sub of subs) {
      await ctx.db.delete(subscriptions).where(eq(subscriptions.id, sub.id));
    }
    
    // Hard delete orders (invoices cascade via FK)
    for (const ord of ords) {
      await ctx.db.delete(orders).where(eq(orders.id, ord.id));
    }
    
    // Hard delete customer
    await ctx.db.delete(customers).where(and(eq(customers.id, input.id), eq(customers.orgId, ctx.orgId)));
    
    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "permanent_delete", "customer", input.id, { fullName: customer.fullName });
    return { ok: true };
  }),

  getReferrals: authedProcedure.input(z.object({ customerId: z.string().uuid() })).query(async ({ ctx, input }) => {
    return ctx.db.select({
      id: customers.id, fullName: customers.fullName, phone: customers.phone,
      customerCode: customers.customerCode, createdAt: customers.createdAt,
    }).from(customers).where(and(eq(customers.referredBy, input.customerId), eq(customers.orgId, ctx.orgId), isNull(customers.deletedAt)));
  }),
});
