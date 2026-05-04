import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router";
import { Wifi, WifiOff, Clock, Package, LogOut } from "lucide-react";

interface DashboardData {
  customer: { fullName: string; phone: string; customerCode: string };
  subscriptions: Array<{ id: string; username: string; status: string; expiresAt: string | null }>;
  packages: Array<{ id: string; name: string; priceBdt: number; downloadMbps: number; uploadMbps: number }>;
  recentOrders: Array<{ id: string; amountBdt: number; status: string; createdAt: string; paymentMethod: string | null }>;
}

function StatusBadge({ status }: Readonly<{ status: string }>) {
  const colors: Record<string, string> = {
    active: "bg-green-500/20 text-green-400 border-green-500/30",
    expired: "bg-red-500/20 text-red-400 border-red-500/30",
    suspended: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    trial: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    pending: "bg-slate-500/20 text-slate-400 border-slate-500/30",
    approved: "bg-green-500/20 text-green-400 border-green-500/30",
    rejected: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${colors[status] ?? "bg-slate-500/20 text-slate-400 border-slate-500/30"}`}>
      {status}
    </span>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("isp_portal_token");
    if (!token) { navigate("/login"); return; }

    fetch("/api/trpc/portal.dashboard", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    })
      .then((r) => r.json())
      .then((res) => {
        if (res?.result?.data?.json) setData(res.result.data.json);
        else navigate("/login");
      })
      .catch(() => navigate("/login"))
      .finally(() => setLoading(false));
  }, [navigate]);

  function logout() {
    localStorage.removeItem("isp_portal_token");
    navigate("/login");
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading...</div>;
  if (!data) return null;

  const activeSub = data.subscriptions.find((s) => s.status === "active");

  return (
    <div className="min-h-screen p-4 max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-lg font-bold text-blue-400">My Account</h1>
          <p className="text-xs text-slate-400">{data.customer.customerCode} · {data.customer.phone}</p>
        </div>
        <button type="button" onClick={logout} title="Logout" className="text-slate-400 hover:text-red-400 transition-colors">
          <LogOut size={18} />
        </button>
      </div>

      {/* Connection status */}
      <div className={`rounded-xl border p-5 ${activeSub ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"}`}>
        <div className="flex items-center gap-3">
          {activeSub ? <Wifi size={28} className="text-green-400" /> : <WifiOff size={28} className="text-red-400" />}
          <div>
            <p className="font-semibold">{activeSub ? "Connected" : "No Active Subscription"}</p>
            {activeSub && <p className="text-xs text-slate-400">Username: {activeSub.username}</p>}
            {activeSub?.expiresAt && (
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                <Clock size={11} /> Expires: {new Date(activeSub.expiresAt).toLocaleDateString("en-BD")}
              </p>
            )}
          </div>
        </div>
        {!activeSub && (
          <Link to="/packages" className="mt-3 block text-center bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 transition-colors">
            View Packages
          </Link>
        )}
      </div>

      {/* Recent Orders */}
      {data.recentOrders.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h2 className="text-sm font-semibold mb-3 text-slate-200">Recent Orders</h2>
          <div className="space-y-2">
            {data.recentOrders.map((o) => (
              <div key={o.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="text-slate-200">৳{o.amountBdt.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">{o.paymentMethod ?? "—"} · {new Date(o.createdAt).toLocaleDateString()}</p>
                </div>
                <StatusBadge status={o.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nav Links */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { to: "/packages", label: "Packages", icon: Package },
          { to: "/orders", label: "My Orders", icon: Clock },
        ].map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to}
            className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center gap-2 text-sm text-slate-200 hover:border-blue-500/50 transition-colors">
            <Icon size={16} className="text-blue-400" /> {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
