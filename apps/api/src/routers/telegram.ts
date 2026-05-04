import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { telegramConfigs, alertLogs } from "@isp-nexus/db";
import { telegramConfigSchema } from "@isp-nexus/shared";
import { getBot } from "../services/telegram/bot.js";

export const telegramRouter = router({
  listConfigs: authedProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(telegramConfigs).where(eq(telegramConfigs.orgId, ctx.orgId));
  }),

  upsertConfig: adminProcedure.input(telegramConfigSchema).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db.select({ id: telegramConfigs.id }).from(telegramConfigs)
      .where(and(eq(telegramConfigs.chatId, input.chatId), eq(telegramConfigs.orgId, ctx.orgId))).limit(1);
    if (existing.length > 0) {
      await ctx.db.update(telegramConfigs).set({ ...input, updatedAt: new Date() })
        .where(eq(telegramConfigs.id, existing[0].id));
    } else {
      await ctx.db.insert(telegramConfigs).values({ orgId: ctx.orgId, ...input });
    }
    return { ok: true };
  }),

  deleteConfig: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(telegramConfigs).where(and(eq(telegramConfigs.id, input.id), eq(telegramConfigs.orgId, ctx.orgId)));
    return { ok: true };
  }),

  testAlert: adminProcedure.input(z.object({ chatId: z.string() })).mutation(async ({ ctx, input }) => {
    const bot = getBot();
    if (!bot) return { ok: false, error: "Bot not initialized" };
    await bot.api.sendMessage(input.chatId, "✅ ISP Nexus alert test — connection working!");
    return { ok: true };
  }),

  getBotStatus: authedProcedure.query(() => {
    const bot = getBot();
    return { running: !!bot };
  }),

  getAlerts: authedProcedure
    .input(z.object({ routerId: z.string().uuid().optional(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(alertLogs).where(eq(alertLogs.orgId, ctx.orgId)).limit(input.limit);
    }),
});
