import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, User, Phone, Mail } from "lucide-react";
import { api, type DashboardData } from "../lib/api";

export default function Profile() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [changing, setChanging] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });

  useEffect(() => {
    const token = localStorage.getItem("isp_portal_token");
    if (!token) { navigate("/login"); return; }
    api.getDashboard(token).then(setData).catch(() => navigate("/login")).finally(() => setLoading(false));
  }, [navigate]);

  async function handlePwChange(e: React.FormEvent) {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) { toast.error("New passwords do not match"); return; }
    if (pwForm.next.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    const token = localStorage.getItem("isp_portal_token");
    if (!token) { navigate("/login"); return; }
    setChanging(true);
    try {
      await api.changePassword(token, pwForm.current, pwForm.next);
      toast.success("Password changed successfully");
      setPwForm({ current: "", next: "", confirm: "" });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to change password"); }
    setChanging(false);
  }

  if (loading) return <div className="bg-mesh min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" /></div>;
  if (!data) return null;
  const c = data.customer;

  return (
    <div className="bg-mesh min-h-screen pb-8">
      <div className="max-w-lg mx-auto px-4 pt-5 space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-8 h-8 glass rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-colors"><ArrowLeft size={15} /></button>
          <div><h1 className="text-xl font-black text-white">My Profile</h1><p className="text-xs text-slate-400">Account details</p></div>
        </div>

        {/* Avatar */}
        <div className="glass-card rounded-2xl p-5 flex items-center gap-4 animate-slide-up">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/30 to-blue-600/30 border border-cyan-500/20 flex items-center justify-center">
            <span className="text-cyan-400 font-black text-xl">{c.fullName[0].toUpperCase()}</span>
          </div>
          <div>
            <p className="font-black text-white text-lg">{c.fullName}</p>
            <p className="text-xs text-slate-400">{c.customerCode}</p>
          </div>
        </div>

        {/* Info */}
        <div className="glass rounded-xl overflow-hidden animate-slide-up delay-100">
          {[
            { icon: User, label: "Full Name", value: c.fullName },
            { icon: Phone, label: "Phone", value: c.phone },
            ...(c.email ? [{ icon: Mail, label: "Email", value: c.email }] : []),
            ...(c.address ? [{ icon: User, label: "Address", value: c.address }] : []),
          ].map(({ icon: Icon, label, value }, i) => (
            <div key={label} className={`flex items-center gap-3 px-4 py-3.5 ${i > 0 ? "border-t border-white/5" : ""}`}>
              <Icon size={14} className="text-slate-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
                <p className="text-sm font-medium text-white truncate">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Change password */}
        <div className="glass rounded-xl p-5 space-y-4 animate-slide-up delay-200">
          <h2 className="text-sm font-bold text-white">Change Password</h2>
          <form onSubmit={handlePwChange} className="space-y-3">
            {[
              { key: "current" as const, label: "Current Password", ph: "Current password" },
              { key: "next" as const, label: "New Password", ph: "Min 6 characters" },
              { key: "confirm" as const, label: "Confirm New Password", ph: "Repeat new password" },
            ].map(({ key, label, ph }) => (
              <div key={key} className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</label>
                <div className="relative">
                  <input type={showPw ? "text" : "password"} value={pwForm[key]} onChange={(e) => setPwForm((p) => ({ ...p, [key]: e.target.value }))} placeholder={ph} required className="portal-input pr-12" />
                  {key === "current" && <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">{showPw ? <EyeOff size={15} /> : <Eye size={15} />}</button>}
                </div>
              </div>
            ))}
            <button type="submit" disabled={changing} className="btn-primary w-full py-3 rounded-xl text-sm flex items-center justify-center gap-2">
              {changing ? <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Changing…</span> : "Change Password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
