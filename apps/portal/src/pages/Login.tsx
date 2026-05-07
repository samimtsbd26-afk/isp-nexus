import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { toast } from "sonner";
import { Wifi, Eye, EyeOff, ChevronRight, Zap } from "lucide-react";
import { api } from "../lib/api";

export default function Login() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await api.login(phone, password);
      if (result?.token) {
        localStorage.setItem("isp_portal_token", result.token);
        toast.success(`Welcome back, ${result.customer?.fullName?.split(" ")[0] ?? "there"}!`);
        navigate("/");
      } else {
        toast.error("Invalid phone or password");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    }
    setLoading(false);
  }

  return (
    <div className="bg-mesh min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 animate-slide-up">

        {/* Brand */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mx-auto shadow-lg shadow-cyan-500/25 animate-pulse-glow">
            <Wifi size={30} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black gradient-text">SKYNITY</h1>
            <p className="text-slate-400 text-sm mt-1">Sign in to your account</p>
          </div>
        </div>

        {/* Form */}
        <div className="glass-strong rounded-2xl p-6 space-y-4">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01XXXXXXXXX"
                className="portal-input"
                required
                autoComplete="tel"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  className="portal-input pr-12"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3.5 rounded-xl text-sm flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : (
                <>Sign In <ChevronRight size={15} /></>
              )}
            </button>
          </form>
        </div>

        {/* Footer links */}
        <div className="space-y-3 text-center">
          <p className="text-sm text-slate-400">
            New customer?{" "}
            <Link to="/register" className="text-cyan-400 font-semibold hover:text-cyan-300 transition-colors">
              Register here
            </Link>
          </p>
          <Link to="/welcome" className="flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
            <Zap size={11} /> View internet packages
          </Link>
        </div>
      </div>
    </div>
  );
}
