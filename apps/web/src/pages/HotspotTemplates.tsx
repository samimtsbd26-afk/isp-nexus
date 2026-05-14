import { useState, useCallback, useMemo } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import {
  Code2, Eye, MonitorSmartphone, Plus, RotateCcw, Save, Smartphone, SunMoon,
  Trash2, Upload, Palette, Layout, History, Maximize2, X, ChevronUp, ChevronDown,
  Check, Layers, Globe, Image, Type, Sliders, Pencil, Copy, AlertTriangle,
} from "lucide-react";
import {
  Card, CardContent, Button, Badge, Modal, Input, Empty, Select,
} from "../components/ui/index";

// ─── Types ────────────────────────────────────────────────────────────────────

type ButtonStyle = "solid" | "gradient" | "outline";
type ShadowStyle = "none" | "soft" | "glow";

interface Package {
  name: string;
  code: string;
  price: string;
  speed: string;
  days: string;
  devices: string;
}

interface TemplateSections {
  logo: boolean;
  headline: boolean;
  hero: boolean;
  trialBanner: boolean;
  loginForm: boolean;
  packages: boolean;
  socialLinks: boolean;
  contactInfo: boolean;
  termsBox: boolean;
}

interface TemplateForm {
  name: string;
  title: string;
  companyName: string;
  // Brand
  logoUrl: string;
  faviconUrl: string;
  backgroundUrl: string;
  heroUrl: string;
  primaryColor: string;
  backgroundColor: string;
  accentColor: string;
  // Typography
  fontFamily: string;
  headlineEn: string;
  headlineBn: string;
  subheadline: string;
  // Style
  borderRadius: number;
  cardOpacity: number;
  buttonStyle: ButtonStyle;
  shadowStyle: ShadowStyle;
  // Sections
  sections: TemplateSections;
  // Content
  trialBanner: string;
  whatsappLink: string;
  telegramLink: string;
  paymentNumber: string;
  termsText: string;
  // SEO
  metaDescription: string;
  // Packages
  packages: Package[];
  // Code (generated or custom)
  htmlContent: string;
  cssContent: string;
  isDefault: boolean;
}

interface VersionEntry {
  ts: number;
  label: string;
  form: TemplateForm;
}

type EditorTab = "visual" | "library" | "code" | "seo";

// ─── Constants ────────────────────────────────────────────────────────────────

const FONT_OPTIONS = [
  { label: "System UI", value: "system-ui,sans-serif" },
  { label: "Inter", value: "'Inter',system-ui,sans-serif" },
  { label: "Roboto", value: "'Roboto',system-ui,sans-serif" },
  { label: "Poppins", value: "'Poppins',system-ui,sans-serif" },
  { label: "Nunito", value: "'Nunito',system-ui,sans-serif" },
  { label: "Rajdhani (Gaming)", value: "'Rajdhani',system-ui,sans-serif" },
];

const SECTION_LABELS: Record<keyof TemplateSections, string> = {
  logo: "Logo / Brand Mark",
  headline: "Headline Text",
  hero: "Hero Image",
  trialBanner: "Trial Banner",
  loginForm: "Login Form",
  packages: "Package Cards",
  socialLinks: "Social Links",
  contactInfo: "Contact Info",
  termsBox: "Terms & Conditions",
};

const DEFAULT_PACKAGES: Package[] = [
  { name: "Mini 10", code: "mini10", price: "50", speed: "3M/3M", days: "10", devices: "1" },
  { name: "Mini 20", code: "mini20", price: "90", speed: "3M/3M", days: "20", devices: "1" },
  { name: "Basic", code: "basic", price: "100", speed: "5M/5M", days: "30", devices: "1" },
  { name: "Pro", code: "pro", price: "200", speed: "10M/10M", days: "30", devices: "2" },
  { name: "Ultra", code: "ultra", price: "500", speed: "20M/20M", days: "30", devices: "4" },
];

const DEFAULT_SECTIONS: TemplateSections = {
  logo: true, headline: true, hero: false, trialBanner: true,
  loginForm: true, packages: true, socialLinks: true,
  contactInfo: true, termsBox: false,
};

const EMPTY_FORM: TemplateForm = {
  name: "", title: "", companyName: "",
  logoUrl: "", faviconUrl: "", backgroundUrl: "", heroUrl: "",
  primaryColor: "#06b6d4", backgroundColor: "#0c0f1a", accentColor: "#3b82f6",
  fontFamily: "system-ui,sans-serif",
  headlineEn: "NEXT GEN INTERNET", headlineBn: "নেক্সট জেন ইন্টারনেট",
  subheadline: "Fast • Reliable • Affordable",
  borderRadius: 12, cardOpacity: 0.9, buttonStyle: "gradient", shadowStyle: "glow",
  sections: DEFAULT_SECTIONS,
  trialBanner: "7 Days Free Trial", whatsappLink: "", telegramLink: "", paymentNumber: "",
  termsText: "By connecting you agree to our terms of service.",
  metaDescription: "",
  packages: DEFAULT_PACKAGES,
  htmlContent: "", cssContent: "", isDefault: false,
};

// ─── Preset Templates ─────────────────────────────────────────────────────────

interface PresetDef {
  id: string;
  label: string;
  description: string;
  colors: string[];
  overrides: Partial<TemplateForm>;
}

const PRESETS: PresetDef[] = [
  {
    id: "modern", label: "Modern Dark", description: "Cyan glow, dark slate, rounded cards",
    colors: ["#06b6d4", "#0c0f1a"],
    overrides: { primaryColor: "#06b6d4", backgroundColor: "#0c0f1a", accentColor: "#3b82f6", borderRadius: 16, buttonStyle: "gradient", shadowStyle: "glow" },
  },
  {
    id: "ispro", label: "ISP Pro", description: "Professional navy, clean grid lines",
    colors: ["#3b82f6", "#0a1628"],
    overrides: { primaryColor: "#3b82f6", backgroundColor: "#0a1628", accentColor: "#60a5fa", borderRadius: 8, buttonStyle: "solid", shadowStyle: "soft" },
  },
  {
    id: "minimal", label: "Minimal Light", description: "Light bg, clean indigo, minimal shadows",
    colors: ["#6366f1", "#f8fafc"],
    overrides: { primaryColor: "#6366f1", backgroundColor: "#f8fafc", accentColor: "#818cf8", borderRadius: 12, buttonStyle: "solid", shadowStyle: "soft" },
  },
  {
    id: "corporate", label: "Corporate Gold", description: "Dark charcoal, amber/gold accent",
    colors: ["#d97706", "#111111"],
    overrides: { primaryColor: "#d97706", backgroundColor: "#111111", accentColor: "#f59e0b", borderRadius: 6, buttonStyle: "solid", shadowStyle: "none", fontFamily: "'Roboto',system-ui,sans-serif" },
  },
  {
    id: "gaming", label: "Gaming Cyber", description: "Neon green on black, cyber aesthetic",
    colors: ["#00ff88", "#000000"],
    overrides: { primaryColor: "#00ff88", backgroundColor: "#000000", accentColor: "#00ccff", borderRadius: 2, buttonStyle: "outline", shadowStyle: "glow", fontFamily: "'Rajdhani',system-ui,sans-serif", headlineEn: "CYBER CONNECT", headlineBn: "সাইবার কানেক্ট" },
  },
  {
    id: "hotel", label: "Hotel WiFi", description: "Warm brown, orange primary, elegant feel",
    colors: ["#fb923c", "#2c1810"],
    overrides: { primaryColor: "#fb923c", backgroundColor: "#2c1810", accentColor: "#fbbf24", borderRadius: 20, buttonStyle: "gradient", shadowStyle: "soft", headlineEn: "Welcome to Our WiFi", headlineBn: "আমাদের ওয়াইফাইতে স্বাগতম" },
  },
];

