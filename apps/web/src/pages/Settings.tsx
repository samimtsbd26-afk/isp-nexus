import { useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Plus, Trash2, Wallet, Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, Input, Select, Empty, Modal } from "../components/ui/index";

const PAYMENT_METHODS = ["bkash", "nagad", "rocket", "bank", "cash"] as const;
type PaymentMethod = typeof PAYMENT_METHODS[number];

const METHOD_COLORS: Record<PaymentMethod, string> = {
  bkash: "text-pink-400 bg-pink-500/10",
  nagad: "text-orange-400 bg-orange-500/10",
  rocket: "text-purple-400 bg-purple-500/10",
  bank: "text-blue-400 bg-blue-500/10",
  cash: "text-emerald-400 bg-emerald-500/10",
};

const EMPTY_FORM = { method: "bkash" as PaymentMethod, accountNumber: "", accountType: "", instructions: "", isActive: true };

export default function Settings() {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [settingKey, setSettingKey] = useState("");
  const [settingValue, setSettingValue] = useState("");

  const { data: payments, refetch: refetchPayments } = trpc.settings.listPaymentConfigs.useQuery();
  const { data: allSettings, refetch: refetchSettings } = trpc.settings.listAll.useQuery();

  const upsertPayment = trpc.settings.upsertPaymentConfig.useMutation({
    onSuccess: () => { refetchPayments(); setShowAdd(false); setForm(EMPTY_FORM); toast.success("Payment config saved"); },
    onError: (e) => toast.error(e.message),
  });

  const deletePayment = trpc.settings.deletePaymentConfig.useMutation({
    onSuccess: () => { refetchPayments(); toast.success("Payment config deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const setSetting = trpc.settings.set.useMutation({
    onSuccess: () => { refetchSettings(); setSettingKey(""); setSettingValue(""); toast.success("Setting saved"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm">Organization settings and payment configuration</p>
      </div>

      {/* Payment Configs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Wallet size={16} className="text-muted-foreground" />
            Payment Methods
          </CardTitle>
          <Button size="sm" onClick={() => setShowAdd(true)}><Plus size={14} /> Add Method</Button>
        </CardHeader>
        <CardContent>
          {payments && payments.length > 0 ? (
            <div className="space-y-3">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/20">
                  <div className={`p-2 rounded-lg text-sm font-bold uppercase ${METHOD_COLORS[p.method as PaymentMethod] ?? "text-muted-foreground bg-secondary"}`}>
                    {p.method}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{p.accountNumber}</p>
                    {p.accountType && <p className="text-xs text-muted-foreground">{p.accountType}</p>}
                    {p.instructions && <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.instructions}</p>}
                  </div>
                  <Badge variant={p.isActive ? "success" : "default"}>{p.isActive ? "Active" : "Inactive"}</Badge>
                  <Button variant="ghost" size="icon"
                    onClick={() => { if (globalThis.confirm("Delete this payment method?")) deletePayment.mutate({ id: p.id }); }}>
                    <Trash2 size={14} className="text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <Empty message="No payment methods configured" />
          )}
        </CardContent>
      </Card>

      {/* App Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 size={16} className="text-muted-foreground" />
            App Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Setting key (e.g. company_name)"
              value={settingKey}
              onChange={(e) => setSettingKey(e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="Value"
              value={settingValue}
              onChange={(e) => setSettingValue(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={() => { if (settingKey && settingValue) setSetting.mutate({ key: settingKey, value: settingValue }); }}
              disabled={!settingKey || !settingValue || setSetting.isPending}>
              Save
            </Button>
          </div>

          {allSettings && allSettings.length > 0 && (
            <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
              {allSettings.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{s.key}</span>
                  <span className="text-sm">{s.value}</span>
                </div>
              ))}
            </div>
          )}
          {(!allSettings || allSettings.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">No settings configured yet</p>
          )}
        </CardContent>
      </Card>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Payment Method">
        <form onSubmit={(e) => { e.preventDefault(); upsertPayment.mutate(form); }} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Payment Method</label>
            <Select title="Method" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })} className="w-full">
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Account Number</label>
            <Input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} required placeholder="01XXXXXXXXX" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Account Type (optional)</label>
            <Input value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value })} placeholder="e.g. Personal, Merchant" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Instructions (optional)</label>
            <Input value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="Payment instructions for customers" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1" disabled={upsertPayment.isPending}>
              {upsertPayment.isPending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
