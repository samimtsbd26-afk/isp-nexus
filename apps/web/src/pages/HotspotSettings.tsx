import { useEffect, useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Link } from "react-router";
import {
  Wifi, Globe, Settings2, CreditCard, MonitorSmartphone,
  Network, RefreshCw, Save, AlertTriangle, ExternalLink,
  Plus, Trash2, CheckCircle2,
} from "lucide-react";
import {
  Card, CardContent, CardHeader, CardTitle, Button, Badge,
  Input, Select,
} from "../components/ui/index";

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function SectionCard({
  icon, title, badge, action, children,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3 gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="text-muted-foreground">{icon}</span>
          {title}
          {badge}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground/70 mt-1">{hint}</p>}
    </div>
  );
}

function SaveRow({ onSave, onReset, loading, dirty }: { onSave: () => void; onReset: () => void; loading: boolean; dirty: boolean }) {
  return (
    <div className="flex gap-2 pt-1">
      <Button onClick={onSave} disabled={loading || !dirty} className="h-9">
        {loading ? <><RefreshCw size={12} className="animate-spin mr-1.5" />Saving…</> : <><Save size={12} className="mr-1.5" />Save</>}
      </Button>
      <Button variant="outline" size="sm" className="h-9" onClick={onReset} disabled={loading}>Reset</Button>
    </div>
  );
}

/* ── Default config ──────────────────────────────────────────────────────── */
const DEFAULT_CFG: Record<string, string> = {
  hotspot_portal_name: "",
  hotspot_primary_domain: "",
  hotspot_backup_domain: "",
  hotspot_api_domain: "",
  hotspot_logo_url: "",
  hotspot_theme_color: "#38bdf8",
  hotspot_bg_color: "#0f172a",
  hotspot_mikrotik_gateway: "",
  hotspot_mikrotik_login_url: "",
  hotspot_mikrotik_status_url: "",
  hotspot_mikrotik_logout_url: "",
  hotspot_trial_enabled: "true",
  hotspot_approval_mode: "manual",
  hotspot_session_timeout: "86400",
  hotspot_device_limit: "1",
  hotspot_cookie_lifetime: "604800",
  hotspot_language: "bn",
  hotspot_template: "default",
  hotspot_bg_type: "gradient",
  hotspot_animation: "true",
  hotspot_redirect_url: "",
};

