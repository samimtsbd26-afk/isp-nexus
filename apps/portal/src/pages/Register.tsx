import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Wifi, Eye, EyeOff, ChevronRight } from "lucide-react";
import { api, type GuestOrderInput, type TrialRegisterInput } from "../lib/api";
import { trpcParseResponse, trpcSerializeWire } from "../lib/trpc-wire";

const ORG_ID = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_ORG_ID ?? "212d7393-7375-4321-93f5-4789deb8b317";

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isTrial = searchParams.get("trial") === "1";
  const packageId = searchParams.get("packageId") ?? "";

  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", password: "", confirmPassword: "" });
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) { toast.error("Passwords do not match"); return; }
    if (form.password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setLoading(true);
    try {
      if (isTrial && packageId) {
        const mac = searchParams.get("mac") ?? undefined;
        const input: TrialRegisterInput = {
          fullName: form.fullName,
          phone: form.phone,
          password: form.password,
          packageId,
          macAddress: mac,
          ipAddress: undefined,
          userAgent: navigator.userAgent,
        };
        const result = await api.trialRegister(input);
        // Store pending state for polling on /pending page
        localStorage.setItem("isp_pending_order", JSON.stringify({ orderId: result.orderId, phone: form.phone }));
        toast.success("আবেদন গ্রহণ করা হয়েছে! Admin approval এর অপেক্ষা করুন।");
        navigate("/pending");
      } else if (packageId) {
        const res = await fetch("/api/trpc/portal.register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: trpcSerializeWire({
            orgId: ORG_ID,
            fullName: form.fullName,
            phone: form.phone,
            email: form.email || undefined,
            username: form.phone,
            password: form.password,
          }),
        });
        const data = (await res.json()) as Record<string, unknown>;
        const parsed = trpcParseResponse<{ token?: string }>(data);
        if (parsed.token) { localStorage.setItem("isp_portal_token", parsed.token); navigate(`/payment?packageId=${packageId}`); }
        else toast.error("Registration failed");
      } else {
        const result = await api.register({ fullName: form.fullName, phone: form.phone, email: form.email || undefined, password: form.password, username: form.phone });
        if (result?.token) { localStorage.setItem("isp_portal_token", result.token); toast.success("Welcome to SKYNITY! 🎉"); navigate("/"); }
        else toast.error("Registration failed");
      }
    } catch (err) { toast.error(err instanceof Error ? err.message : "Registration failed"); }
    setLoading(false);
  }

  return (
    <div className="bg-mesh min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 animate-slide-up">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mx-auto shadow-lg shadow-cyan-500/25 animate-pulse-glow">
            <Wifi size={30} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black gradient-text">Create Account</h1>
            <p className="text-slate-400 text-sm mt-1">{isTrial ? "Register to claim your free trial" : "Join SKYNITY internet"}</p>
          </div>
        </div>

        {isTrial && (
          <div className="glass-card rounded-xl p-3 flex items-center gap-2 animate-fade-in text-sm">
            <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0 text-cyan-400 text-xs">✓</div>
            <span className="text-cyan-400 font-medium">Free trial activated instantly after registration</span>
          </div>
        )}

        <div className="glass-strong rounded-2xl p-6 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {([ ["fullName","Full Name","text","Your full name",true], ["phone","Phone Number","tel","01XXXXXXXXX",true], ["email","Email (optional)","email","you@example.com",false] ] as const).map(([k,label,type,ph,req]) => (
              <div key={k} className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</label>
                <input type={type} value={form[k]} onChange={(e) => set(k, e.target.value)} placeholder={ph} required={req} className="portal-input" />
              </div>
            ))}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Password</label>
              <div className="relative">
                <input type={showPw ? "text" : "password"} value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Min 6 characters" required className="portal-input pr-12" autoComplete="new-password" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Confirm Password</label>
              <input type="password" value={form.confirmPassword} onChange={(e) => set("confirmPassword", e.target.value)} placeholder="Repeat password" required className="portal-input" autoComplete="new-password" />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 mt-2">
              {loading ? (<span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{isTrial ? "Activating…" : "Creating…"}</span>) : (<>{isTrial ? "Activate Free Trial" : "Create Account"} <ChevronRight size={15} /></>)}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate-400">
          Already have an account? <Link to="/login" className="text-cyan-400 font-semibold hover:text-cyan-300 transition-colors">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
