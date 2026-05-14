import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { router, publicProcedure, adminProcedure, authedProcedure } from "../middleware.js";
import { appSettings, routers, alertLogs } from "@isp-nexus/db";
import { encryptText, decryptText } from "../lib/crypto.js";
import { logger } from "../lib/logger.js";

// AI Provider client
async function callAI(provider: string, apiKey: string, model: string, messages: any[]) {
  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 500 }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "No response";
  }
  
  if (provider === "claude") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, messages, max_tokens: 500 }),
    });
    if (!res.ok) throw new Error(`Claude error: ${res.status}`);
    const data = await res.json();
    return data.content?.[0]?.text ?? "No response";
  }
  
  if (provider === "kimi") {
    const res = await fetch("https://api.moonshot.cn/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, temperature: 0.7 }),
    });
    if (!res.ok) throw new Error(`Kimi error: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "No response";
  }
  
  throw new Error(`Unknown provider: ${provider}`);
}

// Get AI config for org
async function getAiConfig(db: any, orgId: string) {
  const rows = await db.select().from(appSettings)
    .where(and(eq(appSettings.orgId, orgId), eq(appSettings.key, "ai_config")))
    .limit(1);
  if (!rows[0]?.value) return null;
  try {
    const config = JSON.parse(rows[0].value);
    if (config.apiKey) config.apiKey = decryptText(config.apiKey);
    return config;
  } catch {
    return null;
  }
}

export const aiRouter = router({
  // Admin: Save AI config
  saveConfig: adminProcedure
    .input(z.object({
      provider: z.enum(["openai", "claude", "kimi"]),
      apiKey: z.string().min(10),
      model: z.string().min(1),
      enabled: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const encryptedKey = encryptText(input.apiKey);
      const config = JSON.stringify({
        provider: input.provider,
        apiKey: encryptedKey,
        model: input.model,
        enabled: input.enabled,
      });
      
      const existing = await ctx.db.select().from(appSettings)
        .where(and(eq(appSettings.orgId, ctx.orgId), eq(appSettings.key, "ai_config")))
        .limit(1);
      
      if (existing.length > 0) {
        await ctx.db.update(appSettings)
          .set({ value: config, updatedAt: new Date() })
          .where(eq(appSettings.id, existing[0].id));
      } else {
        await ctx.db.insert(appSettings).values({
          orgId: ctx.orgId,
          key: "ai_config",
          value: config,
          type: "json",
        });
      }
      
      return { ok: true };
    }),

  // Admin: Get AI config (without apiKey)
  getConfig: adminProcedure.query(async ({ ctx }) => {
    const config = await getAiConfig(ctx.db, ctx.orgId);
    if (!config) return null;
    return {
      provider: config.provider,
      model: config.model,
      enabled: config.enabled,
      // apiKey hidden for security
    };
  }),

  // Public: Chat with AI (customer support)
  chat: publicProcedure
    .input(z.object({
      orgId: z.string().uuid(),
      message: z.string().min(1).max(1000),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const config = await getAiConfig(ctx.db, input.orgId);
      if (!config || !config.enabled) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "AI support is not enabled" });
      }

      const systemPrompt = `You are Skynity ISP support assistant. Help customers with:
- Internet speed issues
- Package information
- Payment methods (bKash, Nagad, Rocket)
- Login/password help
- Router restart guidance
Be friendly, use Bengali/English mix. Keep answers short and helpful.`;

      const messages = [
        { role: "system", content: systemPrompt },
        ...(input.history ?? []).map((h: any) => ({ role: h.role, content: h.content })),
        { role: "user", content: input.message },
      ];

      try {
        const reply = await callAI(config.provider, config.apiKey, config.model, messages);
        return { reply };
      } catch (err: any) {
        logger.error({ err }, "AI chat failed");
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI service temporarily unavailable" });
      }
    }),

  // ── AI Incident Detection ────────────────────────────────────────────────
  detectAnomalies: adminProcedure.mutation(async ({ ctx }) => {
    const { runAnomalyDetection } = await import("../services/ai/incident-detector.js");
    const incidents = await runAnomalyDetection(ctx.orgId);
    return {
      detected: incidents.length,
      incidents,
      clusters: incidents.reduce<Record<string, number>>((acc, inc) => {
        acc[inc.type] = (acc[inc.type] ?? 0) + 1;
        return acc;
      }, {}),
    };
  }),

  // ── Recent incidents from alertLogs ─────────────────────────────────────
  recentIncidents: authedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const rows = await ctx.db
        .select()
        .from(alertLogs)
        .where(and(eq(alertLogs.orgId, ctx.orgId), gte(alertLogs.createdAt, since)))
        .orderBy(desc(alertLogs.createdAt))
        .limit(input.limit);
      const critical = rows.filter((r) => r.severity === "critical").length;
      const warning = rows.filter((r) => r.severity === "warning").length;
      return { rows, critical, warning, total: rows.length };
    }),

  // ── Customer Scoring ─────────────────────────────────────────────────────
  scoreCustomer: authedProcedure
    .input(z.object({ customerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { scoreCustomer } = await import("../services/ai/customer-scoring.js");
      const result = await scoreCustomer(input.customerId, ctx.orgId);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
      return result;
    }),

  churnRiskCustomers: adminProcedure.query(async ({ ctx }) => {
    const { getChurnRiskCustomers } = await import("../services/ai/customer-scoring.js");
    return getChurnRiskCustomers(ctx.orgId);
  }),

  scoreBoard: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      const { scoreAllCustomers } = await import("../services/ai/customer-scoring.js");
      return scoreAllCustomers(ctx.orgId, input.limit);
    }),

  // ── Package Recommendations ──────────────────────────────────────────────
  recommendPackage: authedProcedure
    .input(z.object({ customerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { recommendPackage } = await import("../services/ai/package-recommender.js");
      return recommendPackage(input.customerId, ctx.orgId);
    }),

  bulkRecommendations: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const { bulkRecommendations } = await import("../services/ai/package-recommender.js");
      return bulkRecommendations(ctx.orgId, input.limit);
    }),

  // ── Admin: AI-powered system analysis
  analyze: adminProcedure
    .input(z.object({ question: z.string().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const config = await getAiConfig(ctx.db, ctx.orgId);
      if (!config || !config.enabled) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "AI not configured" });
      }

      // Fetch system context
      const [router] = await ctx.db.select().from(routers)
        .where(and(eq(routers.orgId, ctx.orgId), eq(routers.isDefault, true)))
        .limit(1);

      const context = `ISP Nexus System Status:
- Router: ${router?.name ?? "N/A"} (${router ? (router.isActive ? "active" : "inactive") : "unknown"})
- Org ID: ${ctx.orgId}
- Question: ${input.question}`;

      const messages = [
        { role: "system", content: "You are ISP Nexus admin assistant. Analyze system issues and suggest fixes. Be concise." },
        { role: "user", content: context },
      ];

      try {
        const reply = await callAI(config.provider, config.apiKey, config.model, messages);
        return { reply };
      } catch (err: any) {
        logger.error({ err }, "AI analyze failed");
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI analysis failed" });
      }
    }),
});
