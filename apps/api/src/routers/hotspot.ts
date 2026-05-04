import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { hotspotTemplates, routers } from "@isp-nexus/db";
import { createHotspotTemplateSchema } from "@isp-nexus/shared";
import { decryptText } from "../lib/crypto.js";
import { env } from "../lib/env.js";
import { getMikroTikClient, type MikroTikApi } from "../services/mikrotik/client.js";

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

  deployTemplate: adminProcedure.input(z.object({ id: z.string().uuid(), routerId: z.string().uuid().optional() })).mutation(async ({ ctx, input }) => {
    const [tmpl] = await ctx.db.select().from(hotspotTemplates)
      .where(and(eq(hotspotTemplates.id, input.id), eq(hotspotTemplates.orgId, ctx.orgId))).limit(1);
    if (!tmpl) throw new TRPCError({ code: "NOT_FOUND" });

    const html = tmpl.htmlContent ?? buildDefaultHtml(tmpl);
    const css = tmpl.cssContent ?? buildDefaultCss(tmpl);
    const files = await buildHotspotFiles(tmpl, html, css);

    const [target] = await ctx.db.select().from(routers)
      .where(and(
        eq(routers.orgId, ctx.orgId),
        eq(routers.isActive, true),
        input.routerId ? eq(routers.id, input.routerId) : eq(routers.isDefault, true),
      ))
      .limit(1);
    if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Target router not found" });

    const password = decryptText(target.passwordEncrypted);
    const port = target.useSsl ? target.sslPort : target.port;
    const client = await getMikroTikClient({
      host: target.host,
      port,
      username: target.username,
      password,
      useSsl: target.useSsl,
    });

    try {
      const htmlDirectory = await getHotspotHtmlDirectory(client);
      for (const file of files) {
        await upsertRouterFile(client, `${htmlDirectory}/${file.name}`, file.name, file.contents);
      }
    } finally {
      await client.close();
    }

    return { ok: true, router: target.name, files: files.map((file) => file.name) };
  }),
});

const BINARY_ASSET_EXTENSIONS = new Set([".png", ".webp", ".jpg", ".jpeg", ".svg"]);

function isBinaryAsset(name: string) {
  const lower = name.toLowerCase();
  return Array.from(BINARY_ASSET_EXTENSIONS).some((ext) => lower.endsWith(ext));
}

function publicAssetBaseUrl() {
  return (env.API_URL || "https://api.skynity.org").replace(/\/$/, "");
}

async function upsertRouterFile(client: MikroTikApi, name: string, relativeName: string, contents: string | Buffer): Promise<void> {
  const existing = (await client.print("/file")).filter((file) => file.name === name);
  for (const file of existing) {
    const fileId = file[".id"] ?? file.id;
    if (fileId) await client.remove("/file", fileId);
  }
  await fetchRouterAsset(client, name, relativeName, Buffer.byteLength(contents));
}

async function fetchRouterAsset(client: MikroTikApi, name: string, relativeName: string, expectedSize: number): Promise<void> {
  const url = `${publicAssetBaseUrl()}/api/hotspot-assets/${relativeName.split("/").map(encodeURIComponent).join("/")}`;
  let lastSize = 0;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const existing = (await client.print("/file")).filter((file) => file.name === name);
    for (const file of existing) {
      const fileId = file[".id"] ?? file.id;
      if (fileId) await client.remove("/file", fileId);
    }
    await client.exec("/tool", "fetch", {
      url,
      "dst-path": name,
      mode: "https",
    });
    const [remote] = await client.print("/file", { name });
    lastSize = Number(remote?.size ?? 0);
    if (lastSize === expectedSize) return;
  }
  const kind = isBinaryAsset(relativeName) ? "Binary asset" : "Hotspot file";
  throw new Error(`${kind} upload failed for ${relativeName}: router size ${lastSize}, local size ${expectedSize}`);
}

async function getHotspotHtmlDirectory(client: MikroTikApi): Promise<string> {
  const [hotspot] = await client.print("/ip/hotspot");
  const profileName = hotspot?.profile;
  if (!profileName) return "hotspot";

  const [profile] = await client.print("/ip/hotspot/profile", { name: profileName });
  return profile?.htmlDirectory || "hotspot";
}