// ─── Security: HTML/CSS Sanitizer ─────────────────────────────────────────────

function sanitizeHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]*/gi, "")
    .replace(/javascript\s*:/gi, "about:")
    .replace(/vbscript\s*:/gi, "about:")
    .replace(/<iframe(?![^>]*srcdoc)[^>]*>/gi, "")
    .replace(/expression\s*\(/gi, "");
}

function sanitizeCss(raw: string): string {
  return raw
    .replace(/expression\s*\(/gi, "")
    .replace(/url\s*\(\s*['"]?\s*javascript/gi, "url(about:")
    .replace(/@import\s+url\s*\(/gi, "/* @import */url(")
    .replace(/-moz-binding/gi, "/* -moz-binding */");
}

// ─── Version History ──────────────────────────────────────────────────────────

const VERSION_KEY = "isp_hotspot_versions";
const MAX_VERSIONS = 10;

function loadVersions(): VersionEntry[] {
  try {
    return JSON.parse(localStorage.getItem(VERSION_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveVersion(label: string, form: TemplateForm): void {
  const versions = loadVersions();
  versions.unshift({ ts: Date.now(), label, form });
  localStorage.setItem(VERSION_KEY, JSON.stringify(versions.slice(0, MAX_VERSIONS)));
}

function deleteVersion(ts: number): void {
  const versions = loadVersions().filter((v) => v.ts !== ts);
  localStorage.setItem(VERSION_KEY, JSON.stringify(versions));
}

// ─── Template HTML/CSS Builder ────────────────────────────────────────────────

function buildCss(f: TemplateForm): string {
  const r = f.borderRadius;
  const op = f.cardOpacity;
  const font = f.fontFamily;
  const primary = f.primaryColor;
  const bg = f.backgroundColor;
  const accent = f.accentColor;
  const isLight = isLightColor(bg);
  const textColor = isLight ? "#1e293b" : "#e5eefb";
  const mutedColor = isLight ? "#64748b" : "#94a3b8";
  const panelBg = isLight
    ? `rgba(255,255,255,${op})`
    : `rgba(15,23,42,${op})`;
  const borderColor = isLight ? "rgba(0,0,0,0.12)" : "rgba(148,163,184,0.15)";

  let btnCss = "";
  if (f.buttonStyle === "gradient") {
    btnCss = `background:linear-gradient(135deg,${primary},${accent});color:#fff;border:0;`;
  } else if (f.buttonStyle === "outline") {
    btnCss = `background:transparent;color:${primary};border:2px solid ${primary};`;
  } else {
    btnCss = `background:${primary};color:${isLight ? "#fff" : "#fff"};border:0;`;
  }

  let shadowCss = "";
  if (f.shadowStyle === "glow") {
    shadowCss = `box-shadow:0 0 24px ${primary}40,0 20px 50px rgba(0,0,0,0.4);`;
  } else if (f.shadowStyle === "soft") {
    shadowCss = `box-shadow:0 8px 32px rgba(0,0,0,0.2);`;
  }

  const bgImage = f.backgroundUrl
    ? `url("${f.backgroundUrl}") center/cover no-repeat,`
    : "";

  return `:root{--p:${primary};--bg:${bg};--accent:${accent};--text:${textColor};--muted:${mutedColor};--panel:${panelBg};--border:${borderColor};--r:${r}px;--font:${font}}
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;display:grid;place-items:center;background:${bgImage}linear-gradient(180deg,rgba(0,0,0,.6),rgba(0,0,0,.7)),${bg};font-family:var(--font);color:var(--text);padding:14px}
.shell{width:min(960px,100%);display:grid;grid-template-columns:minmax(280px,380px) 1fr;gap:16px;align-items:start}
.panel{background:var(--panel);border:1px solid var(--border);border-radius:var(--r);padding:22px;${shadowCss}}
.brand-logo{max-width:130px;max-height:52px;object-fit:contain;display:block;margin-bottom:12px}
.brand-mark{display:grid;place-items:center;width:52px;height:52px;border-radius:calc(var(--r) - 2px);background:var(--p);font-weight:900;color:#fff;font-size:20px;margin-bottom:12px}
.headline-en{font-size:clamp(20px,4vw,30px);font-weight:900;line-height:1.1;margin-bottom:4px}
.headline-bn{font-size:clamp(14px,3vw,18px);color:var(--muted);margin-bottom:6px}
.subheadline{font-size:13px;color:var(--muted);margin-bottom:14px}
.hero-img{width:90px;height:72px;object-fit:contain;float:right;margin:0 0 8px 10px}
.error-box{border:1px solid #f87171;background:rgba(127,29,29,.5);color:#fecaca;border-radius:calc(var(--r) - 4px);padding:10px 12px;margin-bottom:14px;font-size:13px}
.form-label{display:block;font-size:12px;color:var(--muted);font-weight:600;margin:0 0 10px}
.form-input{display:block;width:100%;margin-top:5px;border:1px solid var(--border);background:rgba(0,0,0,.35);color:var(--text);border-radius:calc(var(--r) - 4px);padding:11px 14px;font-size:14px;outline:none;transition:border-color .2s}
.form-input:focus{border-color:var(--p)}
.submit-btn{display:block;text-align:center;width:100%;border-radius:calc(var(--r) - 2px);padding:12px;font-size:14px;font-weight:700;cursor:pointer;transition:opacity .2s;${btnCss}}
.submit-btn:hover{opacity:.88}
.packages{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.pkg-card{background:var(--panel);border:1px solid var(--border);border-radius:var(--r);padding:14px;${shadowCss}}
.trial-card{grid-column:span 2;background:linear-gradient(135deg,${primary}22,${accent}22);border-color:${primary}55;text-align:center;padding:10px}
.pkg-name{display:block;font-size:13px;font-weight:700;margin-bottom:4px}
.pkg-price{display:block;font-size:22px;font-weight:900;color:var(--p)}
.pkg-speed{display:block;font-size:11px;color:var(--muted);margin:4px 0 10px}
.pkg-btn{display:block;text-align:center;border-radius:calc(var(--r) - 4px);padding:8px;font-size:12px;font-weight:700;text-decoration:none;${btnCss}}
.social-row{display:flex;gap:10px;margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}
.social-btn{flex:1;text-align:center;border-radius:calc(var(--r) - 4px);padding:8px 6px;font-size:12px;font-weight:600;text-decoration:none;background:var(--border);color:var(--text)}
.contact-info{font-size:12px;color:var(--muted);margin-top:10px;text-align:center}
.terms-box{font-size:11px;color:var(--muted);margin-top:12px;padding:8px 10px;border:1px solid var(--border);border-radius:calc(var(--r) - 4px);max-height:60px;overflow-y:auto}
@media(max-width:740px){.shell{grid-template-columns:1fr}.panel{padding:14px}.packages{gap:6px}.headline-en{font-size:20px}.trial-card{grid-column:span 2}}`;
}

function buildHtml(f: TemplateForm): string {
  const s = f.sections;
  const company = f.companyName || "ISP";
  const title = f.title || `${company} WiFi`;
  const meta = f.metaDescription ? `\n  <meta name="description" content="${f.metaDescription.replace(/"/g, "&quot;")}"/>` : "";
  const favicon = f.faviconUrl ? `\n  <link rel="icon" href="${f.faviconUrl}"/>` : "";

  const logo = s.logo
    ? (f.logoUrl
      ? `<img class="brand-logo" src="${f.logoUrl}" alt="${company}"/>`
      : `<div class="brand-mark">${company.slice(0, 2).toUpperCase()}</div>`)
    : "";

  const headline = s.headline
    ? `<h1 class="headline-en" data-en="${f.headlineEn}" data-bn="${f.headlineBn}">${f.headlineEn}</h1>
      <p class="headline-bn">${f.headlineBn}</p>
      <p class="subheadline">${f.subheadline}</p>`
    : "";

  const hero = s.hero && f.heroUrl
    ? `<img class="hero-img" src="${f.heroUrl}" alt=""/>`
    : "";

  const form = s.loginForm ? `$(if error)<div class="error-box">$(error)</div>$(endif)
      <form action="$(link-login-only)" method="post">
        <input type="hidden" name="dst" value="$(link-orig)"/>
        <label class="form-label">Username<input class="form-input" name="username" autocomplete="username" required placeholder="Enter username"/></label>
        <label class="form-label">Password<input class="form-input" name="password" type="password" autocomplete="current-password" required placeholder="Enter password"/></label>
        <button class="submit-btn" type="submit">Connect Now</button>
      </form>` : "";

  const social = s.socialLinks && (f.whatsappLink || f.telegramLink)
    ? `<div class="social-row">
        ${f.whatsappLink ? `<a href="${f.whatsappLink}" class="social-btn" target="_blank">💬 WhatsApp</a>` : ""}
        ${f.telegramLink ? `<a href="${f.telegramLink}" class="social-btn" target="_blank">✈️ Telegram</a>` : ""}
      </div>` : "";

  const contact = s.contactInfo && f.paymentNumber
    ? `<p class="contact-info">📞 Payment: ${f.paymentNumber}</p>` : "";

  const terms = s.termsBox && f.termsText
    ? `<div class="terms-box">${f.termsText}</div>` : "";

  const pkgs = f.packages.map((p) =>
    `<div class="pkg-card" onclick="if(window.__skyBuy)window.__skyBuy('${p.code}','${p.name}','${p.price}')">
        <span class="pkg-name">${p.name}</span>
        <span class="pkg-price">৳${p.price}</span>
        <span class="pkg-speed">${p.speed} · ${p.days}d · ${p.devices} device${p.devices === "1" ? "" : "s"}</span>
        <button class="pkg-btn" type="button">Buy Now</button>
      </div>`,
  ).join("\n      ");

  const trial = s.trialBanner
    ? `<div class="pkg-card trial-card">
        <strong>🎁 ${f.trialBanner}</strong>
        <span style="font-size:12px;color:var(--muted);display:block;margin-top:4px">Start instantly · No payment</span>
      </div>` : "";

  const packages = s.packages
    ? `<section class="packages">${trial}\n      ${pkgs}</section>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>${favicon}
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title}</title>${meta}
  <link rel="stylesheet" href="style.css"/>
</head>
<body>
  <div class="shell">
    <section class="panel">
      ${logo}${hero}
      ${headline}
      ${form}
      ${social}
      ${contact}
      ${terms}
    </section>
    ${packages}
  </div>
  <script>
    (function(){
      var k=(navigator.language||"").toLowerCase().startsWith("bn")?"bn":"en";
      document.querySelectorAll("[data-"+k+"]").forEach(function(el){el.textContent=el.getAttribute("data-"+k);});
    }());
  </script>
</body>
</html>`;
}

function buildPreviewDoc(f: TemplateForm, theme: "dark" | "light"): string {
  const html = sanitizeHtml(f.htmlContent || buildHtml(f));
  let css = sanitizeCss(f.cssContent || buildCss(f));
  if (theme === "light" && !f.htmlContent) {
    css += "\nbody{filter:none}";
  } else if (theme === "light") {
    css += "\nbody{background:#f8fafc!important;color:#1e293b!important}";
  }
  const googleFont = FONT_OPTIONS.find((opt) => opt.value === f.fontFamily);
  const fontName = googleFont?.label && !googleFont.label.includes("System")
    ? `<link rel="preconnect" href="https://fonts.googleapis.com"/><link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(googleFont.label)}&display=swap" rel="stylesheet"/>`
    : "";
  return html.replace("</head>", `${fontName}<style>${css}</style></head>`);
}

function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

// ─── API payload builder ──────────────────────────────────────────────────────

function toApiPayload(f: TemplateForm) {
  const generated = !f.htmlContent;
  const htmlContent = generated ? buildHtml(f) : sanitizeHtml(f.htmlContent);
  const cssContent = generated ? buildCss(f) : sanitizeCss(f.cssContent);
  const logoUrl = /^https?:\/\//i.test(f.logoUrl) || /^data:image\//i.test(f.logoUrl) ? f.logoUrl : undefined;
  return {
    name: f.name,
    title: f.title || undefined,
    companyName: f.companyName || undefined,
    logoUrl,
    primaryColor: f.primaryColor,
    backgroundColor: f.backgroundColor,
    htmlContent,
    cssContent,
    isDefault: Boolean(f.isDefault),
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ColorInput({ label, id, value, onChange }: { label: string; id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
      <div className="flex gap-2">
        <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 rounded border border-input bg-transparent cursor-pointer p-0.5" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 font-mono text-xs" maxLength={7} />
      </div>
    </div>
  );
}

function RangeInput({ label, value, min, max, step = 1, unit = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-muted-foreground font-medium">{label}</span>
        <span className="text-foreground font-semibold">{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary" />
    </div>
  );
}

function SectionToggle({ sections, onChange }: { sections: TemplateSections; onChange: (s: TemplateSections) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {(Object.keys(SECTION_LABELS) as Array<keyof TemplateSections>).map((key) => (
        <label key={key} className="flex items-center gap-2 text-xs cursor-pointer p-2 rounded-md border border-border hover:bg-secondary/50 transition-colors select-none">
          <input type="checkbox" className="accent-primary w-3.5 h-3.5" checked={sections[key]}
            onChange={(e) => onChange({ ...sections, [key]: e.target.checked })} />
          <span className="truncate">{SECTION_LABELS[key]}</span>
        </label>
      ))}
    </div>
  );
}

function PackageEditor({ packages, onChange }: { packages: Package[]; onChange: (p: Package[]) => void }) {
  const move = (i: number, dir: -1 | 1) => {
    const next = [...packages];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-muted-foreground">Packages</span>
        <Button type="button" size="sm" variant="outline"
          onClick={() => onChange([...packages, { name: "New", code: "new", price: "0", speed: "5M/5M", days: "30", devices: "1" }])}>
          <Plus size={12} /> Add
        </Button>
      </div>
      {packages.map((pkg, i) => (
        <div key={i} className="grid grid-cols-[1fr_70px_80px_50px_44px_62px] gap-1 items-center">
          {(["name", "price", "speed", "days", "devices"] as const).map((k) => (
            <Input key={k} value={pkg[k]} placeholder={k}
              onChange={(e) => {
                const next = [...packages];
                next[i] = { ...pkg, [k]: e.target.value, ...(k === "name" ? { code: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "") } : {}) };
                onChange(next);
              }} />
          ))}
          <div className="flex gap-0.5">
            <button type="button" onClick={() => i > 0 && move(i, -1)} className="p-1 rounded hover:bg-secondary disabled:opacity-30" disabled={i === 0}><ChevronUp size={11} /></button>
            <button type="button" onClick={() => i < packages.length - 1 && move(i, 1)} className="p-1 rounded hover:bg-secondary disabled:opacity-30" disabled={i === packages.length - 1}><ChevronDown size={11} /></button>
            <button type="button" onClick={() => onChange(packages.filter((_, j) => j !== i))} className="p-1 rounded hover:bg-destructive/20"><Trash2 size={11} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

function PresetLibrary({ onApply }: { onApply: (p: PresetDef) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {PRESETS.map((p) => (
        <button key={p.id} type="button" onClick={() => onApply(p)}
          className="relative rounded-xl border border-border bg-card p-3 text-left hover:border-primary/50 hover:bg-secondary/50 transition-all group">
          <div className="h-14 rounded-lg mb-2 overflow-hidden"
            style={{ background: `linear-gradient(135deg,${p.colors[1]},${p.colors[1]} 60%,${p.colors[0]}33)` }}>
            <div className="h-full flex items-center px-3 gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-xs"
                style={{ background: p.colors[0] }}>Wi</div>
              <div>
                <div className="h-2 w-16 rounded" style={{ background: p.colors[0], opacity: 0.7 }} />
                <div className="h-1.5 w-10 rounded mt-1" style={{ background: p.colors[0], opacity: 0.3 }} />
              </div>
            </div>
          </div>
          <p className="text-xs font-semibold">{p.label}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{p.description}</p>
          <div className="flex gap-1 mt-1.5">
            {p.colors.map((c, i) => (
              <div key={i} className="w-4 h-4 rounded-full border border-border" style={{ background: c }} />
            ))}
          </div>
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded">Apply</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function VersionHistoryPanel({ currentForm, onRestore, onClose }: { currentForm: TemplateForm; onRestore: (f: TemplateForm) => void; onClose: () => void }) {
  const [versions, setVersions] = useState<VersionEntry[]>(loadVersions);
  const [label, setLabel] = useState("");

  const save = () => {
    const name = label.trim() || `Version ${new Date().toLocaleTimeString()}`;
    saveVersion(name, currentForm);
    setVersions(loadVersions());
    setLabel("");
    toast.success("Version saved");
  };

  const del = (ts: number) => {
    deleteVersion(ts);
    setVersions(loadVersions());
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input placeholder="Version label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button size="sm" onClick={save}><Save size={13} /> Save Now</Button>
      </div>
      {versions.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No versions saved yet</p>}
      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {versions.map((v) => (
          <div key={v.ts} className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-secondary/50">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{v.label}</p>
              <p className="text-[10px] text-muted-foreground">{new Date(v.ts).toLocaleString()}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => { onRestore(v.form); onClose(); toast.success("Version restored"); }}>
              <RotateCcw size={12} /> Restore
            </Button>
            <button type="button" onClick={() => del(v.ts)} className="text-muted-foreground hover:text-destructive p-1">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HotspotTemplates({
  routerId: externalRouterId,
  embedded = false,
}: {
  routerId?: string;
  embedded?: boolean;
} = {}) {
  const { data: templates, refetch, isLoading } = trpc.hotspot.listTemplates.useQuery();
  const { data: routers } = trpc.routerMgmt.list.useQuery();

  const [showAdd, setShowAdd] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [fullscreenPreview, setFullscreenPreview] = useState(false);
  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM);
  const [tab, setTab] = useState<EditorTab>("visual");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [previewTheme, setPreviewTheme] = useState<"dark" | "light">("dark");
  const [previewModalDevice, setPreviewModalDevice] = useState<"desktop" | "android" | "captive">("desktop");
  const [localRouterId, setLocalRouterId] = useState("");
  // Edit mode: null = creating new, string = editing existing template ID
  const [editMode, setEditMode] = useState<string | null>(null);
  // Confirmation modals
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [setDefaultTarget, setSetDefaultTarget] = useState<{ id: string; name: string } | null>(null);

  const selectedRouter = externalRouterId
    || localRouterId
    || routers?.find((r) => r.isDefault)?.id
    || routers?.[0]?.id
    || "";

  const create = trpc.hotspot.createTemplate.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(EMPTY_FORM); setEditMode(null); toast.success("Template created"); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.hotspot.updateTemplate.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(EMPTY_FORM); setEditMode(null); toast.success("Template updated"); },
    onError: (e) => toast.error(e.message),
  });
  const deploy = trpc.hotspot.deployTemplate.useMutation({
    onSuccess: (d) => toast.success(`Published to ${d.router}`),
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.hotspot.deleteTemplate.useMutation({
    onSuccess: () => { refetch(); toast.success("Deleted"); },
  });

  const previewTmpl = useMemo(() => templates?.find((t) => t.id === previewId), [templates, previewId]);

  const applyPreset = useCallback((preset: PresetDef) => {
    setForm((prev) => ({
      ...prev,
      ...preset.overrides,
      name: prev.name || preset.label,
      htmlContent: "",
      cssContent: "",
    }));
    toast.success(`${preset.label} template applied`);
  }, []);

  const livePreviewDoc = useMemo(() => buildPreviewDoc(form, previewTheme), [form, previewTheme]);

  // Open builder pre-filled with an existing template for editing
  const openEdit = useCallback((t: NonNullable<typeof templates>[number]) => {
    setForm({
      ...EMPTY_FORM,
      name: t.name,
      title: t.title ?? "",
      companyName: t.companyName ?? "",
      logoUrl: t.logoUrl ?? "",
      primaryColor: t.primaryColor ?? "#06b6d4",
      backgroundColor: t.backgroundColor ?? "#0c0f1a",
      htmlContent: t.htmlContent ?? "",
      cssContent: t.cssContent ?? "",
      isDefault: t.isDefault,
    });
    setEditMode(t.id);
    setTab("code"); // HTML/CSS is what's stored; visual settings aren't persisted separately
    setShowAdd(true);
  }, []);

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Template name is required"); return; }
    saveVersion((editMode ? "Before edit: " : "Before create: ") + form.name, form);
    if (editMode) {
      update.mutate({ id: editMode, ...toApiPayload(form) });
    } else {
      create.mutate(toApiPayload(form));
    }
  };

  const handleLogoUpload = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((prev) => ({ ...prev, logoUrl: String(reader.result), htmlContent: "", cssContent: "" }));
    reader.readAsDataURL(file);
  };

  const handleImageUpload = (file: File | undefined, key: "backgroundUrl" | "heroUrl" | "faviconUrl") => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((prev) => ({ ...prev, [key]: String(reader.result), htmlContent: "", cssContent: "" }));
    reader.readAsDataURL(file);
  };

  const setF = useCallback(<K extends keyof TemplateForm>(key: K, val: TemplateForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: val, ...(key !== "htmlContent" && key !== "cssContent" ? { htmlContent: "", cssContent: "" } : {}) }));
  }, []);

  const TAB_ICONS: Record<EditorTab, React.ReactNode> = {
    visual: <Palette size={13} />,
    library: <Layout size={13} />,
    code: <Code2 size={13} />,
    seo: <Globe size={13} />,
  };

  return (
    <div className="space-y-5">
      {/* Page Header — hidden when embedded inside HotspotControl */}
      {!embedded && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold">Hotspot Template Builder</h1>
            <p className="text-muted-foreground text-sm">Design and publish custom MikroTik login pages</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select title="Publish router" value={selectedRouter} onChange={(e) => setLocalRouterId(e.target.value)} className="w-44">
              {routers?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
            <Button size="sm" onClick={() => { setForm(EMPTY_FORM); setTab("library"); setShowAdd(true); }}>
              <Plus size={14} /> New Template
            </Button>
          </div>
        </div>
      )}

      {/* Toolbar when embedded */}
      {embedded && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs text-muted-foreground">MikroTik login page টেমপ্লেট তৈরি ও deploy করুন</p>
          <Button size="sm" onClick={() => { setForm(EMPTY_FORM); setTab("library"); setShowAdd(true); }}>
            <Plus size={13} className="mr-1" /> New Template
          </Button>
        </div>
      )}

      {/* Template Grid */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}><div className="h-40 animate-pulse bg-secondary/50 rounded-xl" /></Card>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates?.map((t) => (
          <Card key={t.id} className={t.isDefault ? "border-blue-500/40 shadow-blue-500/10 shadow-lg" : ""}>
            <div className="h-2 rounded-t-xl"
              style={{ background: `linear-gradient(to right, ${t.primaryColor ?? "#3b82f6"}, ${t.backgroundColor ?? "#0f172a"})` }} />
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.companyName ?? "—"}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {new Date(t.updatedAt).toLocaleDateString("en-BD", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                </div>
                <div className="flex flex-col gap-1 items-end shrink-0">
                  {t.isDefault && <Badge variant="info" className="text-[10px]">Default</Badge>}
                  {t.htmlContent && <Badge variant="outline" className="text-[10px]">Custom HTML</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full border border-border shrink-0" style={{ background: t.primaryColor ?? "#3b82f6" }} />
                <span className="text-xs text-muted-foreground font-mono">{t.primaryColor ?? "—"}</span>
                <div className="w-5 h-5 rounded-full border border-border ml-auto shrink-0" style={{ background: t.backgroundColor ?? "#0f172a" }} />
                <span className="text-xs text-muted-foreground font-mono">{t.backgroundColor ?? "—"}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-border">
                {/* Row 1 */}
                <Button size="sm" variant="outline" onClick={() => setPreviewId(t.id)}>
                  <Eye size={12} className="mr-1" /> Preview
                </Button>
                <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                  <Pencil size={12} className="mr-1" /> Edit
                </Button>
                {/* Row 2 */}
                <Button size="sm" variant="secondary"
                  disabled={deploy.isPending || !selectedRouter}
                  title={!selectedRouter ? "Select a router first" : "Publish to MikroTik router"}
                  onClick={() => deploy.mutate({ id: t.id, routerId: selectedRouter })}>
                  <Upload size={12} className="mr-1" />
                  {deploy.isPending ? "Publishing…" : "Publish"}
                </Button>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="flex-1"
                    title="Duplicate template"
                    onClick={() => { create.mutate({ name: `${t.name} copy`, primaryColor: t.primaryColor ?? "#06b6d4", backgroundColor: t.backgroundColor ?? "#0c0f1a", htmlContent: t.htmlContent ?? "", cssContent: t.cssContent ?? "", isDefault: false, title: t.title ?? undefined, companyName: t.companyName ?? undefined, logoUrl: t.logoUrl ?? undefined }); }}>
                    <Copy size={12} />
                  </Button>
                  <Button size="sm" variant="ghost"
                    className="hover:bg-red-500/10 hover:text-red-400"
                    onClick={() => setDeleteTarget({ id: t.id, name: t.name })}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && !templates?.length && (
          <div className="col-span-3">
            <Card><CardContent className="py-16"><Empty message="No templates yet — click 'New Template' to start building" /></CardContent></Card>
          </div>
        )}
      </div>

      {/* ── Builder Modal ──────────────────────────────────────────────────── */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setEditMode(null); setForm(EMPTY_FORM); }} title={editMode ? "Edit Template" : "New Template"} className="max-w-7xl max-h-[96vh] overflow-hidden flex flex-col">
        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col min-h-0">

          {/* Top bar */}
          <div className="flex items-center gap-2 pb-3 border-b border-border flex-wrap">
            <Input value={form.name} onChange={(e) => setF("name", e.target.value)}
              placeholder="Template Name *" className="w-44" required />
            <Input value={form.companyName} onChange={(e) => setF("companyName", e.target.value)}
              placeholder="Company Name" className="w-36" />
            <label className="flex items-center gap-2 text-xs cursor-pointer ml-auto">
              <input type="checkbox" className="accent-primary" checked={form.isDefault}
                onChange={(e) => setF("isDefault", e.target.checked)} />
              <span>Set as default</span>
            </label>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowVersions(true)}>
              <History size={13} /> Versions
            </Button>
            <Button type="submit" size="sm" disabled={create.isPending || update.isPending}>
              {(create.isPending || update.isPending)
                ? (editMode ? "Updating…" : "Creating…")
                : (editMode ? "Update" : "Create")}
            </Button>
          </div>

          {/* Body: left editor + right preview */}
          <div className="flex-1 overflow-hidden grid grid-cols-[360px_1fr] gap-0 min-h-0">

            {/* Left: Editor Tabs */}
            <div className="border-r border-border flex flex-col min-h-0 overflow-hidden">
              {/* Tab bar */}
              <div className="flex border-b border-border">
                {(["visual", "library", "code", "seo"] as EditorTab[]).map((t) => (
                  <button key={t} type="button" onClick={() => setTab(t)}
                    className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium transition-colors ${tab === t ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {TAB_ICONS[t]}
                    <span className="capitalize">{t}</span>
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-4">

                {/* ── VISUAL TAB ─────────────────────────────────────────── */}
                {tab === "visual" && (
                  <>
                    {/* Brand */}
                    <section>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><Image size={11} /> Brand Assets</h3>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1.5">Logo Image</label>
                          <input type="file" accept="image/*" onChange={(e) => handleLogoUpload(e.currentTarget.files?.[0])}
                            className="text-xs w-full file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-secondary file:text-xs file:cursor-pointer" />
                          {form.logoUrl && (
                            <div className="flex items-center gap-2 mt-1">
                              <img src={form.logoUrl} alt="logo" className="h-8 object-contain border border-border rounded" />
                              <button type="button" className="text-xs text-destructive" onClick={() => setF("logoUrl", "")}>Remove</button>
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1.5">Background Image</label>
                          <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e.currentTarget.files?.[0], "backgroundUrl")}
                            className="text-xs w-full file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-secondary file:text-xs file:cursor-pointer" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1.5">Hero Image</label>
                          <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e.currentTarget.files?.[0], "heroUrl")}
                            className="text-xs w-full file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-secondary file:text-xs file:cursor-pointer" />
                        </div>
                      </div>
                    </section>

                    {/* Colors */}
                    <section>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><Palette size={11} /> Colors</h3>
                      <div className="grid grid-cols-2 gap-2">
                        <ColorInput label="Primary" id="cp" value={form.primaryColor} onChange={(v) => setF("primaryColor", v)} />
                        <ColorInput label="Background" id="cb" value={form.backgroundColor} onChange={(v) => setF("backgroundColor", v)} />
                        <ColorInput label="Accent" id="ca" value={form.accentColor} onChange={(v) => setF("accentColor", v)} />
                      </div>
                    </section>

                    {/* Typography */}
                    <section>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><Type size={11} /> Text</h3>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1.5">Font Family</label>
                          <Select value={form.fontFamily} onChange={(e) => setF("fontFamily", e.target.value)}>
                            {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                          </Select>
                        </div>
                        <Input value={form.headlineEn} onChange={(e) => setF("headlineEn", e.target.value)} placeholder="English Headline" />
                        <Input value={form.headlineBn} onChange={(e) => setF("headlineBn", e.target.value)} placeholder="বাংলা হেডলাইন" />
                        <Input value={form.subheadline} onChange={(e) => setF("subheadline", e.target.value)} placeholder="Subheadline" />
                        <Input value={form.trialBanner} onChange={(e) => setF("trialBanner", e.target.value)} placeholder="Trial banner text" />
                      </div>
                    </section>

                    {/* Style */}
                    <section>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><Sliders size={11} /> Style</h3>
                      <div className="space-y-3">
                        <RangeInput label="Border Radius" value={form.borderRadius} min={0} max={28} unit="px" onChange={(v) => setF("borderRadius", v)} />
                        <RangeInput label="Card Opacity" value={form.cardOpacity} min={0.6} max={1.0} step={0.05} onChange={(v) => setF("cardOpacity", v)} />
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1.5">Button Style</label>
                          <div className="flex gap-1">
                            {(["solid", "gradient", "outline"] as ButtonStyle[]).map((s) => (
                              <button key={s} type="button" onClick={() => setF("buttonStyle", s)}
                                className={`flex-1 py-1.5 text-xs rounded border capitalize transition-colors ${form.buttonStyle === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1.5">Shadow Style</label>
                          <div className="flex gap-1">
                            {(["none", "soft", "glow"] as ShadowStyle[]).map((s) => (
                              <button key={s} type="button" onClick={() => setF("shadowStyle", s)}
                                className={`flex-1 py-1.5 text-xs rounded border capitalize transition-colors ${form.shadowStyle === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* Sections */}
                    <section>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><Layers size={11} /> Sections</h3>
                      <SectionToggle sections={form.sections} onChange={(s) => setF("sections", s)} />
                    </section>

                    {/* Contact */}
                    <section>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Contact & Social</h3>
                      <div className="space-y-2">
                        <Input value={form.whatsappLink} onChange={(e) => setF("whatsappLink", e.target.value)} placeholder="https://wa.me/880..." />
                        <Input value={form.telegramLink} onChange={(e) => setF("telegramLink", e.target.value)} placeholder="https://t.me/..." />
                        <Input value={form.paymentNumber} onChange={(e) => setF("paymentNumber", e.target.value)} placeholder="Payment phone number" />
                        <textarea value={form.termsText} onChange={(e) => setF("termsText", e.target.value)}
                          placeholder="Terms & conditions text" rows={2}
                          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs" />
                      </div>
                    </section>

                    {/* Packages */}
                    <section>
                      <PackageEditor packages={form.packages} onChange={(p) => setF("packages", p)} />
                    </section>
                  </>
                )}

                {/* ── LIBRARY TAB ─────────────────────────────────────────── */}
                {tab === "library" && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-3">Click a preset to instantly apply its colors and style.</p>
                    <PresetLibrary onApply={applyPreset} />
                    <div className="mt-4 pt-4 border-t border-border space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Page Title</p>
                      <Input value={form.title} onChange={(e) => setF("title", e.target.value)} placeholder="Page <title> tag" />
                    </div>
                  </div>
                )}

                {/* ── CODE TAB ─────────────────────────────────────────────── */}
                {tab === "code" && (
                  <div className="space-y-3">
                    {editMode && (
                      <div className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-500/25 bg-amber-500/8 text-xs text-amber-300">
                        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                        <span>Edit mode-এ শুধু HTML/CSS সংরক্ষিত থাকে। Visual settings (font, sections, packages) বর্তমান সংস্করণে পুনরায় সেট হবে।</span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setForm((p) => ({ ...p, htmlContent: buildHtml(p), cssContent: buildCss(p) }))}>
                        <Code2 size={12} /> Generate from Visual
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setForm((p) => ({ ...p, htmlContent: "", cssContent: "" }))}>
                        Reset to visual
                      </Button>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">HTML (login.html)</label>
                      <textarea value={form.htmlContent} onChange={(e) => setForm((p) => ({ ...p, htmlContent: e.target.value }))}
                        placeholder="Leave empty to auto-generate from visual settings"
                        className="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs min-h-[200px]" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">CSS (style.css)</label>
                      <textarea value={form.cssContent} onChange={(e) => setForm((p) => ({ ...p, cssContent: e.target.value }))}
                        placeholder="Leave empty to auto-generate from visual settings"
                        className="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs min-h-[140px]" />
                    </div>
                    <div className="p-2 rounded-md border border-amber-500/30 bg-amber-500/5 text-xs text-amber-300">
                      ⚠️ Scripts and event handlers are stripped automatically for security.
                    </div>
                  </div>
                )}

                {/* ── SEO TAB ─────────────────────────────────────────────── */}
                {tab === "seo" && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">Page Title</label>
                      <Input value={form.title} onChange={(e) => setF("title", e.target.value)} placeholder="ISP Name WiFi" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">Meta Description</label>
                      <textarea value={form.metaDescription} onChange={(e) => setF("metaDescription", e.target.value)}
                        placeholder="Brief description for search engines (150-160 chars)"
                        maxLength={160} rows={3}
                        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs" />
                      <p className="text-[10px] text-muted-foreground mt-1">{form.metaDescription.length}/160</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">Favicon URL or Upload</label>
                      <div className="space-y-1.5">
                        <input type="file" accept="image/x-icon,image/png,image/svg+xml"
                          onChange={(e) => handleImageUpload(e.currentTarget.files?.[0], "faviconUrl")}
                          className="text-xs w-full file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-secondary file:text-xs file:cursor-pointer" />
                        <Input value={form.faviconUrl} onChange={(e) => setF("faviconUrl", e.target.value)} placeholder="https://... or leave for upload" />
                      </div>
                    </div>
                    <div className="rounded-lg border border-border p-3 space-y-1 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground text-xs">Preview</p>
                      <div className="flex items-center gap-2">
                        {form.faviconUrl && <img src={form.faviconUrl} alt="favicon" className="w-4 h-4" />}
                        <span className="font-medium text-foreground truncate">{form.title || form.companyName || "ISP WiFi"}</span>
                      </div>
                      {form.metaDescription && <p className="opacity-70 line-clamp-2">{form.metaDescription}</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Live Preview */}
            <div className="flex flex-col min-h-0 overflow-hidden">
              <div className="flex items-center gap-2 p-2 border-b border-border bg-background/50 flex-wrap">
                <span className="text-xs text-muted-foreground font-medium">Live Preview</span>
                <div className="flex gap-1 ml-auto">
                  <Button type="button" size="sm" variant={previewMode === "desktop" ? "secondary" : "ghost"} onClick={() => setPreviewMode("desktop")} title="Desktop">
                    <MonitorSmartphone size={13} />
                  </Button>
                  <Button type="button" size="sm" variant={previewMode === "mobile" ? "secondary" : "ghost"} onClick={() => setPreviewMode("mobile")} title="Mobile">
                    <Smartphone size={13} />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setPreviewTheme(previewTheme === "dark" ? "light" : "dark")} title="Toggle theme">
                    <SunMoon size={13} />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setFullscreenPreview(true)} title="Fullscreen">
                    <Maximize2 size={13} />
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-auto flex items-start justify-center p-4 bg-[#111] min-h-0">
                <iframe
                  key={`${livePreviewDoc.length}-${previewMode}-${previewTheme}`}
                  title="Hotspot live preview"
                  srcDoc={livePreviewDoc}
                  className={`rounded-lg border-2 border-border bg-white transition-all ${previewMode === "mobile" ? "w-[375px] h-[680px]" : "w-full h-full min-h-[500px]"}`}
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* ── Preview Modal ──────────────────────────────────────────────────── */}
      <Modal open={!!previewId} onClose={() => { setPreviewId(null); setPreviewModalDevice("desktop"); }} title={`Preview: ${previewTmpl?.name ?? ""}`} className="max-w-3xl">
        {previewTmpl && (() => {
          // Build preview HTML — always produce valid content, never blank
          const previewSrcDoc = (() => {
            try {
              // Case 1: Template has saved HTML content — inject CSS and wrap if needed
              if (previewTmpl.htmlContent && previewTmpl.htmlContent.trim().length > 0) {
                const css = previewTmpl.cssContent ?? "";
                const html = css
                  ? previewTmpl.htmlContent.replace("</head>", `<style>${css}</style></head>`)
                  : previewTmpl.htmlContent;
                // If already a full document, return as-is; otherwise wrap
                if (html.includes("</html>")) return html;
                return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${html}</body></html>`;
              }

              // Case 2: No saved HTML — rebuild from stored template config fields
              const rebuiltForm: TemplateForm = {
                ...EMPTY_FORM,
                name: previewTmpl.name ?? "",
                title: previewTmpl.title ?? previewTmpl.name ?? "",
                companyName: previewTmpl.companyName ?? previewTmpl.name ?? "Skynity",
                logoUrl: previewTmpl.logoUrl ?? "",
                primaryColor: previewTmpl.primaryColor ?? "#06b6d4",
                backgroundColor: previewTmpl.backgroundColor ?? "#0c0f1a",
              };
              return buildPreviewDoc(rebuiltForm, "dark");
            } catch (err) {
              // Case 3: Rendering failed — show friendly error page instead of raw JSON
              return `<!DOCTYPE html>
<html lang="bn">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:system-ui,sans-serif;background:#0c0f1a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
.error-box{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:2rem;max-width:400px}
h1{color:#ef4444;font-size:1.25rem;margin-bottom:0.5rem}
p{color:#94a3b8;font-size:0.875rem}
</style></head>
<body>
<div class="error-box">
<h1>⚠️ Template Rendering Failed</h1>
<p>টেমপ্লেট রেন্ডারিং ব্যর্থ হয়েছে।<br>দয়া করে টেমপ্লেট সেটিংস চেক করুন।</p>
</div>
</body></html>`;
            }
          })();

          const deviceStyles: Record<string, string> = {
            desktop: "w-full h-[520px]",
            android: "w-[393px] h-[852px] mx-auto",
            captive: "w-[375px] h-[600px] mx-auto",
          };

          return (
            <div className="space-y-3">
              {/* Actions */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline"
                    onClick={() => { setPreviewId(null); openEdit(previewTmpl); }}>
                    <Pencil size={13} /> Edit
                  </Button>
                  <Button size="sm" variant="outline"
                    disabled={previewTmpl.isDefault}
                    onClick={() => setSetDefaultTarget({ id: previewTmpl.id, name: previewTmpl.name })}>
                    <Check size={13} /> {previewTmpl.isDefault ? "Is Default" : "Set Default"}
                  </Button>
                  <Button size="sm" disabled={deploy.isPending || !selectedRouter}
                    title={!selectedRouter ? "Select a router first" : "Upload to MikroTik router"}
                    onClick={() => deploy.mutate({ id: previewTmpl.id, routerId: selectedRouter })}>
                    <Upload size={13} /> {deploy.isPending ? "Publishing…" : "Publish to Router"}
                  </Button>
                </div>
                {/* Device switcher */}
                <div className="flex gap-1 rounded-lg border border-border p-0.5 bg-secondary/30">
                  {(["desktop", "android", "captive"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setPreviewModalDevice(mode)}
                      className={`px-2.5 py-1 rounded text-xs transition-colors capitalize ${previewModalDevice === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                      {mode === "captive" ? "Captive" : mode === "android" ? "Android" : "Desktop"}
                    </button>
                  ))}
                </div>
              </div>
              {/* Device frame */}
              <div className={`overflow-auto rounded-xl border border-border bg-[#111] ${previewModalDevice !== "desktop" ? "flex justify-center p-4" : ""}`}>
                <iframe
                  key={`${previewId}-${previewModalDevice}`}
                  title="Template preview"
                  srcDoc={previewSrcDoc}
                  className={`rounded-lg border-2 border-border/50 bg-white ${deviceStyles[previewModalDevice]}`}
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
              {previewModalDevice !== "desktop" && (
                <p className="text-xs text-muted-foreground text-center">
                  {previewModalDevice === "android" ? "Android phone (393×852)" : "Captive browser (375×600)"}
                </p>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* ── Fullscreen Preview ──────────────────────────────────────────────── */}
      {fullscreenPreview && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
          <div className="flex items-center gap-2 p-2 bg-card/90 backdrop-blur border-b border-border">
            <span className="text-sm font-medium flex-1">Fullscreen Preview</span>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant={previewMode === "desktop" ? "secondary" : "ghost"} onClick={() => setPreviewMode("desktop")}><MonitorSmartphone size={14} /></Button>
              <Button type="button" size="sm" variant={previewMode === "mobile" ? "secondary" : "ghost"} onClick={() => setPreviewMode("mobile")}><Smartphone size={14} /></Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setPreviewTheme(previewTheme === "dark" ? "light" : "dark")}><SunMoon size={14} /></Button>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setFullscreenPreview(false)}><X size={16} /></Button>
          </div>
          <div className="flex-1 flex items-center justify-center bg-[#111] p-4 overflow-auto">
            <iframe title="Fullscreen preview" srcDoc={livePreviewDoc}
              key={livePreviewDoc.length}
              className={`bg-white rounded-lg border-2 border-border ${previewMode === "mobile" ? "w-[390px] h-[844px]" : "w-full h-full"}`}
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </div>
      )}

      {/* ── Version History Modal ───────────────────────────────────────────── */}
      <Modal open={showVersions} onClose={() => setShowVersions(false)} title="Version History" className="max-w-lg">
        <VersionHistoryPanel
          currentForm={form}
          onRestore={(f) => { setForm(f); setShowVersions(false); }}
          onClose={() => setShowVersions(false)}
        />
      </Modal>

      {/* ── Set Default Confirm Modal ─────────────────────────────────────────── */}
      <Modal open={!!setDefaultTarget} onClose={() => setSetDefaultTarget(null)} title="Default Template সেট করুন">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-bold text-foreground">{'"'}{setDefaultTarget?.name}{'"'}</span> কে default template করবেন?
            এটি পুরানো default template-কে সরিয়ে দেবে।
          </p>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={update.isPending}
              onClick={() => { if (setDefaultTarget) { update.mutate({ id: setDefaultTarget.id, isDefault: true }); setSetDefaultTarget(null); } }}
            >
              <Check size={13} className="mr-1" /> হ্যাঁ, Set Default করুন
            </Button>
            <Button variant="outline" onClick={() => setSetDefaultTarget(null)}>বাতিল</Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Confirm Modal ──────────────────────────────────────────────── */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="টেমপ্লেট মুছুন">
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-red-500/8 border border-red-500/20 text-center">
            <p className="font-bold text-sm text-red-400">{'"'}{deleteTarget?.name}{'"'}</p>
            <p className="text-xs text-muted-foreground mt-1">এই টেমপ্লেটটি স্থায়ীভাবে মুছে যাবে।</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="destructive" className="flex-1"
              disabled={del.isPending}
              onClick={() => { if (deleteTarget) del.mutate({ id: deleteTarget.id }); setDeleteTarget(null); }}
            >
              {del.isPending ? "Deleting…" : "হ্যাঁ, মুছুন"}
            </Button>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>বাতিল</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
