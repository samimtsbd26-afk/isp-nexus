import { useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Code2, Eye, MonitorSmartphone, Plus, RotateCcw, Save, Smartphone, SunMoon, Trash2, Upload } from "lucide-react";
import { Card, CardContent, Button, Badge, Modal, Input, Empty, Select } from "../components/ui/index";

const EMPTY = { name: "", title: "", companyName: "", logoUrl: "", primaryColor: "#3b82f6", backgroundColor: "#0f172a", htmlContent: "", cssContent: "", isDefault: false };
const DEFAULT_PACKAGES = [
  { name: "Mini 10", code: "mini10", price: "50", speed: "3M/3M", days: "10", devices: "1" },
  { name: "Mini 15", code: "mini15", price: "70", speed: "3M/3M", days: "15", devices: "1" },
  { name: "Mini 20", code: "mini20", price: "90", speed: "3M/3M", days: "20", devices: "1" },
  { name: "Basic", code: "basic", price: "100", speed: "3M/3M", days: "30", devices: "1" },
  { name: "Pro", code: "pro", price: "150", speed: "5M/5M", days: "30", devices: "1" },
  { name: "Ultra", code: "ultra", price: "500", speed: "15M/15M", days: "30", devices: "4" },
];
const EDITOR_EMPTY = {
  ...EMPTY,
  backgroundUrl: "",
  heroUrl: "",
  trialBanner: "7 Days Free Trial",
  whatsappLink: "https://wa.me/8801811871332",
  telegramLink: "https://t.me/shamimkhan313",
  paymentNumber: "01811871332",
  englishText: "NEXT GEN INTERNET",
  banglaText: "নেক্সট জেন ইন্টারনেট",
  packages: DEFAULT_PACKAGES,
};