/* ── Main component ──────────────────────────────────────────────────────── */
export default function HotspotSettings() {
  const [cfg, setCfg] = useState<Record<string, string>>(DEFAULT_CFG);
  const [saved, setSaved] = useState<Record<string, string>>(DEFAULT_CFG);
  const [dirty, setDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "mikrotik" | "payment" | "ui" | "network">("general");
  const [paymentForm, setPaymentForm] = useState({ method: "bkash" as string, accountNumber: "", accountType: "", instructions: "" });
  const [editingPayment, setEditingPayment] = useState<number | null>(null);

  const { data: hotspotCfg, refetch } = trpc.settings.getHotspotConfig.useQuery();
  const { data: paymentConfigs, refetch: refetchPayments } = trpc.settings.listPaymentConfigs.useQuery();

  const upsertPayment = trpc.settings.upsertPaymentConfig.useMutation({
    onSuccess: () => { refetchPayments(); setEditingPayment(null); setPaymentForm({ method: "bkash", accountNumber: "", accountType: "", instructions: "" }); toast.success("Payment config saved"); },
    onError: (e) => toast.error(e.message),
  });
  const deletePayment = trpc.settings.deletePaymentConfig.useMutation({
    onSuccess: () => { refetchPayments(); toast.success("Removed"); },
    onError: (e) => toast.error(e.message),
  });
  const applyMikroTik = trpc.settings.applyCaddyConfig.useMutation({
    onSuccess: () => toast.success("Caddy config applied"),
    onError: (e) => toast.error(e.message),
  });

  const saveMutation = trpc.settings.setHotspotConfig.useMutation({
    onSuccess: () => {
      setSaved(cfg);
      setDirty(false);
      refetch();
      toast.success("Hotspot config saved");
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (!hotspotCfg) return;
    const merged = { ...DEFAULT_CFG, ...hotspotCfg };
    setCfg(merged);
    setSaved(merged);
    setDirty(false);
  }, [hotspotCfg]);

  const set = (key: string, value: string) => {
    setCfg((p) => ({ ...p, [key]: value }));
    setDirty(true);
  };

  const reset = () => {
    setCfg(saved);
    setDirty(false);
  };

  const save = () => saveMutation.mutate(cfg);

  /* ── Tabs ── */
  const tabs = [
    { id: "general",  label: "General",  icon: <Settings2 size={13} /> },
    { id: "mikrotik", label: "MikroTik", icon: <Wifi size={13} /> },
    { id: "payment",  label: "Payment",  icon: <CreditCard size={13} /> },
    { id: "ui",       label: "UI",       icon: <MonitorSmartphone size={13} /> },
    { id: "network",  label: "Network",  icon: <Network size={13} /> },
  ] as const;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-muted border">
          <Wifi className="w-5 h-5 text-sky-400" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">Hotspot Settings</h1>
          <p className="text-sm text-muted-foreground">Admin Panel থেকে সব কিছু control করুন</p>
        </div>
        {dirty && <Badge variant="warning" className="text-[10px]">Unsaved changes</Badge>}
        <Link to="/hotspot-debug">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <ExternalLink size={11} /> Debug Center
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-sky-400 text-sky-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          GENERAL TAB
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === "general" && (
        <SectionCard icon={<Globe size={15} />} title="General Settings" badge={<Badge variant="info" className="text-[10px]">Domains</Badge>}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Portal Name" hint="Customer দেখতে পাবে">
                <Input
                  value={cfg.hotspot_portal_name}
                  onChange={(e) => set("hotspot_portal_name", e.target.value)}
                  placeholder="Skynity WiFi"
                />
              </Field>
              <Field label="Language">
                <Select value={cfg.hotspot_language} onChange={(e) => set("hotspot_language", e.target.value)} className="w-full">
                  <option value="bn">বাংলা</option>
                  <option value="en">English</option>
                </Select>
              </Field>
              <Field
                label="Primary Domain (Portal URL)"
                hint="Customer এখানে redirect হবে — e.g. https://wifi.skynity.org"
              >
                <Input
                  value={cfg.hotspot_primary_domain}
                  onChange={(e) => set("hotspot_primary_domain", e.target.value)}
                  placeholder="https://wifi.skynity.org"
                  className="font-mono text-xs"
                />
              </Field>
              <Field
                label="Backup Domain"
                hint="Primary down হলে fallback"
              >
                <Input
                  value={cfg.hotspot_backup_domain}
                  onChange={(e) => set("hotspot_backup_domain", e.target.value)}
                  placeholder="https://wifi.skynity.cloud"
                  className="font-mono text-xs"
                />
              </Field>
              <Field
                label="API Domain"
                hint="API server URL — e.g. https://api.skynity.org"
              >
                <Input
                  value={cfg.hotspot_api_domain}
                  onChange={(e) => set("hotspot_api_domain", e.target.value)}
                  placeholder="https://api.skynity.org"
                  className="font-mono text-xs"
                />
              </Field>
              <Field label="Redirect URL (MikroTik)" hint="MikroTik hotspot login page redirect">
                <Input
                  value={cfg.hotspot_redirect_url}
                  onChange={(e) => set("hotspot_redirect_url", e.target.value)}
                  placeholder={`${cfg.hotspot_primary_domain || "https://hotspot.skynity.org"}/login?mac=$(mac)&ip=$(ip)`}
                  className="font-mono text-xs"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Logo URL" hint="Portal header-এ দেখাবে">
                <Input
                  value={cfg.hotspot_logo_url}
                  onChange={(e) => set("hotspot_logo_url", e.target.value)}
                  placeholder="https://..."
                  className="font-mono text-xs"
                />
              </Field>
              <Field label="Theme Color">
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={cfg.hotspot_theme_color || "#38bdf8"}
                    onChange={(e) => set("hotspot_theme_color", e.target.value)}
                    className="h-9 w-12 rounded border border-border cursor-pointer bg-transparent"
                  />
                  <Input
                    value={cfg.hotspot_theme_color}
                    onChange={(e) => set("hotspot_theme_color", e.target.value)}
                    placeholder="#38bdf8"
                    className="font-mono text-xs flex-1"
                  />
                </div>
              </Field>
              <Field label="Background Color">
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={cfg.hotspot_bg_color || "#0f172a"}
                    onChange={(e) => set("hotspot_bg_color", e.target.value)}
                    className="h-9 w-12 rounded border border-border cursor-pointer bg-transparent"
                  />
                  <Input
                    value={cfg.hotspot_bg_color}
                    onChange={(e) => set("hotspot_bg_color", e.target.value)}
                    placeholder="#0f172a"
                    className="font-mono text-xs flex-1"
                  />
                </div>
              </Field>
            </div>

            {/* Preview */}
            <div
              className="rounded-xl border p-4 flex items-center gap-3"
              style={{ background: cfg.hotspot_bg_color || "#0f172a", borderColor: cfg.hotspot_theme_color + "44" }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                style={{ background: cfg.hotspot_theme_color || "#38bdf8" }}
              >
                W
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: cfg.hotspot_theme_color || "#38bdf8" }}>
                  {cfg.hotspot_portal_name || "WiFi Portal"}
                </p>
                <p className="text-xs" style={{ color: "#94a3b8" }}>Preview</p>
              </div>
            </div>

            <SaveRow onSave={save} onReset={reset} loading={saveMutation.isPending} dirty={dirty} />
          </div>
        </SectionCard>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MIKROTIK TAB
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === "mikrotik" && (
        <SectionCard icon={<Wifi size={15} />} title="MikroTik Settings" badge={<Badge variant="info" className="text-[10px]">Router</Badge>}>
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-900 space-y-1 mb-4">
              <p className="font-bold flex items-center gap-1.5"><AlertTriangle size={11} /> MikroTik Winbox Setup</p>
              <p>IP → Hotspot → Server Profiles → Login Page → <code className="bg-muted text-foreground px-1 rounded">login-by-</code></p>
              <p className="font-mono text-[10px] bg-muted text-foreground rounded px-2 py-1 select-all">
                /ip hotspot walled-garden add dst-host={cfg.hotspot_primary_domain?.replace("https://","").replace("http://","") || "wifi.skynity.org"}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Gateway IP" hint="MikroTik hotspot gateway IP">
                <Input
                  value={cfg.hotspot_mikrotik_gateway}
                  onChange={(e) => set("hotspot_mikrotik_gateway", e.target.value)}
                  placeholder="192.168.88.1"
                  className="font-mono"
                />
              </Field>
              <Field label="Login URL" hint="MikroTik login endpoint">
                <Input
                  value={cfg.hotspot_mikrotik_login_url}
                  onChange={(e) => set("hotspot_mikrotik_login_url", e.target.value)}
                  placeholder="$(link-login-only)"
                  className="font-mono text-xs"
                />
              </Field>
              <Field label="Status URL" hint="MikroTik status page URL">
                <Input
                  value={cfg.hotspot_mikrotik_status_url}
                  onChange={(e) => set("hotspot_mikrotik_status_url", e.target.value)}
                  placeholder="$(link-status)"
                  className="font-mono text-xs"
                />
              </Field>
              <Field label="Logout URL" hint="MikroTik logout endpoint">
                <Input
                  value={cfg.hotspot_mikrotik_logout_url}
                  onChange={(e) => set("hotspot_mikrotik_logout_url", e.target.value)}
                  placeholder="$(link-logout)"
                  className="font-mono text-xs"
                />
              </Field>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
              <p className="font-semibold text-foreground mb-2">MikroTik Walled Garden Commands</p>
              {[
                `/ip hotspot walled-garden add dst-host=${cfg.hotspot_primary_domain?.replace(/^https?:\/\//,"") || "wifi.skynity.org"}`,
                `/ip hotspot walled-garden add dst-host=${cfg.hotspot_api_domain?.replace(/^https?:\/\//,"") || "api.skynity.org"}`,
                `/ip hotspot walled-garden add dst-host=${cfg.hotspot_backup_domain?.replace(/^https?:\/\//,"") || "wifi.skynity.cloud"}`,
              ].map((cmd) => (
                <p key={cmd} className="font-mono text-[10px] bg-background rounded px-2 py-1 select-all border">{cmd}</p>
              ))}
            </div>

            <div className="flex gap-2 pt-1 items-center">
              <SaveRow onSave={save} onReset={reset} loading={saveMutation.isPending} dirty={dirty} />
              <Button variant="outline" size="sm" className="h-9 ml-2 text-xs gap-1.5"
                onClick={() => applyMikroTik.mutate()} disabled={applyMikroTik.isPending}>
                {applyMikroTik.isPending
                  ? <><RefreshCw size={11} className="animate-spin" />Applying…</>
                  : <><CheckCircle2 size={11} />Apply Caddy Config</>}
              </Button>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ══════════════════════════════════════════════════════════════
          PAYMENT TAB
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === "payment" && (
        <div className="space-y-4">
          <SectionCard icon={<CreditCard size={15} />} title="Approval Settings" badge={<Badge variant="info" className="text-[10px]">Portal</Badge>}>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Trial / Free Period">
                  <Select value={cfg.hotspot_trial_enabled} onChange={(e) => set("hotspot_trial_enabled", e.target.value)} className="w-full">
                    <option value="true">Enabled — customer পারবে trial নিতে</option>
                    <option value="false">Disabled — trial বন্ধ</option>
                  </Select>
                </Field>
                <Field label="Approval Mode" hint="Payment এর পর কীভাবে approve হবে">
                  <Select value={cfg.hotspot_approval_mode} onChange={(e) => set("hotspot_approval_mode", e.target.value)} className="w-full">
                    <option value="manual">Manual — Admin approve করবে</option>
                    <option value="auto">Auto — Payment verify হলেই active</option>
                  </Select>
                </Field>
              </div>
              <SaveRow onSave={save} onReset={reset} loading={saveMutation.isPending} dirty={dirty} />
            </div>
          </SectionCard>

          {/* Payment method accounts */}
          <SectionCard icon={<CreditCard size={15} />} title="Payment Methods" badge={<Badge className="text-[10px]">{paymentConfigs?.length ?? 0}</Badge>}>
            <div className="space-y-3">
              {/* Existing configs */}
              {(paymentConfigs ?? []).map((pc) => (
                <div key={pc.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                  <Badge className="text-[10px] shrink-0 capitalize">{pc.method}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono font-medium truncate">{pc.accountNumber}</p>
                    {pc.accountType && <p className="text-xs text-muted-foreground">{pc.accountType}</p>}
                    {pc.instructions && <p className="text-xs text-muted-foreground truncate">{pc.instructions}</p>}
                  </div>
                  <Badge variant={pc.isActive ? "success" : "secondary"} className="text-[10px] shrink-0">
                    {pc.isActive ? "Active" : "Off"}
                  </Badge>
                  <button type="button" onClick={() => {
                    setEditingPayment(pc.id);
                    setPaymentForm({ method: pc.method, accountNumber: pc.accountNumber, accountType: pc.accountType ?? "", instructions: pc.instructions ?? "" });
                  }} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Edit</button>
                  <button type="button" onClick={() => deletePayment.mutate({ id: pc.id })}
                    className="text-muted-foreground hover:text-red-400 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}

              {/* Add / edit form */}
              <div className="rounded-lg border border-dashed p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  {editingPayment ? "Edit payment method" : "Add payment method"}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Method">
                    <Select value={paymentForm.method} onChange={(e) => setPaymentForm((p) => ({ ...p, method: e.target.value }))} className="w-full">
                      {["bkash", "nagad", "rocket", "cash", "bank"].map((m) => (
                        <option key={m} value={m} className="capitalize">{m.charAt(0).toUpperCase() + m.slice(1)}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Account Number">
                    <Input value={paymentForm.accountNumber} onChange={(e) => setPaymentForm((p) => ({ ...p, accountNumber: e.target.value }))}
                      placeholder="01XXXXXXXXX" className="font-mono" />
                  </Field>
                  <Field label="Account Type (optional)" hint="Personal / Agent / Merchant">
                    <Input value={paymentForm.accountType} onChange={(e) => setPaymentForm((p) => ({ ...p, accountType: e.target.value }))}
                      placeholder="Personal" />
                  </Field>
                  <Field label="Instructions (optional)">
                    <Input value={paymentForm.instructions} onChange={(e) => setPaymentForm((p) => ({ ...p, instructions: e.target.value }))}
                      placeholder="Send money, reference: your phone" />
                  </Field>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="h-8 text-xs"
                    onClick={() => upsertPayment.mutate({ ...paymentForm as any, isActive: true })}
                    disabled={!paymentForm.accountNumber || upsertPayment.isPending}>
                    {upsertPayment.isPending
                      ? <><RefreshCw size={11} className="animate-spin mr-1" />Saving…</>
                      : <><Plus size={11} className="mr-1" />{editingPayment ? "Update" : "Add Method"}</>
                    }
                  </Button>
                  {editingPayment && (
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setEditingPayment(null); setPaymentForm({ method: "bkash", accountNumber: "", accountType: "", instructions: "" }); }}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          UI TAB
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === "ui" && (
        <SectionCard icon={<MonitorSmartphone size={15} />} title="UI & Appearance">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Template">
                <Select value={cfg.hotspot_template} onChange={(e) => set("hotspot_template", e.target.value)} className="w-full">
                  <option value="default">Default (Dark)</option>
                  <option value="light">Light</option>
                  <option value="minimal">Minimal</option>
                  <option value="branded">Branded</option>
                </Select>
              </Field>
              <Field label="Background Type">
                <Select value={cfg.hotspot_bg_type} onChange={(e) => set("hotspot_bg_type", e.target.value)} className="w-full">
                  <option value="gradient">Gradient</option>
                  <option value="solid">Solid Color</option>
                  <option value="image">Image</option>
                  <option value="animated">Animated</option>
                </Select>
              </Field>
              <Field label="Animation">
                <Select value={cfg.hotspot_animation} onChange={(e) => set("hotspot_animation", e.target.value)} className="w-full">
                  <option value="true">Enabled</option>
                  <option value="false">Disabled (faster load)</option>
                </Select>
              </Field>
            </div>
            <SaveRow onSave={save} onReset={reset} loading={saveMutation.isPending} dirty={dirty} />
          </div>
        </SectionCard>
      )}

      {/* ══════════════════════════════════════════════════════════════
          NETWORK TAB
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === "network" && (
        <SectionCard icon={<Network size={15} />} title="Network & Sessions">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Session Timeout (seconds)" hint="Default: 86400 (24h)">
                <Input
                  type="number"
                  value={cfg.hotspot_session_timeout}
                  onChange={(e) => set("hotspot_session_timeout", e.target.value)}
                  placeholder="86400"
                  className="font-mono"
                />
              </Field>
              <Field label="Device Limit per account" hint="Per customer device limit">
                <Input
                  type="number"
                  value={cfg.hotspot_device_limit}
                  onChange={(e) => set("hotspot_device_limit", e.target.value)}
                  placeholder="1"
                  className="font-mono"
                />
              </Field>
              <Field label="Cookie Lifetime (seconds)" hint="Default: 604800 (7 days)">
                <Input
                  type="number"
                  value={cfg.hotspot_cookie_lifetime}
                  onChange={(e) => set("hotspot_cookie_lifetime", e.target.value)}
                  placeholder="604800"
                  className="font-mono"
                />
              </Field>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
              <p className="font-semibold text-foreground mb-1">Current values</p>
              <div className="grid grid-cols-2 gap-1">
                {[
                  ["Session timeout", `${Math.round(Number(cfg.hotspot_session_timeout || 86400) / 3600)}h`],
                  ["Device limit", cfg.hotspot_device_limit || "1"],
                  ["Cookie lifetime", `${Math.round(Number(cfg.hotspot_cookie_lifetime || 604800) / 86400)}d`],
                  ["Trial", cfg.hotspot_trial_enabled === "true" ? "Enabled" : "Disabled"],
                  ["Approval", cfg.hotspot_approval_mode || "manual"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between px-2 py-1 bg-background rounded border">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-mono font-semibold text-foreground">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <SaveRow onSave={save} onReset={reset} loading={saveMutation.isPending} dirty={dirty} />
          </div>
        </SectionCard>
      )}

    </div>
  );
}
