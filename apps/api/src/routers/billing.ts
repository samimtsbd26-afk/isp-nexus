import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { appSettings, organizations } from "@isp-nexus/db";

const BILLING_SETTINGS = [
  "billing_grace_days",
  "billing_late_fee_pct",
  "billing_auto_suspend",
  "billing_reminder_days",
] as const;

export const billingRouter = router({

  // ── Overdue list ──────────────────────────────────────────────────────────
  overdueCustomers: authedProcedure.query(async ({ ctx }) => {
    const { getOverdueCustomers } = await import("../services/billing/automation.js");
    return getOverdueCustomers(ctx.orgId);
  }),

  overdueInvoices: authedProcedure.query(async ({ ctx }) => {
    const { getOverdueInvoices } = await import("../services/billing/automation.js");
    return getOverdueInvoices(ctx.orgId);
  }),

  // ── Manual triggers ───────────────────────────────────────────────────────
  runReminders: adminProcedure.mutation(async ({ ctx }) => {
    const { sendOverdueReminders } = await import("../services/billing/automation.js");
    const count = await sendOverdueReminders(ctx.orgId);
    return { ok: true, count };
  }),

  runLateFees: adminProcedure.mutation(async ({ ctx }) => {
    const { applyLateFees } = await import("../services/billing/automation.js");
    const count = await applyLateFees(ctx.orgId);
    return { ok: true, count };
  }),

  runSuspend: adminProcedure
    .input(z.object({ graceDays: z.number().min(0).max(90).default(7) }))
    .mutation(async ({ ctx, input }) => {
      const { suspendUnpaidCustomers } = await import("../services/billing/automation.js");
      const count = await suspendUnpaidCustomers(ctx.orgId, input.graceDays);
      return { ok: true, count };
    }),

  runAll: adminProcedure.mutation(async ({ ctx }) => {
    const { runBillingCycle } = await import("../services/billing/automation.js");
    return runBillingCycle(ctx.orgId);
  }),

  // ── Settings ──────────────────────────────────────────────────────────────
  getSettings: authedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(appSettings)
      .where(and(
        eq(appSettings.orgId, ctx.orgId),
        eq(appSettings.key, "billing_grace_days"),
      ));
    const all = await ctx.db.select().from(appSettings)
      .where(eq(appSettings.orgId, ctx.orgId));
    const out: Record<string, string> = {
      billing_grace_days: "7",
      billing_late_fee_pct: "0",
      billing_auto_suspend: "false",
      billing_reminder_days: "3",
    };
    for (const row of all) {
      if (BILLING_SETTINGS.includes(row.key as any)) {
        out[row.key] = row.value ?? "";
      }
    }
    return out;
  }),

  saveSettings: adminProcedure
    .input(z.object({
      billing_grace_days: z.string().optional(),
      billing_late_fee_pct: z.string().optional(),
      billing_auto_suspend: z.string().optional(),
      billing_reminder_days: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      for (const [key, value] of Object.entries(input)) {
        if (value === undefined) continue;
        await ctx.db
          .insert(appSettings)
          .values({ orgId: ctx.orgId, key, value, type: "string" })
          .onConflictDoUpdate({ target: [appSettings.orgId, appSettings.key], set: { value, updatedAt: new Date() } });
      }
      return { ok: true };
    }),
});