export default function HotspotTemplates() {
  const { data, refetch, isLoading } = trpc.hotspot.listTemplates.useQuery();
  const { data: routers } = trpc.routerMgmt.list.useQuery();
  const [showAdd, setShowAdd] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [form, setForm] = useState(EDITOR_EMPTY);
  const [routerId, setRouterId] = useState("");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [previewTheme, setPreviewTheme] = useState<"dark" | "light">("dark");
  const selectedRouter = routerId || routers?.find((router) => router.isDefault)?.id || routers?.[0]?.id || "";

  const create = trpc.hotspot.createTemplate.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(EDITOR_EMPTY); toast.success("Template created"); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.hotspot.updateTemplate.useMutation({
    onSuccess: () => { refetch(); toast.success("Template saved"); },
    onError: (e) => toast.error(e.message),
  });
  const deploy = trpc.hotspot.deployTemplate.useMutation({
    onSuccess: (d) => toast.success(`Published to ${d.router}`),
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.hotspot.deleteTemplate.useMutation({
    onSuccess: () => { refetch(); toast.success("Template deleted"); },
  });

  const previewTmpl = data?.find((t) => t.id === previewId);
  const previewHtml = previewTmpl ? buildPreviewHtml(previewTmpl, previewTheme) : "";

  function field(key: keyof typeof form, label: string, id: string) {
    return (
      <div>
        <label htmlFor={id} className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
        <Input id={id} value={String(form[key])} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Hotspot Templates</h1>
          <p className="text-muted-foreground text-sm">Custom WiFi login page designs</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select title="Publish router" value={selectedRouter} onChange={(e) => setRouterId(e.target.value)} className="w-48">
            {routers?.map((router) => <option key={router.id} value={router.id}>{router.name}</option>)}
          </Select>
          <Button size="sm" onClick={() => { setForm({ ...EDITOR_EMPTY, ...starterTemplate(EDITOR_EMPTY) }); setShowAdd(true); }}><Plus size={14} /> New Template</Button>
        </div>
      </div>

      {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((t) => (
          <Card key={t.id} className={t.isDefault ? "border-blue-500/40" : ""}>
            {/* Color preview bar */}
            <div className="h-2 rounded-t-xl" style={{ background: `linear-gradient(to right, ${t.primaryColor ?? "#3b82f6"}, ${t.backgroundColor ?? "#0f172a"})` }} />
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.companyName ?? "No company name"}</p>
                </div>
                {t.isDefault ? <Badge variant="info">Default</Badge> : null}
              </div>

              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded border border-border" style={{ background: t.primaryColor ?? "#3b82f6" }} />
                <span className="text-xs text-muted-foreground">{t.primaryColor}</span>
                <div className="w-5 h-5 rounded border border-border ml-2" style={{ background: t.backgroundColor ?? "#0f172a" }} />
                <span className="text-xs text-muted-foreground">{t.backgroundColor}</span>
              </div>

              <div className="flex gap-2 pt-1 border-t border-border">
                <Button size="sm" variant="outline" className="flex-1"
                  onClick={() => setPreviewId(t.id)}>
                  <Eye size={13} /> Preview
                </Button>
                <Button size="sm" variant="outline"
                  onClick={() => create.mutate(sanitizeTemplatePayload({ ...cloneTemplate(t), name: `${t.name} ${new Date().toISOString().slice(0, 10)}` }))}
                  title="Save version">
                  <Save size={13} />
                </Button>
                <Button size="sm" variant="secondary"
                  disabled={deploy.isPending || !selectedRouter}
                  onClick={() => deploy.mutate({ id: t.id, routerId: selectedRouter })}
                  title="Publish to MikroTik hotspot">
                  <Upload size={13} />
                </Button>
                <Button size="sm" variant="ghost"
                  onClick={() => { if (globalThis.confirm(`Delete "${t.name}"?`)) del.mutate({ id: t.id }); }}>
                  <Trash2 size={13} className="text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && !data?.length && (
          <div className="col-span-3">
            <Card><CardContent className="py-16"><Empty message="No templates — create your first hotspot login page" /></CardContent></Card>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Create Hotspot Template" className="max-w-6xl max-h-[92vh] overflow-auto">
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(sanitizeTemplatePayload({ ...form, ...starterTemplate(form) })); }} className="space-y-3">
          <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {field("name", "Template Name *", "ht-name")}
                {field("companyName", "Company Name", "ht-company")}
              </div>
              {field("title", "Page Title", "ht-title")}
              <div>
                <label htmlFor="ht-logo" className="block text-xs font-medium text-muted-foreground mb-1.5">Logo Upload</label>
                <Input id="ht-logo" type="file" accept="image/*" onChange={(e) => handleLogoUpload(e.currentTarget.files?.[0], setForm, form)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ht-bg-upload" className="block text-xs font-medium text-muted-foreground mb-1.5">Background Upload</label>
                  <Input id="ht-bg-upload" type="file" accept="image/*" onChange={(e) => handleImageUpload(e.currentTarget.files?.[0], "backgroundUrl", setForm, form)} />
                </div>
                <div>
                  <label htmlFor="ht-hero-upload" className="block text-xs font-medium text-muted-foreground mb-1.5">Hero Image Upload</label>
                  <Input id="ht-hero-upload" type="file" accept="image/*" onChange={(e) => handleImageUpload(e.currentTarget.files?.[0], "heroUrl", setForm, form)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input value={form.trialBanner} onChange={(e) => setForm({ ...form, trialBanner: e.target.value })} placeholder="Trial banner" />
                <Input value={form.paymentNumber} onChange={(e) => setForm({ ...form, paymentNumber: e.target.value })} placeholder="Payment number" />
                <Input value={form.whatsappLink} onChange={(e) => setForm({ ...form, whatsappLink: e.target.value })} placeholder="WhatsApp link" />
                <Input value={form.telegramLink} onChange={(e) => setForm({ ...form, telegramLink: e.target.value })} placeholder="Telegram link" />
                <Input value={form.englishText} onChange={(e) => setForm({ ...form, englishText: e.target.value })} placeholder="English headline" />
                <Input value={form.banglaText} onChange={(e) => setForm({ ...form, banglaText: e.target.value })} placeholder="Bengali headline" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ht-primary" className="block text-xs font-medium text-muted-foreground mb-1.5">Primary Color</label>
                  <div className="flex gap-2">
                    <input id="ht-primary" type="color" value={form.primaryColor}
                      onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                      className="h-9 w-12 rounded border border-input bg-transparent cursor-pointer" />
                    <Input value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} className="flex-1" />
                  </div>
                </div>
                <div>
                  <label htmlFor="ht-bg" className="block text-xs font-medium text-muted-foreground mb-1.5">Background Color</label>
                  <div className="flex gap-2">
                    <input id="ht-bg" type="color" value={form.backgroundColor}
                      onChange={(e) => setForm({ ...form, backgroundColor: e.target.value })}
                      className="h-9 w-12 rounded border border-input bg-transparent cursor-pointer" />
                    <Input value={form.backgroundColor} onChange={(e) => setForm({ ...form, backgroundColor: e.target.value })} className="flex-1" />
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="accent-blue-500" checked={form.isDefault}
                  onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
                <span>Set as default template</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => setForm({ ...form, ...starterTemplate(form) })}><Code2 size={14} /> Generate Pages</Button>
                <Button type="button" variant="outline" onClick={() => { localStorage.setItem("hotspotTemplateDraft", JSON.stringify(form)); toast.success("Draft saved"); }}><Save size={14} /> Save Draft</Button>
                <Button type="button" variant="outline" onClick={() => setForm(JSON.parse(localStorage.getItem("hotspotTemplateDraft") || "null") || { ...EDITOR_EMPTY, ...starterTemplate(EDITOR_EMPTY) })}><RotateCcw size={14} /> Rollback</Button>
                <Button type="button" variant="outline" onClick={() => setForm({ ...EDITOR_EMPTY, ...starterTemplate(EDITOR_EMPTY) })}>Reset</Button>
              </div>
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Packages</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, packages: [...form.packages, { name: "New", code: "new", price: "0", speed: "3M/3M", days: "30", devices: "1" }] })}><Plus size={13} /> Add</Button>
                </div>
                {form.packages.map((pkg, index) => (
                  <div key={`${pkg.code}-${index}`} className="grid grid-cols-[1fr_64px_72px_52px_42px_32px] gap-1">
                    {(["name", "price", "speed", "days", "devices"] as const).map((key) => (
                      <Input key={key} value={pkg[key]} onChange={(e) => {
                        const packages = form.packages.slice();
                        packages[index] = { ...pkg, [key]: e.target.value, code: key === "name" ? e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "") : pkg.code };
                        setForm({ ...form, packages });
                      }} />
                    ))}
                    <Button type="button" size="icon" variant="ghost" onClick={() => setForm({ ...form, packages: form.packages.filter((_, i) => i !== index) })}><Trash2 size={13} /></Button>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3 min-w-0">
              <div>
                <label htmlFor="ht-html" className="block text-xs font-medium text-muted-foreground mb-1.5">HTML / JS Editor</label>
                <textarea id="ht-html" value={form.htmlContent} onChange={(e) => setForm({ ...form, htmlContent: e.target.value })} className="min-h-[260px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
              <div>
                <label htmlFor="ht-css" className="block text-xs font-medium text-muted-foreground mb-1.5">CSS Editor</label>
                <textarea id="ht-css" value={form.cssContent} onChange={(e) => setForm({ ...form, cssContent: e.target.value })} className="min-h-[160px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Live Preview</span>
                  <div className="flex gap-1">
                    <Button type="button" size="icon" variant={previewMode === "desktop" ? "secondary" : "ghost"} onClick={() => setPreviewMode("desktop")} title="Desktop preview"><MonitorSmartphone size={14} /></Button>
                    <Button type="button" size="icon" variant={previewMode === "mobile" ? "secondary" : "ghost"} onClick={() => setPreviewMode("mobile")} title="Mobile preview"><Smartphone size={14} /></Button>
                    <Button type="button" size="icon" variant="ghost" onClick={() => setPreviewTheme(previewTheme === "dark" ? "light" : "dark")} title="Toggle dark/light preview"><SunMoon size={14} /></Button>
                  </div>
                </div>
                <iframe title="Hotspot live preview" srcDoc={buildPreviewHtml(form, previewTheme)} className={`${previewMode === "mobile" ? "mx-auto h-[520px] w-[320px]" : "h-[420px] w-full"} rounded-md border border-border bg-white`} />
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create Template"}</Button>
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>

      {/* Preview Modal */}
      <Modal open={!!previewId} onClose={() => setPreviewId(null)} title={`Preview: ${previewTmpl?.name}`} className="max-w-sm">
        {previewTmpl && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => update.mutate({ ...sanitizeTemplatePayload(cloneTemplate(previewTmpl)), id: previewTmpl.id, isDefault: true })}><RotateCcw size={13} /> Rollback Default</Button>
              <Button size="sm" disabled={deploy.isPending || !selectedRouter} onClick={() => deploy.mutate({ id: previewTmpl.id, routerId: selectedRouter })}><Upload size={13} /> Publish</Button>
            </div>
            <iframe title="Hotspot template preview" srcDoc={previewHtml} className="h-[520px] w-full rounded-lg border border-border bg-white" />
          </div>
        )}
      </Modal>
    </div>
  );
}