function buildHotspotFiles(
  tmpl: { title?: string | null; companyName?: string | null; primaryColor?: string | null; backgroundColor?: string | null },
  html: string,
  css: string,
): Promise<Array<{ name: string; contents: string | Buffer }>> {
  return buildProductionHotspotFiles().catch(() => buildGeneratedHotspotFiles(tmpl, html, css));
}

async function buildProductionHotspotFiles(): Promise<Array<{ name: string; contents: string | Buffer }>> {
  const here = dirname(fileURLToPath(import.meta.url));
  const hotspotDir = resolve(here, "../../../hotspot");
  const imageDir = resolve(hotspotDir, "img");
  const files: Array<{ name: string; contents: string | Buffer }> = [];
  const topLevel = await readdir(hotspotDir);
  for (const name of topLevel.filter((item) => /\.(html|css|js)$/i.test(item)).sort()) {
    files.push({ name, contents: await readFile(resolve(hotspotDir, name), "utf8") });
  }
  const images = await readdir(imageDir);
  for (const image of images) {
    files.push({ name: `img/${image}`, contents: await readFile(resolve(imageDir, image)) });
  }
  return files;
}

function buildGeneratedHotspotFiles(
  tmpl: { title?: string | null; companyName?: string | null; primaryColor?: string | null; backgroundColor?: string | null },
  html: string,
  css: string,
): Array<{ name: string; contents: string }> {
  const success = buildStatusPage(tmpl, "success", "Connected", "Your session is active.");
  const payment = buildStatusPage(tmpl, "payment", "Payment", "Select a package from the portal to activate internet.");
  const register = buildStatusPage(tmpl, "registration", "Registration", "Create an account from the ISP portal.");
  const logout = buildStatusPage(tmpl, "logout", "Logged out", "Your hotspot session has ended.");
  return [
    { name: "login.html", contents: injectStylesheet(html) },
    { name: "style.css", contents: css },
    { name: "status.html", contents: success },
    { name: "payment.html", contents: payment },
    { name: "register.html", contents: register },
    { name: "logout.html", contents: logout },
  ];
}

function injectStylesheet(html: string): string {
  const stylesheet = '<link rel="stylesheet" href="style.css"/>';
  const normalized = html.replace(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi, stylesheet);
  if (/^\s*<!doctype|^\s*<html/i.test(normalized)) {
    if (normalized.includes("style.css")) return normalized;
    return normalized.replace("</head>", `  ${stylesheet}\n</head>`);
  }
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  ${stylesheet}
</head>
<body>
${normalized}
</body>
</html>`;
}

function buildDefaultCss(tmpl: { primaryColor?: string | null; backgroundColor?: string | null }): string {
  const primary = tmpl.primaryColor ?? "#3b82f6";
  const bg = tmpl.backgroundColor ?? "#0f172a";
  return `:root{color-scheme:dark;--primary:${primary};--bg:${bg}}body{background:var(--bg);color:#e5e7eb}`;
}

function buildStatusPage(
  tmpl: { companyName?: string | null; primaryColor?: string | null; backgroundColor?: string | null },
  page: string,
  title: string,
  body: string,
): string {
  const primary = tmpl.primaryColor ?? "#3b82f6";
  const bg = tmpl.backgroundColor ?? "#0f172a";
  const company = tmpl.companyName ?? "ISP Nexus";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${company} ${title}</title>
  <link rel="stylesheet" href="style.css"/>
</head>
<body style="min-height:100vh;display:grid;place-items:center;background:${bg};font-family:system-ui,sans-serif;margin:0;color:#e5e7eb">
  <main style="width:min(420px,calc(100vw - 32px));border:1px solid ${primary}55;border-radius:18px;padding:28px;background:rgba(15,23,42,.92);box-shadow:0 24px 60px rgba(0,0,0,.35)">
    <p style="margin:0 0 8px;color:${primary};font-weight:800">${company}</p>
    <h1 style="margin:0 0 10px;font-size:26px">${title}</h1>
    <p style="margin:0 0 22px;color:#94a3b8">${body}</p>
    ${page === "logout" ? '<a href="$(link-login)" style="display:block;text-align:center;padding:12px 16px;border-radius:10px;background:' + primary + ';color:white;text-decoration:none;font-weight:700">Login again</a>' : ""}
  </main>
</body>
</html>`;
}

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
