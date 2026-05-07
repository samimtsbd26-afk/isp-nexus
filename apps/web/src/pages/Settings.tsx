import { useEffect, useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import {
  Plus, Trash2, Wallet, Settings2, MessageSquare, Phone,
  CheckCircle2, RefreshCw, FlaskConical, ScrollText, Wifi, Copy,
} from "lucide-react";
import {
  Card, CardContent, CardHeader, CardTitle, Button, Badge, Input, Select, Empty, Modal,
} from "../components/ui/index";

const PAYMENT_METHODS = ["bkash", "nagad", "rocket", "bank", "cash"] as const;
type PaymentMethod = typeof PAYMENT_METHODS[number];

const METHOD_COLORS: Record<PaymentMethod, string> = {
  bkash: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  nagad: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  rocket: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  bank: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  cash: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
};

const METHOD_EMOJI: Record<PaymentMethod, string> = {
  bkash: "🔴", nagad: "🟠", rocket: "🟣", bank: "🏦", cash: "💵",
};

const EMPTY_PAY = { method: "bkash" as PaymentMethod, accountNumber: "", accountType: "", instructions: "", isActive: true };

const SMS_PROVIDERS = [
  { value: "disabled", label: "Disabled" },
  { value: "ssl_wireless", label: "SSL Wireless" },
  { value: "bulksmsbd", label: "BulkSMSBD" },
  { value: "greenwebbd", label: "GreenWeb BD" },
] as const;

export default function Settings() {
  const [showAdd, setShowAdd] = useState(false);
  const [payForm, setPayForm] = useState(EMPTY_PAY);
  const [settingKey, setSettingKey] = useState("");
  const [settingValue, setSettingValue] = useState("");

  // SMS form
  const [smsForm, setSmsForm] = useState({ provider: "disabled" as string, apiKey: "", apiUser: "", senderId: "SKYNITY", whatsappNumber: "" });
  const [smsChanged, setSmsChanged] = useState(false);

  // Hotspot redirect
  const DEFAULT_HOTSPOT_REDIRECT = "https://portal.skynity.org/welcome?mac=$(mac)&ip=$(ip)";
  const [hotspotRedirect, setHotspotRedirect] = useState(DEFAULT_HOTSPOT_REDIRECT);
  const [hotspotRedirectChanged, setHotspotRedirectChanged] = useState(false);

  const { data: payments, refetch: refetchPayments } = trpc.settings.listPaymentConfigs.useQuery();
  const { data: allSettings, refetch: refetchSettings } = trpc.settings.listAll.useQuery();
  const { data: smsConfig } = trpc.settings.getSmsConfig.useQuery();
  const { data: smsLogs, refetch: refetchSmsLogs } = trpc.settings.getSmsLogs.useQuery({ limit: 20 });
  const { data: hotspotRedirectSetting } = trpc.settings.get.useQuery({ key: "hotspot_redirect_url" });

  useEffect(() => {
    if (smsConfig) {
      setSmsForm({
        provider: smsConfig.provider || "disabled",
        apiKey: smsConfig.apiKey || "",
        apiUser: smsConfig.apiUser || "",
        senderId: smsConfig.senderId || "SKYNITY",
        whatsappNumber: smsConfig.whatsappNumber || "",
      });
    }
  }, [smsConfig]);

  useEffect(() => {
    if (hotspotRedirectSetting) {
      setHotspotRedirect(hotspotRedirectSetting);
      setHotspotRedirectChanged(false);
    }
  }, [hotspotRedirectSetting]);

  const upsertPayment = trpc.settings.upsertPaymentConfig.useMutation({
    onSuccess: () => { refetchPayments(); setShowAdd(false); setPayForm(EMPTY_PAY); toast.success("Payment method saved"); },
    onError: (e) => toast.error(e.message),
  });

  const deletePayment = trpc.settings.deletePaymentConfig.useMutation({
    onSuccess: () => { refetchPayments(); toast.success("Deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const setSetting = trpc.settings.set.useMutation({
    onSuccess: () => { refetchSettings(); setSettingKey(""); setSettingValue(""); toast.success("Saved"); },
    onError: (e) => toast.error(e.message),
  });

  const saveSms = trpc.settings.setSmsConfig.useMutation({
    onSuccess: () => { toast.success("SMS settings saved"); setSmsChanged(false); },
    onError: (e) => toast.error(e.message),
  });

  const saveHotspotRedirect = trpc.settings.set.useMutation({
    onSuccess: () => { refetchSettings(); setHotspotRedirectChanged(false); toast.success("Hotspot redirect URL saved"); },
    onError: (e) => toast.error(e.message),
  });

  const updateSms = <K extends keyof typeof smsForm>(k: K, v: typeof smsForm[K]) => {
    setSmsForm((p) => ({ ...p, [k]: v }));
    setSmsChanged(true);
  };

  const smsStatusColor = (status: string) => {
    if (status === "sent") return "text-emerald-400";
    if (status === "failed") return "text-red-400";
    return "text-slate-400";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm">Organization settings, payment configuration, and notifications</p>
      </div>

      {/* ── Hotspot Redirect URL ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi size={16} className="text-muted-foreground" />
            Hotspot Redirect URL
            <Badge variant="info" className="text-[10px]">MikroTik</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Set this URL as the redirect address in your MikroTik hotspot login page. The portal will greet customers after login.
          </p>
          <div className="flex gap-2">
            <Input
              value={hotspotRedirect}
              onChange={(e) => { setHotspotRedirect(e.target.value); setHotspotRedirectChanged(true); }}
              placeholder="https://portal.skynity.org/welcome?mac=$(mac)&ip=$(ip)"
              className="flex-1 font-mono text-xs"
            />
            <Button
              variant="outline" size="icon"
              onClick={() => { navigator.clipboard.writeText(hotspotRedirect); toast.success("Copied!"); }}
              title="Copy URL">
              <Copy size={14} />
            </Button>
            <Button
              onClick={() => saveHotspotRedirect.mutate({ key: "hotspot_redirect_url", value: hotspotRedirect })}
              disabled={saveHotspotRedirect.isPending || !hotspotRedirectChanged}>
              {saveHotspotRedirect.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400 space-y-1">
            <p className="font-semibold">MikroTik Hotspot Setup</p>
            <p>In Winbox: IP → Hotspot → Server → Login Page → Login-by: mac,cookie</p>
            <p>Set <span className="font-mono">redirect-url</span> to the URL above.</p>
            <p className="font-mono text-[11px] bg-black/30 rounded px-2 py-1 mt-1">
              /ip hotspot walled-garden add dst-host=portal.skynity.org
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Payment Numbers ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Wallet size={16} className="text-muted-foreground" />
            Payment Numbers
            <Badge variant="info" className="text-[10px]">Customer-visible</Badge>
          </CardTitle>
          <Button size="sm" onClick={() => setShowAdd(true)}><Plus size={14} /> Add</Button>
        </CardHeader>
        <CardContent>
          {payments && payments.length > 0 ? (
            <div className="space-y-2">
              {payments.map((p) => (
                <div key={p.id} className={`flex items-center gap-3 p-3 rounded-lg border ${METHOD_COLORS[p.method as PaymentMethod] ?? "border-border bg-secondary/20"}`}>
                  <span className="text-xl shrink-0">{METHOD_EMOJI[p.method as PaymentMethod] ?? "💳"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm uppercase">{p.method}</p>
                      {p.accountType && <span className="text-[10px] text-muted-foreground">({p.accountType})</span>}
                    </div>
                    <p className="text-base font-mono font-bold mt-0.5">{p.accountNumber}</p>
                    {p.instructions && <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.instructions}</p>}
                  </div>
                  <Badge variant={p.isActive ? "success" : "default"}>{p.isActive ? "Active" : "Off"}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => { if (globalThis.confirm(`Delete ${p.method}?`)) deletePayment.mutate({ id: p.id }); }}>
                    <Trash2 size={13} className="text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <Empty message="No payment methods yet — add bKash, Nagad, Rocket numbers for customers" />
          )}
        </CardContent>
      </Card>

      {/* ── WhatsApp Support ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone size={16} className="text-muted-foreground" />
            WhatsApp Support Number
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={smsForm.whatsappNumber}
              onChange={(e) => updateSms("whatsappNumber", e.target.value)}
              placeholder="https://wa.me/8801XXXXXXXXX"
              className="flex-1"
            />
            <Button
              onClick={() => saveSms.mutate({ provider: smsForm.provider as any, apiKey: smsForm.apiKey, apiUser: smsForm.apiUser, senderId: smsForm.senderId, whatsappNumber: smsForm.whatsappNumber })}
              disabled={saveSms.isPending || !smsChanged}>
              {saveSms.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Shown on the customer portal landing page as a support contact.</p>
        </CardContent>
      </Card>

      {/* ── SMS Configuration ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare size={16} className="text-muted-foreground" />
            SMS Notifications
            <Badge variant={smsForm.provider !== "disabled" ? "success" : "default"}>
              {smsForm.provider !== "disabled" ? "Active" : "Disabled"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            When enabled, customers receive an SMS when their payment is approved and when their package expires.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">SMS Provider</label>
              <Select value={smsForm.provider} onChange={(e) => updateSms("provider", e.target.value)} className="w-full">
                {SMS_PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Sender ID / Name</label>
              <Input value={smsForm.senderId} onChange={(e) => updateSms("senderId", e.target.value)} placeholder="SKYNITY" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">API Key / Token</label>
              <Input value={smsForm.apiKey} onChange={(e) => updateSms("apiKey", e.target.value)} placeholder="Your API key" type="password" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">API Username <span className="text-muted-foreground/60">(BulkSMSBD)</span></label>
              <Input value={smsForm.apiUser} onChange={(e) => updateSms("apiUser", e.target.value)} placeholder="Username (optional)" />
            </div>
          </div>

          {/* Provider docs hint */}
          {smsForm.provider !== "disabled" && (
            <div className="p-3 rounded-lg border border-border bg-secondary/30 text-xs text-muted-foreground space-y-1">
              {smsForm.provider === "ssl_wireless" && <><p><strong>SSL Wireless:</strong> Get API token from globalsms.sslwireless.com</p><p>Sender ID must be pre-approved.</p></>}
              {smsForm.provider === "bulksmsbd" && <><p><strong>BulkSMSBD:</strong> Get API key from bulksmsbd.net</p><p>Sender ID must match your account.</p></>}
              {smsForm.provider === "greenwebbd" && <><p><strong>GreenWeb:</strong> Get API token from greenweb.com.bd</p><p>Contact their support for sender ID registration.</p></>}
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={() => saveSms.mutate({ provider: smsForm.provider as any, apiKey: smsForm.apiKey, apiUser: smsForm.apiUser, senderId: smsForm.senderId, whatsappNumber: smsForm.whatsappNumber })}
              disabled={saveSms.isPending || !smsChanged} className="flex items-center gap-2">
              <CheckCircle2 size={14} />
              {saveSms.isPending ? "Saving…" : "Save SMS Config"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setSmsChanged(false); if (smsConfig) setSmsForm({ provider: smsConfig.provider || "disabled", apiKey: smsConfig.apiKey || "", apiUser: smsConfig.apiUser || "", senderId: smsConfig.senderId || "SKYNITY", whatsappNumber: smsConfig.whatsappNumber || "" }); }}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── SMS Logs ──────────────────────────────────────────────────────── */}
      {smsLogs && smsLogs.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ScrollText size={16} className="text-muted-foreground" />
              SMS Delivery Logs
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => refetchSmsLogs()}><RefreshCw size={13} /> Refresh</Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["Time", "Phone", "Status", "Provider", "Error"].map((h) => (
                      <th key={h} className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {smsLogs.map((log) => (
                    <tr key={log.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                      <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-2 font-mono text-xs">{log.phone}</td>
                      <td className={`px-4 py-2 text-xs font-semibold ${smsStatusColor(log.status)}`}>{log.status}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{log.provider ?? "—"}</td>
                      <td className="px-4 py-2 text-xs text-red-400 max-w-48 truncate">{log.error ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Advanced / Raw Settings ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 size={16} className="text-muted-foreground" />
            Advanced Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder="Key (e.g. company_name)" value={settingKey} onChange={(e) => setSettingKey(e.target.value)} className="flex-1" />
            <Input placeholder="Value" value={settingValue} onChange={(e) => setSettingValue(e.target.value)} className="flex-1" />
            <Button onClick={() => { if (settingKey && settingValue) setSetting.mutate({ key: settingKey, value: settingValue }); }} disabled={!settingKey || !settingValue || setSetting.isPending}>Save</Button>
          </div>
          {allSettings && allSettings.filter((s) => !["sms_api_key", "sms_api_user"].includes(s.key)).length > 0 && (
            <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
              {allSettings.filter((s) => !["sms_api_key", "sms_api_user"].includes(s.key)).map((s) => (
                <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{s.key}</span>
                  <span className="text-sm">{s.key.includes("key") || s.key.includes("secret") ? "••••••••" : s.value}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment method modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Payment Method">
        <form onSubmit={(e) => { e.preventDefault(); upsertPayment.mutate(payForm); }} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Method</label>
            <Select title="Method" value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value as PaymentMethod })} className="w-full">
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_EMOJI[m]} {m.toUpperCase()}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Account Number *</label>
            <Input value={payForm.accountNumber} onChange={(e) => setPayForm({ ...payForm, accountNumber: e.target.value })} required placeholder="01XXXXXXXXX" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Account Type</label>
            <Input value={payForm.accountType} onChange={(e) => setPayForm({ ...payForm, accountType: e.target.value })} placeholder="Personal / Merchant / Agent" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Customer Instructions</label>
            <Input value={payForm.instructions} onChange={(e) => setPayForm({ ...payForm, instructions: e.target.value })} placeholder="e.g. Send Money → Enter number → Enter amount" />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="accent-primary" checked={payForm.isActive} onChange={(e) => setPayForm({ ...payForm, isActive: e.target.checked })} />
            <span>Active (visible to customers)</span>
          </label>
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1" disabled={upsertPayment.isPending}>{upsertPayment.isPending ? "Saving…" : "Save Method"}</Button>
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