function cloneTemplate(t: any) {
  return {
    name: t.name,
    title: t.title ?? "",
    companyName: t.companyName ?? "",
    logoUrl: t.logoUrl ?? "",
    primaryColor: t.primaryColor ?? "#3b82f6",
    backgroundColor: t.backgroundColor ?? "#0f172a",
    htmlContent: t.htmlContent ?? "",
    cssContent: t.cssContent ?? "",
    isDefault: Boolean(t.isDefault),
  };
}

function sanitizeTemplatePayload(template: any) {
  const logoUrl = /^https?:\/\//i.test(template.logoUrl) || /^data:image\//i.test(template.logoUrl) ? template.logoUrl : undefined;
  return {
    name: template.name,
    title: template.title,
    companyName: template.companyName,
    logoUrl,
    primaryColor: template.primaryColor,
    backgroundColor: template.backgroundColor,
    htmlContent: template.htmlContent,
    cssContent: template.cssContent,
    isDefault: Boolean(template.isDefault),
  };
}

function starterTemplate(base: any) {
  const company = base.companyName || "ISP Nexus";
  const title = base.title || `${company} Hotspot`;
  const primary = base.primaryColor || "#3b82f6";
  const background = base.backgroundColor || "#0f172a";
  const logo = base.logoUrl ? `<img class="brand-logo" src="${base.logoUrl}" alt="${company}"/>` : `<div class="brand-mark">${company.slice(0, 2).toUpperCase()}</div>`;
  const packages = Array.isArray(base.packages) && base.packages.length ? base.packages : DEFAULT_PACKAGES;
  const packageCards = packages.map((pkg: any) => `<article>
        <strong>${pkg.name}</strong>
        <b>${pkg.price} BDT</b>
        <span>${pkg.speed} • ${pkg.days} Days • ${pkg.devices} Device${String(pkg.devices) === "1" ? "" : "s"}</span>
        <a href="payment.html?pkg=${pkg.code}">Buy Now</a>
      </article>`).join("\n      ");
  const heroImage = base.heroUrl ? `<img class="hero-img" src="${base.heroUrl}" alt="Hero"/>` : "";
  return {
    htmlContent: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title}</title>
  <link rel="stylesheet" href="style.css"/>
</head>
<body>
  <main class="shell">
    <section class="login-panel">
      ${logo}
      <h1 data-en="${base.englishText || title}" data-bn="${base.banglaText || title}">${base.englishText || title}</h1>
      <p class="muted">Secure broadband access for customers and trial users.</p>
      ${heroImage}
      \$(if error)<div class="error">\$(error)</div>\$(endif)
      <form action="\$(link-login-only)" method="post">
        <input type="hidden" name="dst" value="\$(link-orig)"/>
        <label>Username<input name="username" autocomplete="username" required/></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" required/></label>
        <button type="submit">Connect</button>
      </form>
    </section>
    <section class="packages">
      <article class="trial"><strong>${base.trialBanner || "7 Days Free Trial"}</strong><span>Start instantly</span></article>
      ${packageCards}
    </section>
  </main>
  <script>
    document.documentElement.dataset.theme = localStorage.getItem("theme") || "dark";
    (function(){var key=(navigator.language||"").toLowerCase().indexOf("bn")===0?"bn":"en";Array.prototype.slice.call(document.querySelectorAll("[data-"+key+"]")).forEach(function(node){node.textContent=node.getAttribute("data-"+key);});}());
  </script>
</body>
</html>`,
    cssContent: `:root{--primary:${primary};--bg:${background};--text:#e5eefb;--muted:#94a3b8;--panel:rgba(15,23,42,.92)}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(180deg,rgba(3,7,18,.78),rgba(3,7,18,.96)),${base.backgroundUrl ? `url("${base.backgroundUrl}") center/cover no-repeat,` : ""}var(--bg);font-family:system-ui,sans-serif;color:var(--text);padding:14px}
.shell{width:min(980px,100%);display:grid;grid-template-columns:minmax(280px,390px) 1fr;gap:14px;align-items:stretch}.login-panel,.packages article{border:1px solid rgba(34,211,238,.28);background:var(--panel);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.34)}.login-panel{padding:22px}.brand-logo{max-width:132px;max-height:54px;object-fit:contain}.brand-mark{display:grid;place-items:center;width:54px;height:54px;border-radius:16px;background:var(--primary);font-weight:900;color:white}.hero-img{width:96px;max-height:72px;object-fit:contain;float:right}h1{font-size:28px;margin:14px 0 8px}.muted{color:var(--muted);margin:0 0 16px}.error{border:1px solid #f87171;background:#7f1d1d66;color:#fecaca;border-radius:10px;padding:10px 12px;margin-bottom:14px}label{display:block;font-size:13px;color:var(--muted);margin:0 0 12px}input{display:block;width:100%;margin-top:6px;border:1px solid #334155;background:#020617;color:var(--text);border-radius:10px;padding:12px}button,.packages a{display:block;text-align:center;width:100%;border:0;border-radius:10px;background:var(--primary);color:white;font-weight:800;padding:10px;cursor:pointer;text-decoration:none}.packages{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.packages article{padding:12px;min-height:96px}.packages strong,.packages b{display:block}.packages b{font-size:20px;color:#22d3ee}.packages span{display:block;margin:5px 0 8px;color:var(--muted);font-size:12px}.trial{grid-column:span 2}@media(max-width:760px){body{padding:8px}.shell{grid-template-columns:1fr}.login-panel{padding:14px}.packages{gap:6px}.packages article{min-height:82px;padding:8px}h1{font-size:22px}.muted{display:none}}`,
  };
}

function buildPreviewHtml(t: any, theme: "dark" | "light") {
  const html = t.htmlContent || starterTemplate(cloneTemplate(t)).htmlContent;
  const css = t.cssContent || starterTemplate(cloneTemplate(t)).cssContent;
  const themedCss = theme === "light"
    ? `${css}\n:root{--bg:#f8fafc;--text:#0f172a;--muted:#475569;--panel:rgba(255,255,255,.94)}input{background:#fff;color:#0f172a}`
    : css;
  return html.replace("</head>", `<style>${themedCss}</style></head>`);
}

function handleLogoUpload(file: File | undefined, setForm: (value: typeof EDITOR_EMPTY) => void, form: typeof EDITOR_EMPTY) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => setForm({ ...form, logoUrl: String(reader.result), ...starterTemplate({ ...form, logoUrl: String(reader.result) }) });
  reader.readAsDataURL(file);
}

function handleImageUpload(file: File | undefined, key: "backgroundUrl" | "heroUrl", setForm: (value: typeof EDITOR_EMPTY) => void, form: typeof EDITOR_EMPTY) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => setForm({ ...form, [key]: String(reader.result) });
  reader.readAsDataURL(file);
}
