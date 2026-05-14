import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { trpc } from "../../lib/trpc";
import { toast } from "sonner";
import { Wifi, Lock, Mail, ArrowRight } from "lucide-react";
import { getAccessToken, restoreSession, setAccessToken, subscribeAuthState } from "../../lib/auth";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const from = typeof location.state === "object" && location.state && "from" in location.state
    ? String(location.state.from)
    : "/";

  useEffect(() => {
    let cancelled = false;
    const completeIfAuthed = async () => {
      const token = getAccessToken() ?? await restoreSession();
      if (!cancelled && token) navigate(from, { replace: true });
    };
    void completeIfAuthed();
    const unsubscribe = subscribeAuthState(() => {
      if (getAccessToken()) navigate(from, { replace: true });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [from, navigate]);

  const login = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      navigate(from, { replace: true });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-sky-400/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary shadow-md shadow-primary/25 mb-4">
            <Wifi size={26} className="text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            <span className="bg-gradient-to-r from-sky-500 to-blue-600 bg-clip-text text-transparent">SKY</span>
            <span className="text-foreground">NITY</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ISP Management Platform</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-lg shadow-black/[0.06]">
          <h2 className="text-lg font-semibold text-foreground mb-1">Welcome back</h2>
          <p className="text-sm text-muted-foreground mb-6">Sign in to your admin panel</p>

          <form onSubmit={(e) => { e.preventDefault(); login.mutate({ email, password }); }} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-label mb-1.5">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-background border border-input rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/30 transition-all placeholder:text-muted-foreground"
                  placeholder="admin@skynity.org" required />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-label mb-1.5">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-background border border-input rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/30 transition-all placeholder:text-muted-foreground"
                  placeholder="••••••••" required />
              </div>
            </div>
            <button type="submit" disabled={login.isPending}
              className="w-full bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-semibold hover:brightness-[0.92] disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/20 cursor-pointer">
              {login.isPending ? "Signing in..." : (<>Sign In <ArrowRight size={16} /></>)}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            First time? <a href="/setup" className="text-primary font-medium hover:brightness-90 transition-colors">Setup admin account</a>
          </p>
        </div>

        <p className="text-center text-[11px] text-muted-foreground mt-6">© 2026 Skynity. All rights reserved.</p>
      </div>
    </div>
  );
}
