import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { router, authedProcedure, adminProcedure, publicProcedure } from "../middleware.js";
import { appSettings, paymentConfigs, smsLogs } from "@isp-nexus/db";
import { desc } from "drizzle-orm";
import { logActivity } from "../lib/activity.js";

const SMS_PROVIDERS = ["ssl_wireless", "bulksmsbd", "greenwebbd", "disabled"] as const;
type SmsProvider = typeof SMS_PROVIDERS[number];

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
    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "update", "setting", ctx.orgId, { key: input.key });
    return { ok: true };
  }),

  setBulk: adminProcedure
    .input(z.array(z.object({ key: z.string(), value: z.string() })))
    .mutation(async ({ ctx, input }) => {
      for (const { key, value } of input) {
        const existing = await ctx.db.select({ id: appSettings.id }).from(appSettings)
          .where(and(eq(appSettings.orgId, ctx.orgId), eq(appSettings.key, key))).limit(1);
        if (existing.length > 0) {
          await ctx.db.update(appSettings).set({ value, updatedAt: new Date() }).where(eq(appSettings.id, existing[0].id));
        } else {
          await ctx.db.insert(appSettings).values({ orgId: ctx.orgId, key, value });
        }
      }
      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "update", "settings_bulk", ctx.orgId, { keys: input.map((i) => i.key) });
      return { ok: true };
    }),

  listAll: authedProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(appSettings).where(eq(appSettings.orgId, ctx.orgId));
  }),

  // ── Payment configs ───────────────────────────────────────────────────────

  listPaymentConfigs: authedProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(paymentConfigs).where(eq(paymentConfigs.orgId, ctx.orgId));
  }),

  // Public: portal payment page fetches this to show correct numbers
  publicPaymentConfigs: publicProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select({
        method: paymentConfigs.method,
        accountNumber: paymentConfigs.accountNumber,
        accountType: paymentConfigs.accountType,
        instructions: paymentConfigs.instructions,
      }).from(paymentConfigs)
        .where(and(eq(paymentConfigs.orgId, input.orgId), eq(paymentConfigs.isActive, true)));
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
    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "update", "payment_config", ctx.orgId, { method: input.method });
    return { ok: true };
  }),

  deletePaymentConfig: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(paymentConfigs)
      .where(and(eq(paymentConfigs.id, input.id), eq(paymentConfigs.orgId, ctx.orgId)));
    return { ok: true };
  }),

  // ── SMS config ────────────────────────────────────────────────────────────

  getSmsConfig: authedProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.select({ key: appSettings.key, value: appSettings.value })
      .from(appSettings).where(eq(appSettings.orgId, ctx.orgId));
    const get = (key: string) => settings.find((s) => s.key === key)?.value ?? "";
    return {
      provider: get("sms_provider") as SmsProvider | "",
      apiKey: get("sms_api_key"),
      apiUser: get("sms_api_user"),
      senderId: get("sms_sender_id"),
      whatsappNumber: get("whatsapp_support"),
    };
  }),

  getSmsLogs: authedProcedure
    .input(z.object({ limit: z.number().default(50), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const conditions: ReturnType<typeof eq>[] = [eq(smsLogs.orgId, ctx.orgId)];
      if (input.status) conditions.push(eq(smsLogs.status, input.status));
      return ctx.db.select().from(smsLogs).where(and(...conditions))
        .orderBy(desc(smsLogs.createdAt)).limit(input.limit);
    }),

  setSmsConfig: adminProcedure.input(z.object({
    provider: z.enum(SMS_PROVIDERS),
    apiKey: z.string(),
    apiUser: z.string().optional(),
    senderId: z.string().optional(),
    whatsappNumber: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const pairs: Array<{ key: string; value: string }> = [
      { key: "sms_provider", value: input.provider },
      { key: "sms_api_key", value: input.apiKey },
      { key: "sms_api_user", value: input.apiUser ?? "" },
      { key: "sms_sender_id", value: input.senderId ?? "SKYNITY" },
      ...(input.whatsappNumber !== undefined ? [{ key: "whatsapp_support", value: input.whatsappNumber }] : []),
    ];
    for (const { key, value } of pairs) {
      const existing = await ctx.db.select({ id: appSettings.id }).from(appSettings)
        .where(and(eq(appSettings.orgId, ctx.orgId), eq(appSettings.key, key))).limit(1);
      if (existing.length > 0) {
        await ctx.db.update(appSettings).set({ value, updatedAt: new Date() }).where(eq(appSettings.id, existing[0].id));
      } else {
        await ctx.db.insert(appSettings).values({ orgId: ctx.orgId, key, value });
      }
    }
    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "update", "sms_config", ctx.orgId, { provider: input.provider });
    return { ok: true };
  }),
});
