import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { hotspotTemplates } from "@isp-nexus/db";
import { createHotspotTemplateSchema } from "@isp-nexus/shared";

export const hotspotRouter = router({
  listTemplates: authedProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(hotspotTemplates).where(eq(hotspotTemplates.orgId, ctx.orgId));
  }),

  getDefaultTemplate: authedProcedure.query(async ({ ctx }) => {
    const [tmpl] = await ctx.db.select().from(hotspotTemplates)
      .where(and(eq(hotspotTemplates.orgId, ctx.orgId), eq(hotspotTemplates.isDefault, true)))
      .limit(1);
    return tmpl ?? null;
  }),

  createTemplate: adminProcedure.input(createHotspotTemplateSchema).mutation(async ({ ctx, input }) => {
    if (input.isDefault) {
      await ctx.db.update(hotspotTemplates)
        .set({ isDefault: false })
        .where(eq(hotspotTemplates.orgId, ctx.orgId));
    }
    const [tmpl] = await ctx.db.insert(hotspotTemplates)
      .values({ orgId: ctx.orgId, ...input })
      .returning();
    return tmpl;
  }),

  updateTemplate: adminProcedure
    .input(z.object({ id: z.string().uuid() }).merge(createHotspotTemplateSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      if (data.isDefault) {
        await ctx.db.update(hotspotTemplates)
          .set({ isDefault: false })
          .where(eq(hotspotTemplates.orgId, ctx.orgId));
      }
      await ctx.db.update(hotspotTemplates)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(hotspotTemplates.id, id), eq(hotspotTemplates.orgId, ctx.orgId)));
      return { ok: true };
    }),

  deleteTemplate: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(hotspotTemplates)
      .where(and(eq(hotspotTemplates.id, input.id), eq(hotspotTemplates.orgId, ctx.orgId)));
    return { ok: true };
  }),

  deployTemplate: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const [tmpl] = await ctx.db.select().from(hotspotTemplates)
      .where(and(eq(hotspotTemplates.id, input.id), eq(hotspotTemplates.orgId, ctx.orgId))).limit(1);
    if (!tmpl) throw new TRPCError({ code: "NOT_FOUND" });

    const html = tmpl.htmlContent ?? buildDefaultHtml(tmpl);
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { resolve } = await import("node:path");

    const hotspotDir = resolve(process.cwd(), "../../apps/hotspot");
    mkdirSync(hotspotDir, { recursive: true });
    writeFileSync(resolve(hotspotDir, "login.html"), html, "utf8");
    if (tmpl.cssContent) {
      writeFileSync(resolve(hotspotDir, "style.css"), tmpl.cssContent, "utf8");
    }
    return { ok: true, path: hotspotDir };
  }),
});

function buildDefaultHtml(tmpl: { title?: string | null; companyName?: string | null; primaryColor?: string | null; backgroundColor?: string | null }): string {
  const primary = tmpl.primaryColor ?? "#3b82f6";
  const bg = tmpl.backgroundColor ?? "#0f172a";
  const company = tmpl.companyName ?? "ISP Nexus";
  const title = tmpl.title ?? `${company} WiFi`;

  return `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:linear-gradient(135deg,${bg} 0%,${primary}22 100%);
      font-family:system-ui,sans-serif;padding:1rem}
    .card{background:rgba(30,41,59,0.95);border:1px solid ${primary}44;
      border-radius:1rem;padding:2rem;width:100%;max-width:380px;
      box-shadow:0 25px 50px rgba(0,0,0,0.5)}
    .logo{font-size:1.5rem;font-weight:800;color:${primary};margin-bottom:.25rem}
    label{display:block;font-size:.75rem;font-weight:500;color:#cbd5e1;margin-bottom:.375rem}
    input{width:100%;background:#1e293b;border:1px solid #334155;border-radius:.5rem;
      padding:.625rem .875rem;font-size:.875rem;color:#e2e8f0;outline:none;margin-bottom:1rem}
    input:focus{border-color:${primary}}
    button{width:100%;background:${primary};color:#fff;border:none;border-radius:.5rem;
      padding:.75rem;font-size:.875rem;font-weight:600;cursor:pointer}
    .err{color:#f87171;font-size:.8rem;margin-bottom:1rem;padding:.5rem .75rem;
      background:rgba(248,113,113,.1);border-radius:.375rem;border:1px solid rgba(248,113,113,.3)}
    .footer{text-align:center;margin-top:1rem;font-size:.75rem;color:#64748b}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🌐 ${company}</div>
    <p style="color:#94a3b8;font-size:.875rem;margin-bottom:1.5rem">WiFi Login</p>
    \$(if error)<div class="err">\$(error)</div>\$(endif)
    <form action="\$(link-login-only)" method="post">
      <input type="hidden" name="dst" value="\$(link-orig)"/>
      <div><label>Username</label><input type="text" name="username" placeholder="Enter username"/></div>
      <div><label>Password</label><input type="password" name="password" placeholder="Enter password"/></div>
      <button type="submit">Connect</button>
    </form>
    <p class="footer">Powered by ${company}</p>
  </div>
</body>
</html>`;
}
