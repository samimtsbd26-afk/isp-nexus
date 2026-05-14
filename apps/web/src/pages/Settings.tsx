import { useEffect, useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import {
  Plus, Trash2, Wallet, Settings2, MessageSquare, Phone,
  CheckCircle2, RefreshCw, ScrollText, Wifi, Copy, Save,
  ChevronDown, AlertTriangle, Send,
} from "lucide-react";
import {
  Card, CardContent, CardHeader, CardTitle, Button, Badge,
  Input, Select, Empty, Modal,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "../components/ui/index";

/* ── Constants ─────────────────────────────────────────────────────────── */
const PAYMENT_METHODS = ["bkash", "nagad", "rocket", "bank", "cash"] as const;
type PaymentMethod = typeof PAYMENT_METHODS[number];

const METHOD_META: Record<PaymentMethod, { emoji: string; color: string; label: string }> = {
  bkash:  { emoji: "🔴", label: "bKash",  color: "text-pink-400   bg-pink-500/10   border-pink-500/20"   },
  nagad:  { emoji: "🟠", label: "Nagad",  color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  rocket: { emoji: "🟣", label: "Rocket", color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  bank:   { emoji: "🏦", label: "Bank",   color: "text-blue-400   bg-blue-500/10   border-blue-500/20"   },
  cash:   { emoji: "💵", label: "Cash",   color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
};

const SMS_PROVIDERS = [
  { value: "disabled",   label: "— Disabled —"  },
  { value: "ssl_wireless", label: "SSL Wireless" },
  { value: "bulksmsbd",  label: "BulkSMSBD"     },
  { value: "greenwebbd", label: "GreenWeb BD"    },
] as const;

const EMPTY_PAY = {
  method: "bkash" as PaymentMethod,
  accountNumber: "", accountType: "", instructions: "", isActive: true,
};

/* ── Main component ─────────────────────────────────────────────────────── */
export default function Settings() {
  /* Payment modal */
  const [showAddPay, setShowAddPay]   = useState(false);
  const [showDelPay, setShowDelPay]   = useState<number | null>(null);
  const [payForm, setPayForm]         = useState(EMPTY_PAY);

  /* Advanced settings */
  const [settingKey, setSettingKey]   = useState("");
  const [settingVal, setSettingVal]   = useState("");
  const [showDelKey, setShowDelKey]   = useState<string | null>(null);

  /* SMS config — separate dirty flags */
  const [smsForm, setSmsForm] = useState({
    provider: "disabled" as string,
    apiKey: "", apiUser: "", senderId: "SKYNITY",
  });
  const [smsDirty, setSmsDirty] = useState(false);

  /* WhatsApp — separate from SMS */
  const [waNumber, setWaNumber]   = useState("");
  const [waDirty, setWaDirty]     = useState(false);

  /* AI Integration */
  const [aiProvider, setAiProvider] = useState("openai");
  const [aiKey, setAiKey]         = useState("");
  const [aiModel, setAiModel]     = useState("gpt-4o-mini");
  const [aiEnabled, setAiEnabled] = useState(false);

  /* Hotspot redirect */
  const DEFAULT_REDIRECT = "https://wifi.skynity.org/welcome?mac=$(mac)&ip=$(ip)";
  const [hotspotUrl, setHotspotUrl]     = useState(DEFAULT_REDIRECT);
  const [hotspotDirty, setHotspotDirty] = useState(false);

  /* Test SMS */
  const [testPhone, setTestPhone]   = useState("");
  const [showTestSms, setShowTestSms] = useState(false);

  /* ── Queries ── */
  const { data: payments,   refetch: refetchPay  } = trpc.settings.listPaymentConfigs.useQuery();
  const { data: allSettings, refetch: refetchAll } = trpc.settings.listAll.useQuery();
  const { data: smsConfig  }                       = trpc.settings.getSmsConfig.useQuery();
  const { data: smsLogs,   refetch: refetchLogs  } = trpc.settings.getSmsLogs.useQuery({ limit: 20 });
  const { data: redirectVal }                      = trpc.settings.get.useQuery({ key: "hotspot_redirect_url" });
  const { data: aiConfig,   refetch: refetchAi   } = trpc.ai.getConfig.useQuery();

  /* Seed forms from server */
  useEffect(() => {
    if (!smsConfig) return;
    setSmsForm({
      provider:  smsConfig.provider    || "disabled",
      apiKey:    smsConfig.apiKey      || "",
      apiUser:   smsConfig.apiUser     || "",
      senderId:  smsConfig.senderId    || "SKYNITY",
    });
    setWaNumber(smsConfig.whatsappNumber || "");
    setSmsDirty(false);
    setWaDirty(false);
  }, [smsConfig]);

  useEffect(() => {
    if (!aiConfig) return;
    setAiProvider(aiConfig.provider || "openai");
    setAiModel(aiConfig.model || "gpt-4o-mini");
    setAiEnabled(aiConfig.enabled ?? false);
    // API key not returned for security
  }, [aiConfig]);

  useEffect(() => {
    if (redirectVal == null) return;
    setHotspotUrl(redirectVal);
    setHotspotDirty(false);
  }, [redirectVal]);

  /* ── Mutations ── */
  const upsertPay = trpc.settings.upsertPaymentConfig.useMutation({
    onSuccess: () => { refetchPay(); setShowAddPay(false); setPayForm(EMPTY_PAY); toast.success("Payment method saved"); },
    onError: (e) => toast.error(e.message),
  });
  const deletePay = trpc.settings.deletePaymentConfig.useMutation({
    onSuccess: () => { refetchPay(); setShowDelPay(null); toast.success("Deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const saveSetting = trpc.settings.set.useMutation({
    onSuccess: () => { refetchAll(); setSettingKey(""); setSettingVal(""); toast.success("Setting saved"); },
    onError: (e) => toast.error(e.message),
  });
  // Re-use set mutation for delete (set value to empty string is a workaround; ideally backend has delete)
  const deleteSetting = trpc.settings.set.useMutation({
    onSuccess: () => { refetchAll(); setShowDelKey(null); toast.success("Setting cleared"); },
    onError: (e) => toast.error(e.message),
  });

  const saveSms = trpc.settings.setSmsConfig.useMutation({
    onSuccess: () => { setSmsDirty(false); toast.success("SMS config saved"); },
    onError: (e) => toast.error(e.message),
  });

  const saveWa = trpc.settings.setSmsConfig.useMutation({
    onSuccess: () => { setWaDirty(false); toast.success("WhatsApp number saved"); },
    onError: (e) => toast.error(e.message),
  });

  const saveAi = trpc.ai.saveConfig.useMutation({
    onSuccess: () => { refetchAi(); toast.success("AI config saved"); },
    onError: (e) => toast.error(e.message),
  });

  const saveRedirect = trpc.settings.set.useMutation({
    onSuccess: () => { refetchAll(); setHotspotDirty(false); toast.success("Redirect URL saved"); },
    onError: (e) => toast.error(e.message),
  });

  /* ── Handlers ── */
  const updateSms = <K extends keyof typeof smsForm>(k: K, v: typeof smsForm[K]) => {
    setSmsForm((p) => ({ ...p, [k]: v }));
    setSmsDirty(true);
  };

  const smsStatusVariant = (s: string) =>
    s === "sent" ? "success" : s === "failed" ? "destructive" : "default";

  /* Helper: mask sensitive values in the settings table */
  const maskValue = (key: string, value: string) =>
    /key|secret|token|password/i.test(key) ? "••••••••" : value;

  /* Filtered settings (hide internal SMS keys shown in dedicated section) */
  const displaySettings = (allSettings ?? []).filter(
    (s) => !["sms_api_key", "sms_api_user", "sms_provider", "sms_sender_id", "whatsapp_support", "hotspot_redirect_url"].includes(s.key)
  );

  return (
    <div className="space-y-6 max-w-3xl">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-muted border">
          <Settings2 className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Payment numbers, notifications & portal config</p>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          1. HOTSPOT REDIRECT URL
      ════════════════════════════════════════════════════════════════ */}
      <SectionCard
        icon={<Wifi size={15} />}
        title="Hotspot Redirect URL"
        badge={<Badge variant="info" className="text-[10px]">MikroTik</Badge>}
      >
        <p className="text-xs text-muted-foreground mb-3">
          MikroTik hotspot login page-এ এই URL set করুন। Customer login করলে portal-এ redirect হবে।
        </p>
        <div className="flex gap-2 mb-3">
          <Input
            value={hotspotUrl}
            onChange={(e) => { setHotspotUrl(e.target.value); setHotspotDirty(true); }}
            placeholder={DEFAULT_REDIRECT}
            className="flex-1 font-mono text-xs h-9"
          />
          <Button
            variant="outline" size="icon" className="h-9 w-9 shrink-0"
            onClick={() => { navigator.clipboard.writeText(hotspotUrl).catch(() => {}); toast.success("Copied!"); }}
            title="Copy"
          >
            <Copy size={13} />
          </Button>
          <Button
            size="sm" className="h-9 shrink-0"
            onClick={() => saveRedirect.mutate({ key: "hotspot_redirect_url", value: hotspotUrl })}
            disabled={saveRedirect.isPending || !hotspotDirty}
          >
            {saveRedirect.isPending ? <><RefreshCw size={12} className="animate-spin mr-1" />Saving</> : <><Save size={12} className="mr-1" />Save</>}
          </Button>
        </div>
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-950 space-y-1">
          <p className="font-bold flex items-center gap-1.5 text-amber-900"><AlertTriangle size={11} className="shrink-0" /> MikroTik Winbox Setup</p>
          <p className="text-amber-900">IP → Hotspot → Server Profiles → Login Page → set <span className="font-mono bg-muted text-foreground px-1 rounded border border-border">redirect-url</span></p>
          <p className="font-mono text-[10px] bg-muted text-foreground rounded px-2 py-1 mt-1 select-all border border-border">
            /ip hotspot walled-garden add dst-host=wifi.skynity.org
          </p>
        </div>
      </SectionCard>

      {/* ════════════════════════════════════════════════════════════════
          2. PAYMENT NUMBERS
      ════════════════════════════════════════════════════════════════ */}
      <SectionCard
        icon={<Wallet size={15} />}
        title="Payment Numbers"
        badge={<Badge variant="info" className="text-[10px]">Customer-visible</Badge>}
        action={
          <Button size="sm" className="h-8" onClick={() => setShowAddPay(true)}>
            <Plus size={13} className="mr-1" /> Add
          </Button>
        }
      >
        {payments && payments.length > 0 ? (
          <div className="space-y-2">
            {payments.map((p) => {
              const meta = METHOD_META[p.method as PaymentMethod];
              return (
                <div key={p.id} className={`flex items-center gap-3 p-3 rounded-xl border ${meta?.color ?? "border-border bg-muted/30"}`}>
                  <span className="text-2xl shrink-0">{meta?.emoji ?? "💳"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-bold uppercase tracking-wide">{meta?.label ?? p.method}</span>
                      {p.accountType && <span className="text-[10px] text-muted-foreground border rounded px-1">{p.accountType}</span>}
                    </div>
                    <p className="text-base font-mono font-bold">{p.accountNumber}</p>
                    {p.instructions && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{p.instructions}</p>}
                  </div>
                  <Badge variant={p.isActive ? "success" : "default"} className="shrink-0">
                    {p.isActive ? "Active" : "Off"}
                  </Badge>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 shrink-0 hover:bg-red-500/10 hover:text-red-400"
                    onClick={() => setShowDelPay(p.id)}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty message="No payment methods — add bKash, Nagad, Rocket numbers for customers" />
        )}
      </SectionCard>

      {/* ════════════════════════════════════════════════════════════════
          3. WHATSAPP SUPPORT
      ════════════════════════════════════════════════════════════════ */}
      <SectionCard icon={<Phone size={15} />} title="WhatsApp Support">
        <p className="text-xs text-muted-foreground mb-3">
          Customer portal-এ support contact হিসেবে দেখাবে।
        </p>
        <div className="flex gap-2">
          <Input
            value={waNumber}
            onChange={(e) => { setWaNumber(e.target.value); setWaDirty(true); }}
            placeholder="https://wa.me/8801XXXXXXXXX"
            className="flex-1 h-9"
          />
          <Button
            size="sm" className="h-9 shrink-0"
            onClick={() => saveWa.mutate({ provider: smsForm.provider as any, apiKey: smsForm.apiKey, apiUser: smsForm.apiUser, senderId: smsForm.senderId, whatsappNumber: waNumber })}
            disabled={saveWa.isPending || !waDirty}
          >
            {saveWa.isPending ? <RefreshCw size={12} className="animate-spin" /> : <><Save size={12} className="mr-1" />Save</>}
          </Button>
        </div>
      </SectionCard>

      {/* ════════════════════════════════════════════════════════════════
          4. SMS NOTIFICATIONS
      ════════════════════════════════════════════════════════════════ */}
      <SectionCard
        icon={<MessageSquare size={15} />}
        title="SMS Notifications"
        badge={
          <Badge variant={smsForm.provider !== "disabled" ? "success" : "default"}>
            {smsForm.provider !== "disabled" ? "Active" : "Disabled"}
          </Badge>
        }
      >
        <p className="text-xs text-muted-foreground mb-4">
          Payment approve এবং package expiry-তে customer-কে SMS পাঠাবে।
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">SMS Provider</label>
            <Select value={smsForm.provider} onChange={(e) => updateSms("provider", e.target.value)} className="w-full">
              {SMS_PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Sender ID</label>
            <Input value={smsForm.senderId} onChange={(e) => updateSms("senderId", e.target.value)} placeholder="SKYNITY" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">API Key / Token</label>
            <Input value={smsForm.apiKey} onChange={(e) => updateSms("apiKey", e.target.value)} placeholder="Your API key" type="password" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              API Username <span className="font-normal text-muted-foreground/60">(BulkSMSBD only)</span>
            </label>
            <Input value={smsForm.apiUser} onChange={(e) => updateSms("apiUser", e.target.value)} placeholder="Optional" />
          </div>
        </div>

        {/* Provider hints */}
        {smsForm.provider !== "disabled" && (
          <div className="mb-4 p-3 rounded-lg border bg-muted/30 text-xs text-muted-foreground space-y-0.5">
            {smsForm.provider === "ssl_wireless" && <><p><strong className="text-foreground">SSL Wireless:</strong> API token from globalsms.sslwireless.com</p><p>Sender ID must be pre-approved by SSL.</p></>}
            {smsForm.provider === "bulksmsbd"   && <><p><strong className="text-foreground">BulkSMSBD:</strong> API key from bulksmsbd.net</p><p>API Username required for this provider.</p></>}
            {smsForm.provider === "greenwebbd"  && <><p><strong className="text-foreground">GreenWeb:</strong> API token from greenweb.com.bd</p><p>Contact support for sender ID registration.</p></>}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => saveSms.mutate({ provider: smsForm.provider as any, apiKey: smsForm.apiKey, apiUser: smsForm.apiUser, senderId: smsForm.senderId, whatsappNumber: waNumber })}
            disabled={saveSms.isPending || !smsDirty}
            className="h-9"
          >
            {saveSms.isPending ? <><RefreshCw size={12} className="animate-spin mr-1.5" />Saving…</> : <><CheckCircle2 size={13} className="mr-1.5" />Save SMS Config</>}
          </Button>
          <Button
            variant="outline" size="sm" className="h-9"
            onClick={() => {
              setSmsDirty(false);
              if (smsConfig) setSmsForm({ provider: smsConfig.provider || "disabled", apiKey: smsConfig.apiKey || "", apiUser: smsConfig.apiUser || "", senderId: smsConfig.senderId || "SKYNITY" });
            }}
          >
            Reset
          </Button>
          {smsForm.provider !== "disabled" && (
            <Button
              variant="outline" size="sm" className="h-9 ml-auto"
              onClick={() => setShowTestSms(true)}
            >
              <Send size={12} className="mr-1.5" /> Test SMS
            </Button>
          )}
        </div>
      </SectionCard>

      {/* ════════════════════════════════════════════════════════════════
          5. SMS LOGS
      ════════════════════════════════════════════════════════════════ */}
      {smsLogs && smsLogs.length > 0 && (
        <SectionCard
          icon={<ScrollText size={15} />}
          title="SMS Delivery Logs"
          action={
            <Button variant="outline" size="sm" className="h-8" onClick={() => refetchLogs()}>
              <RefreshCw size={12} className="mr-1" /> Refresh
            </Button>
          }
        >
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {smsLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString("en-BD")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.phone}</TableCell>
                      <TableCell>
                        <Badge variant={smsStatusVariant(log.status)}>{log.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{log.provider ?? "—"}</TableCell>
                      <TableCell className="text-xs text-red-400 max-w-48 truncate">{log.error ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </SectionCard>
      )}

      {/* ════════════════════════════════════════════════════════════════
          7. AI INTEGRATION
      ════════════════════════════════════════════════════════════════ */}
      <SectionCard
        icon={<MessageSquare size={15} />}
        title="AI Support Integration"
        badge={<Badge variant={aiEnabled ? "success" : "default"}>{aiEnabled ? "Active" : "Disabled"}</Badge>}
      >
        <p className="text-xs text-muted-foreground mb-3">
          Customer portal-এ AI chatbot এবং admin panel-এ AI assistant enable করুন। OpenAI, Claude, অথবা Kimi API key দিন।
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">AI Provider</label>
            <Select value={aiProvider} onChange={(e) => setAiProvider(e.target.value)} className="w-full">
              <option value="openai">OpenAI (GPT-4o)</option>
              <option value="claude">Claude (Anthropic)</option>
              <option value="kimi">Kimi (Moonshot)</option>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Model</label>
            <Input value={aiModel} onChange={(e) => setAiModel(e.target.value)} placeholder="gpt-4o-mini" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">API Key</label>
            <Input value={aiKey} onChange={(e) => setAiKey(e.target.value)} placeholder="sk-xxxxxxxxxxxxxxxx" type="password" />
          </div>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <input type="checkbox" checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} className="w-4 h-4" />
          <label className="text-sm">Enable AI Support Chat</label>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => saveAi.mutate({ provider: aiProvider as any, apiKey: aiKey, model: aiModel, enabled: aiEnabled })}
            disabled={saveAi.isPending || !aiKey}
            className="h-9"
          >
            {saveAi.isPending ? <><RefreshCw size={12} className="animate-spin mr-1.5" />Saving…</> : <><CheckCircle2 size={13} className="mr-1.5" />Save AI Config</>}
          </Button>
          <Button variant="outline" size="sm" className="h-9" onClick={() => refetchAi()}>
            <RefreshCw size={12} className="mr-1" /> Refresh
          </Button>
        </div>
      </SectionCard>

      {/* ════════════════════════════════════════════════════════════════
          6. ADVANCED SETTINGS
      ════════════════════════════════════════════════════════════════ */}
      <SectionCard icon={<Settings2 size={15} />} title="Advanced Settings">
        <p className="text-xs text-muted-foreground mb-3">Raw key-value store for custom configuration.</p>
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Key (e.g. company_name)"
            value={settingKey}
            onChange={(e) => setSettingKey(e.target.value)}
            className="flex-1 h-9"
          />
          <Input
            placeholder="Value"
            value={settingVal}
            onChange={(e) => setSettingVal(e.target.value)}
            className="flex-1 h-9"
            onKeyDown={(e) => { if (e.key === "Enter" && settingKey && settingVal) saveSetting.mutate({ key: settingKey, value: settingVal }); }}
          />
          <Button
            size="sm" className="h-9 shrink-0"
            onClick={() => { if (settingKey && settingVal) saveSetting.mutate({ key: settingKey, value: settingVal }); }}
            disabled={!settingKey || !settingVal || saveSetting.isPending}
          >
            {saveSetting.isPending ? <RefreshCw size={12} className="animate-spin" /> : <><Save size={12} className="mr-1" />Save</>}
          </Button>
        </div>

        {displaySettings.length > 0 ? (
          <div className="rounded-xl border overflow-hidden">
            {displaySettings.map((s, i) => (
              <div
                key={s.id}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm ${i !== displaySettings.length - 1 ? "border-b" : ""} hover:bg-muted/30 transition-colors group`}
              >
                <span className="font-mono text-xs text-muted-foreground flex-1 truncate">{s.key}</span>
                <span className="text-sm text-right font-mono flex-1 truncate">{maskValue(s.key, s.value ?? "")}</span>
                <Button
                  variant="ghost" size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400 transition-all shrink-0"
                  onClick={() => setShowDelKey(s.key)}
                >
                  <Trash2 size={11} />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-4 text-center border rounded-xl">No custom settings yet</p>
        )}
      </SectionCard>

      {/* ══════════════════════════════════════════════════════════════
          MODALS
      ══════════════════════════════════════════════════════════════ */}

      {/* Add Payment */}
      <Modal open={showAddPay} onClose={() => setShowAddPay(false)} title="Add Payment Method">
        <form onSubmit={(e) => { e.preventDefault(); upsertPay.mutate(payForm); }} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Method</label>
            <Select title="Method" value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value as PaymentMethod })} className="w-full">
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_META[m].emoji} {METHOD_META[m].label}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Account Number *</label>
            <Input value={payForm.accountNumber} onChange={(e) => setPayForm({ ...payForm, accountNumber: e.target.value })} required placeholder="01XXXXXXXXX" autoFocus />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Account Type</label>
            <Input value={payForm.accountType} onChange={(e) => setPayForm({ ...payForm, accountType: e.target.value })} placeholder="Personal / Merchant / Agent" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Customer Instructions</label>
            <Input value={payForm.instructions} onChange={(e) => setPayForm({ ...payForm, instructions: e.target.value })} placeholder="Send Money → enter number → enter amount" />
          </div>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 rounded accent-primary"
              checked={payForm.isActive}
              onChange={(e) => setPayForm({ ...payForm, isActive: e.target.checked })}
            />
            Active (visible to customers)
          </label>
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1" disabled={upsertPay.isPending}>
              {upsertPay.isPending ? <><RefreshCw size={13} className="animate-spin mr-1.5" />Saving…</> : "Save Method"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowAddPay(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Payment */}
      <Modal open={showDelPay !== null} onClose={() => setShowDelPay(null)} title="Delete Payment Method">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">এই payment method টি মুছে ফেলবেন? Customer portal-এ আর দেখাবে না।</p>
          <div className="flex gap-2">
            <Button
              variant="destructive" className="flex-1"
              disabled={deletePay.isPending}
              onClick={() => { if (showDelPay !== null) deletePay.mutate({ id: showDelPay }); }}
            >
              {deletePay.isPending ? <><RefreshCw size={13} className="animate-spin mr-1.5" />Deleting…</> : "হ্যাঁ, মুছুন"}
            </Button>
            <Button variant="outline" onClick={() => setShowDelPay(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Setting */}
      <Modal open={showDelKey !== null} onClose={() => setShowDelKey(null)} title="Setting মুছুন">
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-muted/40 border">
            <p className="text-xs text-muted-foreground mb-1">Key</p>
            <p className="font-mono text-sm font-bold">{showDelKey}</p>
          </div>
          <p className="text-xs text-muted-foreground">এই setting টি clear করবেন?</p>
          <div className="flex gap-2">
            <Button
              variant="destructive" className="flex-1"
              disabled={deleteSetting.isPending}
              onClick={() => { if (showDelKey) deleteSetting.mutate({ key: showDelKey, value: "" }); }}
            >
              {deleteSetting.isPending ? "Clearing…" : "Clear Value"}
            </Button>
            <Button variant="outline" onClick={() => setShowDelKey(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Test SMS */}
      <Modal open={showTestSms} onClose={() => setShowTestSms(false)} title="Test SMS পাঠান">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            বর্তমান SMS config দিয়ে একটা test SMS পাঠাবে।
            Provider: <span className="font-semibold text-foreground">{smsForm.provider}</span>
          </p>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Phone Number</label>
            <Input
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={!testPhone || !/^01\d{9}$/.test(testPhone)}
              onClick={() => {
                toast.info("Test SMS feature — implement via settings.testSms endpoint");
                setShowTestSms(false);
              }}
            >
              <Send size={13} className="mr-1.5" /> পাঠান
            </Button>
            <Button variant="outline" onClick={() => setShowTestSms(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ── SectionCard helper ─────────────────────────────────────────────────── */
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
