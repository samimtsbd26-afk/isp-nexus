import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { api, type Order } from "../lib/api";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-blue-500/15 text-blue-400 border border-blue-500/25",
  approved: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25",
  rejected: "bg-red-500/15 text-red-400 border border-red-500/25",
  refunded: "bg-amber-500/15 text-amber-400 border border-amber-500/25",
};

export default function Orders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    const token = localStorage.getItem("isp_portal_token");
    if (!token) { navigate("/login"); return; }
    setLoading(true);
    api.getMyOrders(token).then(setOrders).catch(() => navigate("/login")).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-mesh min-h-screen pb-8">
      <div className="max-w-lg mx-auto px-4 pt-5 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="w-8 h-8 glass rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-colors"><ArrowLeft size={15} /></button>
            <div><h1 className="text-xl font-black text-white">My Orders</h1><p className="text-xs text-slate-400">{orders.length} orders</p></div>
          </div>
          <button onClick={load} className="w-8 h-8 glass rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-colors"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /></button>
        </div>

        {loading ? (
          <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="skeleton rounded-2xl h-20" />)}</div>
        ) : orders.length === 0 ? (
          <div className="glass rounded-2xl py-16 text-center space-y-3">
            <p className="text-slate-400 text-sm">No orders yet</p>
            <Link to="/packages" className="text-cyan-400 text-sm font-medium hover:text-cyan-300 transition-colors">Browse packages →</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => (
              <div key={o.id} className="glass rounded-xl p-4 flex items-center justify-between animate-slide-up">
                <div className="space-y-0.5">
                  <p className="text-white font-bold">৳{o.amountBdt.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">{o.paymentMethod ?? "—"}{o.trxId ? ` · ${o.trxId}` : ""}</p>
                  <p className="text-[11px] text-slate-500">{new Date(o.createdAt).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric" })}</p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${STATUS_STYLES[o.status] ?? STATUS_STYLES.pending}`}>{o.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
