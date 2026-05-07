import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Copy, ChevronRight, Zap, Clock } from "lucide-react";
import { api, type Package } from "../lib/api";

type PayMethod = "bkash" | "nagad" | "rocket";

const PAY_META: Record<string, { label: string; emoji: string; color: string; defaultInstruction: string }> = {
  bkash:  { label: "bKash",  emoji: "🔴", color: "from-pink-600 to-red-600",    defaultInstruction: "Open bKash → Send Money → Enter the number → Enter amount → Copy TRX ID." },
  nagad:  { label: "Nagad",  emoji: "🟠", color: "from-orange-600 to-amber-600", defaultInstruction: "Open Nagad → Send Money → Enter the number → Enter amount → Copy TRX ID." },
  rocket: { label: "Rocket", emoji: "🟣", color: "from-violet-700 to-purple-600", defaultInstruction: "Open Rocket → Send Money → Enter the number → Enter amount → Copy TRX ID." },
};

interface PayConfig { method: string; accountNumber: string; accountType?: string | null; instructions?: string | null }

export default function Payment() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const packageId = searchParams.get("packageId") ?? "";

  const [pkg, setPkg] = useState<Package | null>(null);
  const [payConfigs, setPayConfigs] = useState<PayConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [payMethod, setPayMethod] = useState<PayMethod | null>(null);
  const [trxId, setTrxId] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (!packageId) { navigate("/packages"); return; }
    api.getPaymentConfigs().then(setPayConfigs).catch(() => {});
    api.getPackages().then((pkgs) => {
      const found = pkgs.find((p) => p.id === packageId);
      if (!found) { toast.error("Package not found"); navigate("/packages"); return; }
      setPkg(found);
    }).catch(() => navigate("/packages")).finally(() => setLoading(false));
  }, [packageId, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pkg || !payMethod) { toast.error("Select payment method"); return; }
    if (!trxId.trim()) { toast.error("Enter Transaction ID"); return; }
    if (!senderPhone.trim()) { toast.error("Enter sender phone number"); return; }
    const token = localStorage.getItem("isp_portal_token");
    if (!token) { toast.error("Session expired"); navigate("/login"); return; }
    setSubmitting(true);
    try {
      const result = await api.submitOrder(token, { packageId: pkg.id, amountBdt: pkg.priceBdt, paymentMethod: payMethod, trxId: trxId.trim(), paymentFrom: senderPhone.trim() });
      setOrderId(result.orderId);
      toast.success("Payment submitted! Admin will verify and activate your connection.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    }
    setSubmitting(false);
  }

  if (loading) return <div className="bg-mesh min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" /></div>;

  if (orderId) {
    return (
      <div className="bg-mesh min-h-screen flex items-center justify-center p-4">
        <div className="max-w-sm w-full glass-strong rounded-2xl p-8 text-center space-y-5 animate-slide-up">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto animate-pulse-glow"><CheckCircle2 size={32} className="text-emerald-400" /></div>
          <div><h2 className="text-xl font-black text-white">Payment Submitted!</h2><p className="text-slate-400 text-sm mt-2">Admin will verify and activate your connection shortly.</p></div>
          <div className="glass rounded-xl p-4 text-left space-y-2">
            {[["Package", pkg?.name], ["Amount", `৳${pkg?.priceBdt}`], ["Method", payMethod], ["TRX ID", trxId]].map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm">
                <span className="text-slate-400">{k}</span>
                <span className={`font-semibold ${k === "TRX ID" ? "text-cyan-400 font-mono" : "text-white"}`}>{v}</span>
              </div>
            ))}
          </div>
          <Link to="/" className="btn-primary w-full py-3 rounded-xl text-sm flex items-center justify-center gap-2">Go to Dashboard <ChevronRight size={14} /></Link>
          <Link to="/orders" className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">Check order status →</Link>
        </div>
      </div>
    );
  }

  if (!pkg) return null;
  const selectedConfig = payMethod ? payConfigs.find((c) => c.method === payMethod) : null;
  const selectedMeta = payMethod ? PAY_META[payMethod] : null;
  const selectedNumber = selectedConfig?.accountNumber ?? "01XXXXXXXXX";
  const selectedInstruction = selectedConfig?.instructions ?? selectedMeta?.defaultInstruction ?? "";

  return (
    <div className="bg-mesh min-h-screen pb-8">
      <div className="max-w-lg mx-auto px-4 pt-5 space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-8 h-8 glass rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-colors"><ArrowLeft size={15} /></button>
          <div><h1 className="text-xl font-black text-white">Payment</h1><p className="text-xs text-slate-400">Complete your order</p></div>
        </div>

        <div className="glass-card rounded-2xl p-5 space-y-3 animate-slide-up">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Order Summary</p>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-black text-white text-lg">{pkg.name}</p>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="flex items-center gap-1 text-xs text-slate-400"><Zap size={11} className="text-cyan-400" /> {pkg.downloadMbps}↓/{pkg.uploadMbps}↑ Mbps</span>
                <span className="flex items-center gap-1 text-xs text-slate-400"><Clock size={11} className="text-violet-400" /> {pkg.validityDays} days</span>
              </div>
            </div>
            <div className="text-right"><p className="text-2xl font-black gradient-text-cyan">৳{pkg.priceBdt}</p><p className="text-[10px] text-slate-400">one-time</p></div>
          </div>
        </div>

        <div className="space-y-3 animate-slide-up delay-100">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Select Payment Method</p>
          <div className="grid grid-cols-3 gap-2">
            {(payConfigs.length > 0 ? payConfigs.filter((c) => c.method in PAY_META) : Object.keys(PAY_META)).map((item) => {
              const method = typeof item === "string" ? item : (item as PayConfig).method;
              const meta = PAY_META[method];
              if (!meta) return null;
              return (
                <button key={method} type="button" onClick={() => setPayMethod(method as PayMethod)}
                  className={`py-3 rounded-xl text-sm font-bold transition-all flex flex-col items-center gap-1.5 border ${payMethod === method ? `bg-gradient-to-br ${meta.color} text-white border-transparent shadow-lg` : "glass border-white/8 text-slate-300 hover:border-white/20"}`}>
                  <span className="text-lg">{meta.emoji}</span>{meta.label}
                </button>
              );
            })}
          </div>
        </div>

        {payMethod && selectedMeta && (
          <div className="glass-card rounded-2xl p-5 space-y-4 animate-slide-up">
            <div className="space-y-2">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Send Money To</p>
              <div className="flex items-center justify-between p-3 glass rounded-xl">
                <div>
                  <p className="font-black text-lg text-white font-mono">{selectedNumber}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{selectedMeta.label} {selectedConfig?.accountType ? `· ${selectedConfig.accountType}` : "Number"}</p>
                </div>
                <button type="button" onClick={() => { void navigator.clipboard.writeText(selectedNumber); toast.success("Number copied!"); }} className="w-8 h-8 glass rounded-lg flex items-center justify-center text-slate-400 hover:text-cyan-400 transition-colors"><Copy size={14} /></button>
              </div>
              {selectedInstruction && <p className="text-xs text-slate-400">{selectedInstruction}</p>}
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Transaction ID *</label>
                <input value={trxId} onChange={(e) => setTrxId(e.target.value)} placeholder="e.g. 8N7XXXXXX" required className="portal-input font-mono" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Sender Phone Number *</label>
                <input type="tel" value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} placeholder="From which number you sent" required className="portal-input" />
              </div>
              <button type="submit" disabled={submitting || !trxId.trim() || !senderPhone.trim()} className="btn-primary w-full py-3.5 rounded-xl text-sm flex items-center justify-center gap-2">
                {submitting ? <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting…</span> : <>Submit Payment <ChevronRight size={14} /></>}
              </button>
            </form>
          </div>
        )}

        {!payMethod && <div className="glass rounded-xl p-4 text-center"><p className="text-slate-400 text-sm">Select a payment method above to continue</p></div>}
      </div>
    </div>
  );
}
