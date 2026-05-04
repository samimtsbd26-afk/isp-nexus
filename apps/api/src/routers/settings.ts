import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { appSettings, paymentConfigs } from "@isp-nexus/db";

export const settingsRouter = router({
  get: authedProcedure.input(z.object({ key: z.string() })).query(async ({ ctx, input }) => {
    const [s] = await ctx.db.select().from(appSettings)
      .where(and(eq(appSettings.orgId, ctx.orgId), eq(appSettings.key, input.key))).limit(1);
    return s?.value ?? null;
  }),

  set: adminProcedure.input(z.object({ key: z.string(), value: z.string() })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db.select({ id: appSettings.id }).from(appSettings)
      .where(and(eq(appSettings.orgId, ctx.orgId), eq(appSettings.key, input.key))).limit(1);
    if (existing.length > 0) {
      await ctx.db.update(appSettings).set({ value: input.value, updatedAt: new Date() })
        .where(eq(appSettings.id, existing[0].id));
    } else {
      await ctx.db.insert(appSettings).values({ orgId: ctx.orgId, key: input.key, value: input.value });
    }
    return { ok: true };
  }),

  listAll: authedProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(appSettings).where(eq(appSettings.orgId, ctx.orgId));
  }),

  listPaymentConfigs: authedProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(paymentConfigs).where(eq(paymentConfigs.orgId, ctx.orgId));
  }),

  upsertPaymentConfig: adminProcedure.input(z.object({
    method: z.enum(["bkash", "nagad", "rocket", "cash", "bank", "free"]),
    accountNumber: z.string(),
    accountType: z.string().optional(),
    instructions: z.string().optional(),
    isActive: z.boolean().default(true),
  })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db.select({ id: paymentConfigs.id }).from(paymentConfigs)
      .where(and(eq(paymentConfigs.orgId, ctx.orgId), eq(paymentConfigs.method, input.method as any))).limit(1);

    if (existing.length > 0) {
      await ctx.db.update(paymentConfigs).set({
        accountNumber: input.accountNumber,
        accountType: input.accountType,
        instructions: input.instructions,
        isActive: input.isActive,
      }).where(eq(paymentConfigs.id, existing[0].id));
    } else {
      await ctx.db.insert(paymentConfigs).values({
        orgId: ctx.orgId,
        method: input.method as any,
        accountNumber: input.accountNumber,
        accountType: input.accountType,
        instructions: input.instructions,
        isActive: input.isActive,
      });
    }
    return { ok: true };
  }),

  deletePaymentConfig: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(paymentConfigs)
      .where(and(eq(paymentConfigs.id, input.id), eq(paymentConfigs.orgId, ctx.orgId)));
    return { ok: true };
  }),
});
