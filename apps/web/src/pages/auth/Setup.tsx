import { useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "../../lib/trpc";
import { toast } from "sonner";
import { Wifi, Building2, User, Mail, Lock, ArrowRight } from "lucide-react";

export default function Setup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ orgName: "", name: "", email: "", password: "" });

  const setup = trpc.auth.setupAdmin.useMutation({
    onSuccess: () => { toast.success("Admin account created! Please login."); navigate("/login"); },
    onError: (e) => toast.error(e.message),
  });

  const fields = [
    { key: "orgName", label: "Organization Name", type: "text", placeholder: "Skynity ISP", icon: Building2 },
    { key: "name", label: "Your Name", type: "text", placeholder: "Admin Name", icon: User },
    { key: "email", label: "Email", type: "email", placeholder: "admin@skynity.org", icon: Mail },
    { key: "password", label: "Password", type: "password", placeholder: "Min 8 characters", icon: Lock },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#060a14] relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/3 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20 mb-4">
            <Wifi size={26} className="text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">SKY</span>
            <span className="text-white">NITY</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">Initial Setup</p>
        </div>

        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8 shadow-2xl shadow-black/20">
          <h2 className="text-lg font-semibold text-white mb-1">Create your organization</h2>
          <p className="text-sm text-slate-400 mb-6">Set up your ISP and admin account</p>

          <form onSubmit={(e) => { e.preventDefault(); setup.mutate(form); }} className="space-y-4">
            {fields.map(({ key, label, type, placeholder, icon: Icon }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
                <div className="relative">
                  <Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input type={type} placeholder={placeholder} value={(form as any)[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all placeholder:text-slate-600" required />
                </div>
              </div>
            ))}
            <button type="submit" disabled={setup.isPending}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 cursor-pointer">
              {setup.isPending ? "Creating..." : (<>Create Admin Account <ArrowRight size={16} /></>)}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-slate-600 mt-6">© 2026 Skynity. All rights reserved.</p>
      </div>
    </div>
  );
}
