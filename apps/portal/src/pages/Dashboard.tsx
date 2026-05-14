import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router";
import {
  Wifi, WifiOff, Clock, Package, LogOut, RefreshCw,
  Zap, Calendar, TrendingUp, ChevronRight, Bell, User, ShoppingCart,
  Smartphone, Shield, Activity, X, MessageCircle, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  type DashboardData, type Subscription, type Package as Pkg,
  type DeviceBinding, type ActiveSession, type PortalNotification,
} from "../lib/api";

// ── Countdown ─────────────────────────────────────────────────────────────────

function useCountdown(expiresAt: string | null | undefined) {
  const [remaining, setRemaining] = useState(() => getRemaining(expiresAt));

  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setRemaining(getRemaining(expiresAt)), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return remaining;
}

function getRemaining(expiresAt: string | null | undefined) {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  return { days, hours, minutes, seconds, expired: false };
}

function CountdownTimer({ expiresAt }: { expiresAt: string | null | undefined }) {
  const rem = useCountdown(expiresAt);
  if (!rem) return <span className="text-slate-400 text-sm">No expiry</span>;
  if (rem.expired) return <span className="text-red-400 font-bold text-sm">Expired</span>;

  const urgency = rem.days === 0 ? "text-red-400" : rem.days <= 2 ? "text-amber-400" : "text-emerald-400";

  return (
    <div className="flex items-center gap-1.5 animate-count-in">
      {rem.days > 0 && (
        <div className="text-center">
          <p className={`text-2xl font-black ${urgency} leading-none`}>{rem.days}</p>
          <p className="text-[9px] text-slate-500 uppercase">days</p>
        </div>
      )}
      <div className="text-center">
        <p className={`text-2xl font-black ${urgency} leading-none`}>{String(rem.hours).padStart(2,"0")}</p>
        <p className="text-[9px] text-slate-500 uppercase">hrs</p>
      </div>
      <span className={`text-xl font-black ${urgency} leading-none`}>:</span>
      <div className="text-center">
        <p className={`text-2xl font-black ${urgency} leading-none`}>{String(rem.minutes).padStart(2,"0")}</p>
        <p className="text-[9px] text-slate-500 uppercase">min</p>
      </div>
      <span className={`text-xl font-black ${urgency} leading-none`}>:</span>
      <div className="text-center">
        <p className={`text-2xl font-black ${urgency} leading-none`}>{String(rem.seconds).padStart(2,"0")}</p>
        <p className="text-[9px] text-slate-500 uppercase">sec</p>
      </div>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  active:    "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25",
  expired:   "bg-red-500/15 text-red-400 border border-red-500/25",
  suspended: "bg-amber-500/15 text-amber-400 border border-amber-500/25",
  cancelled: "bg-slate-500/15 text-slate-400 border border-slate-500/25",
  pending:   "bg-blue-500/15 text-blue-400 border border-blue-500/25",
  approved:  "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25",
  rejected:  "bg-red-500/15 text-red-400 border border-red-500/25",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_STYLES[status] ?? STATUS_STYLES.cancelled}`}>
      {status}
    </span>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-4 animate-fade-in">
      {[80, 160, 120].map((h, i) => (
        <div key={i} className={`skeleton rounded-2xl`} style={{ height: h }} />
      ))}
    </div>
  );
}

// ── Active sub card ───────────────────────────────────────────────────────────

function ActiveSubCard({ sub, pkg, onRenew }: { sub: Subscription; pkg?: Pkg; onRenew: () => void }) {
  const isActive = sub.status === "active";
  const ring = isActive ? "ring-active" : "ring-expired";

  return (
    <div className={`glass-card rounded-2xl p-5 space-y-4 ${ring}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isActive ? "bg-emerald-500/20" : "bg-red-500/20"}`}>
            {isActive ? <Wifi size={20} className="text-emerald-400" /> : <WifiOff size={20} className="text-red-400" />}
          </div>
          <div>
            <p className="font-bold text-sm text-white">{pkg?.name ?? "Active Plan"}</p>
            <p className="text-xs text-slate-400">@{sub.username}</p>
          </div>
        </div>
        <StatusBadge status={sub.status} />
      </div>

      {/* Speed info */}
      {pkg && (
        <div className="flex items-center gap-4 py-3 border-t border-white/5">
          <div className="flex items-center gap-1.5 text-sm">
            <Zap size={13} className="text-cyan-400" />
            <span className="text-slate-300 font-medium">{pkg.downloadMbps}↓ / {pkg.uploadMbps}↑ Mbps</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm ml-auto">
            <Calendar size={13} className="text-slate-400" />
            <span className="text-slate-400 text-xs">
              {sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString("en-BD") : "No expiry"}
            </span>
          </div>
        </div>
      )}

      {/* Countdown */}
      {sub.expiresAt && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-1.5">
            <Clock size={10} /> Remaining Time
          </p>
          <CountdownTimer expiresAt={sub.expiresAt} />
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button onClick={onRenew} className="btn-primary py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5">
          <RefreshCw size={13} /> Renew Plan
        </button>
        <Link to="/packages" className="btn-outline-cyan py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5">
          <TrendingUp size={13} /> Upgrade
        </Link>
      </div>
    </div>
  );
}

// ── No subscription card ───────────────────────────────────────────────────────

function NoSubCard() {
  return (
    <div className="glass rounded-2xl p-5 space-y-4 border border-red-500/20">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
          <WifiOff size={20} className="text-red-400" />
        </div>
        <div>
          <p className="font-bold text-sm text-white">No Active Subscription</p>
          <p className="text-xs text-slate-400">Buy a package to connect</p>
        </div>
      </div>
      <Link to="/packages" className="btn-primary w-full py-3 rounded-xl text-sm flex items-center justify-center gap-2">
        <Package size={15} /> View Packages <ChevronRight size={14} />
      </Link>
    </div>
  );
}

// ── Notification type icon ────────────────────────────────────────────────────

function notifIcon(type: string) {
  if (type.includes("approved")) return "✅";
  if (type.includes("rejected")) return "❌";
  if (type.includes("expir")) return "⏰";
  if (type.includes("block")) return "🚫";
  if (type.includes("login")) return "🔐";
  return "📢";
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Extended data
  const [bindings, setBindings] = useState<DeviceBinding[]>([]);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [logoutingAll, setLogoutingAll] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);

  const unread = notifications.filter((n) => !n.isRead).length;

  const load = useCallback(async (showSpinner = true) => {
    const token = localStorage.getItem("isp_portal_token");
    if (!token) { navigate("/login"); return; }
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    try {
      const result = await api.getDashboard(token);
      if (result) setData(result);
      else { localStorage.removeItem("isp_portal_token"); navigate("/login"); }
    } catch {
      localStorage.removeItem("isp_portal_token");
      navigate("/login");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigate]);

  useEffect(() => { void load(); }, [load]);

  // Load secondary data once logged in
  useEffect(() => {
    const token = localStorage.getItem("isp_portal_token");
    if (!token) return;
    api.getDeviceBindings(token).then(setBindings).catch(() => {});
    api.getActiveSession(token).then(setSession).catch(() => {});
    api.getNotifications(token).then(setNotifications).catch(() => {});
  }, []);

  function logout() {
    localStorage.removeItem("isp_portal_token");
    navigate("/login");
  }

  async function logoutAll() {
    const token = localStorage.getItem("isp_portal_token");
    if (!token) return;
    if (!globalThis.confirm("This will disconnect all your active sessions. Continue?")) return;
    setLogoutingAll(true);
    try {
      await api.logoutAllSessions(token);
      toast.success("All sessions logged out");
      localStorage.removeItem("isp_portal_token");
      navigate("/login");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Logout failed");
    } finally {
      setLogoutingAll(false);
    }
  }

  async function resetDevice(bindingId: string) {
    const token = localStorage.getItem("isp_portal_token");
    if (!token) return;
    setResettingId(bindingId);
    try {
      await api.resetDevice(token, bindingId);
      toast.success("Device binding reset");
      setBindings((prev) => prev.filter((b) => b.id !== bindingId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResettingId(null);
    }
  }

  function openNotifs() {
    setShowNotifs(true);
    const token = localStorage.getItem("isp_portal_token");
    if (token && unread > 0) {
      api.markNotificationsRead(token).then(() => {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      }).catch(() => {});
    }
  }

  function fmtBytes(b: number) {
    if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(1)} GB`;
    if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`;
    return `${(b / 1024).toFixed(0)} KB`;
  }

  if (loading) {
    return (
      <div className="bg-mesh min-h-screen p-4 max-w-lg mx-auto">
        <div className="pt-4 pb-6 flex items-center gap-3">
          <div className="w-10 h-10 skeleton rounded-xl" />
          <div className="space-y-1.5 flex-1">
            <div className="skeleton rounded h-4 w-32" />
            <div className="skeleton rounded h-3 w-20" />
          </div>
        </div>
        <DashboardSkeleton />
      </div>
    );
  }

  if (!data) return null;

  const activeSub = data.subscriptions.find((s) => s.status === "active");
  const activePkg = activeSub ? data.packages.find((p) => p.id === activeSub.packageId) : undefined;
  const firstName = data.customer.fullName.split(" ")[0];

  return (
    <div className="bg-mesh min-h-screen pb-8">
      <div className="max-w-lg mx-auto px-4 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between pt-5 pb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/30 to-blue-600/30 border border-cyan-500/20 flex items-center justify-center">
              <span className="text-cyan-400 font-black text-sm">{firstName[0].toUpperCase()}</span>
            </div>
            <div>
              <p className="font-bold text-white text-sm">Hi, {firstName}! 👋</p>
              <p className="text-[11px] text-slate-400">{data.customer.phone}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Notification bell */}
            <button onClick={openNotifs} title="Notifications"
              className="relative w-8 h-8 rounded-lg glass flex items-center justify-center text-slate-400 hover:text-white transition-colors">
              <Bell size={14} />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-cyan-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
            <button onClick={() => void load(false)} disabled={refreshing} title="Refresh"
              className="w-8 h-8 rounded-lg glass flex items-center justify-center text-slate-400 hover:text-white transition-colors">
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            </button>
            <button onClick={logout} title="Logout"
              className="w-8 h-8 rounded-lg glass flex items-center justify-center text-slate-400 hover:text-red-400 transition-colors">
              <LogOut size={14} />
            </button>
          </div>
        </div>

        {/* Notification panel */}
        {showNotifs && (
          <div className="glass-card rounded-2xl border border-cyan-500/20 animate-slide-up">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Bell size={13} className="text-cyan-400" />
                <p className="text-sm font-semibold text-white">Notifications</p>
              </div>
              <button onClick={() => setShowNotifs(false)}
                className="text-slate-400 hover:text-white transition-colors">
                <X size={14} />
              </button>
            </div>
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-400">No notifications yet</div>
            ) : (
              <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
                {notifications.slice(0, 20).map((n) => (
                  <div key={n.id} className={`px-4 py-3 ${!n.isRead ? "bg-cyan-500/5" : ""}`}>
                    <div className="flex items-start gap-2.5">
                      <span className="text-base leading-none mt-0.5">{notifIcon(n.type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white">{n.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{n.message}</p>
                        <p className="text-[10px] text-slate-600 mt-1">
                          {new Date(n.createdAt).toLocaleString("en-BD")}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Subscription card */}
        <div className="animate-slide-up">
          {activeSub
            ? <ActiveSubCard sub={activeSub} pkg={activePkg} onRenew={() => navigate(activePkg ? `/payment?packageId=${activePkg.id}` : "/packages")} />
            : <NoSubCard />
          }
        </div>

        {/* Active Session */}
        {session && (
          <div className="glass rounded-xl p-4 border border-emerald-500/15 animate-slide-up">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={13} className="text-emerald-400" />
              <p className="text-xs font-semibold text-emerald-400">Active Session</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-slate-500">IP Address</p>
                <p className="text-sm font-semibold text-white">{session.address}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">Uptime</p>
                <p className="text-sm font-semibold text-white">{session.uptime}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">Downloaded</p>
                <p className="text-sm font-semibold text-emerald-400">{fmtBytes(session.rxBytes)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">Uploaded</p>
                <p className="text-sm font-semibold text-blue-400">{fmtBytes(session.txBytes)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Account info strip */}
        <div className="glass rounded-xl p-4 flex items-center gap-4 animate-slide-up delay-100">
          <User size={16} className="text-slate-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400">Customer Code</p>
            <p className="text-sm font-semibold text-white">{data.customer.customerCode}</p>
          </div>
          {data.customer.email && (
            <div className="flex-1 min-w-0 border-l border-white/5 pl-4">
              <p className="text-xs text-slate-400">Email</p>
              <p className="text-sm font-semibold text-white truncate">{data.customer.email}</p>
            </div>
          )}
        </div>

        {/* Device Bindings */}
        {bindings.length > 0 && (
          <div className="glass rounded-xl overflow-hidden border border-white/5 animate-fade-in">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
              <Smartphone size={13} className="text-slate-400" />
              <p className="text-xs font-semibold text-slate-200">Device Bindings</p>
            </div>
            <div className="divide-y divide-white/5">
              {bindings.map((b) => (
                <div key={b.id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                      <Smartphone size={13} className="text-blue-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{b.macAddress ?? "—"}</p>
                      <p className="text-[10px] text-slate-400">{b.ipAddress ?? b.description ?? "bound device"}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => resetDevice(b.id)}
                    disabled={resettingId === b.id}
                    className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 transition-colors shrink-0 disabled:opacity-50">
                    <Trash2 size={11} />
                    {resettingId === b.id ? "..." : "Reset"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expired subscriptions */}
        {data.subscriptions.filter((s) => s.status === "expired").length > 0 && (
          <div className="glass rounded-xl p-4 border border-amber-500/15 animate-fade-in delay-200">
            <div className="flex items-center gap-2 mb-3">
              <Bell size={14} className="text-amber-400" />
              <p className="text-xs font-semibold text-amber-400">Expired Plans</p>
            </div>
            <div className="space-y-2">
              {data.subscriptions.filter((s) => s.status === "expired").slice(0, 2).map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">@{s.username}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">{s.expiresAt ? new Date(s.expiresAt).toLocaleDateString() : "—"}</span>
                    <StatusBadge status={s.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Orders */}
        {data.recentOrders.length > 0 && (
          <div className="glass rounded-xl overflow-hidden animate-slide-up delay-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <ShoppingCart size={13} className="text-slate-400" />
                <p className="text-xs font-semibold text-slate-200">Recent Orders</p>
              </div>
              <Link to="/orders" className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors">View all →</Link>
            </div>
            <div className="divide-y divide-white/5">
              {data.recentOrders.slice(0, 4).map((o) => (
                <div key={o.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-white">৳{o.amountBdt.toLocaleString()}</p>
                    <p className="text-[11px] text-slate-400">
                      {o.paymentMethod ?? "—"} · {new Date(o.createdAt).toLocaleDateString("en-BD")}
                    </p>
                  </div>
                  <StatusBadge status={o.status} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-2 animate-slide-up delay-300">
          {[
            { to: "/packages", icon: Package, label: "Packages", color: "text-cyan-400" },
            { to: "/orders", icon: ShoppingCart, label: "Orders", color: "text-blue-400" },
            { to: "/profile", icon: User, label: "Profile", color: "text-violet-400" },
            { to: "/support", icon: MessageCircle, label: "Support", color: "text-emerald-400" },
          ].map(({ to, icon: Icon, label, color }) => (
            <Link key={to} to={to}
              className="glass rounded-xl p-3 flex flex-col items-center gap-2 hover:bg-white/5 transition-colors">
              <Icon size={18} className={color} />
              <span className="text-[10px] text-slate-300">{label}</span>
            </Link>
          ))}
        </div>

        {/* Logout all sessions */}
        <div className="flex justify-center animate-fade-in delay-300">
          <button
            onClick={() => void logoutAll()}
            disabled={logoutingAll}
            className="flex items-center gap-1.5 text-[11px] text-red-400/70 hover:text-red-400 transition-colors disabled:opacity-50">
            <Shield size={11} />
            {logoutingAll ? "Logging out..." : "Logout all sessions"}
          </button>
        </div>

        {/* SKYNITY branding footer */}
        <div className="text-center pt-2 pb-4">
          <p className="text-xs text-slate-600 font-medium">Powered by <span className="gradient-text-cyan font-bold">SKYNITY</span></p>
        </div>
      </div>
    </div>
  );
}
