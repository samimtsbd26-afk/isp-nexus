import { useState, useEffect, useCallback } from "react";
import { trpc } from "../lib/trpc";
import {
  Server, Users, ShoppingCart, AlertTriangle, TrendingUp, Ticket,
  Wifi, WifiOff, Activity, Maximize2, Minimize2, RefreshCw,
  CheckCircle2, XCircle, Clock, Zap, Thermometer, Cpu,
} from "lucide-react";

function fmt(n: number | undefined | null, decimals = 0): string {
  return (n ?? 0).toLocaleString("en-BD", { maximumFractionDigits: decimals });
}

function uptimeStr(sec: number | null | undefined): string {
  if (!sec) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function RouterTile({ r }: {
  r: {
    id: string; name: string; host: string; isActive: boolean;
    cpuLoad: number | null; freeMemoryMb: number | null; totalMemoryMb?: number | null;
    temperatureCelsius: number | null; uptimeSeconds: number | null;
    model: string | null; rosVersion: string | null;
  }
}) {
  const cpuColor = (r.cpuLoad ?? 0) > 80 ? "text-red-400" : (r.cpuLoad ?? 0) > 60 ? "text-amber-400" : "text-emerald-400";
  const tempColor = (r.temperatureCelsius ?? 0) > 70 ? "text-red-400" : (r.temperatureCelsius ?? 0) > 55 ? "text-amber-400" : "text-cyan-400";

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 transition-all ${r.isActive ? "border-emerald-500/40 bg-emerald-950/20" : "border-red-500/40 bg-red-950/20"}`}>
      <div className="flex items-center gap-2">
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${r.isActive ? "bg-emerald-400 shadow-[0_0_8px_#10b981]" : "bg-red-400 shadow-[0_0_8px_#f87171]"}`} />
        <span className="text-base font-bold truncate text-white">{r.name}</span>
        {r.isActive ? (
          <span className="ml-auto text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">ONLINE</span>
        ) : (
          <span className="ml-auto text-xs font-medium text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">OFFLINE</span>
        )}
      </div>
      <p className="text-xs text-slate-400">{r.host}</p>
      {r.isActive && (
        <div className="grid grid-cols-3 gap-2 mt-1">
          <div className="text-center bg-black/30 rounded-lg p-2">
            <p className={`text-lg font-bold ${cpuColor}`}>{r.cpuLoad ?? 0}%</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">CPU</p>
          </div>
          <div className="text-center bg-black/30 rounded-lg p-2">
            <p className={`text-lg font-bold ${tempColor}`}>
              {r.temperatureCelsius ? `${Math.round(r.temperatureCelsius)}°` : "—"}
            </p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">Temp</p>
          </div>
          <div className="text-center bg-black/30 rounded-lg p-2">
            <p className="text-lg font-bold text-purple-400">{uptimeStr(r.uptimeSeconds)}</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">Uptime</p>
          </div>
        </div>
      )}
      {r.model && (
        <p className="text-[10px] text-slate-500 border-t border-white/10 pt-1 mt-1 truncate">
          {r.model}{r.rosVersion ? ` · ROS ${r.rosVersion}` : ""}
        </p>
      )}
    </div>
  );
}

function KpiTile({
  icon: Icon, label, value, sub, color = "blue",
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  color?: "blue" | "green" | "amber" | "red" | "purple" | "cyan";
}) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-400 bg-blue-400/10 border-blue-500/20",
    green: "text-emerald-400 bg-emerald-400/10 border-emerald-500/20",
    amber: "text-amber-400 bg-amber-400/10 border-amber-500/20",
    red: "text-red-400 bg-red-400/10 border-red-500/20",
    purple: "text-purple-400 bg-purple-400/10 border-purple-500/20",
    cyan: "text-cyan-400 bg-cyan-400/10 border-cyan-500/20",
  };
  return (
    <div className={`rounded-xl border p-5 flex flex-col gap-3 ${colorMap[color]}`}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-black/30">
          <Icon size={22} className={colorMap[color].split(" ")[0]} />
        </div>
        <p className="text-sm font-medium text-slate-300 uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-4xl font-black text-white">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

interface IncidentRow {
  id: string;
  alertType: string;
  message: string;
  severity: string;
  createdAt: Date | string;
}

function IncidentFeed({ incidents }: { incidents: IncidentRow[] }) {
  const colorMap: Record<string, string> = {
    critical: "text-red-400 bg-red-400/10 border-red-500/30",
    warning: "text-amber-400 bg-amber-400/10 border-amber-500/30",
    info: "text-blue-400 bg-blue-400/10 border-blue-500/30",
  };

  if (incidents.length === 0) {
    return (
      <div className="flex items-center gap-2 text-emerald-400 text-sm">
        <CheckCircle2 size={16} />
        <span>All systems normal — no active incidents</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
      {incidents.slice(0, 8).map((inc) => (
        <div key={inc.id} className={`rounded-lg border px-3 py-2 text-xs ${colorMap[inc.severity] ?? colorMap.info}`}>
          <div className="flex items-center gap-2">
            <span className="font-bold uppercase text-[10px] tracking-wider">{inc.severity}</span>
            <span className="font-medium">{inc.alertType.replace(/_/g, " ")}</span>
            <span className="ml-auto text-slate-500">{new Date(inc.createdAt).toLocaleTimeString()}</span>
          </div>
          <p className="mt-0.5 text-slate-300 truncate">{inc.message}</p>
        </div>
      ))}
    </div>
  );
}

export default function NocWallboard() {
  const [fullscreen, setFullscreen] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const dashboard = trpc.analytics.dashboard.useQuery(undefined, { refetchInterval: 30_000 });
  const incidents = trpc.ai.recentIncidents.useQuery({ limit: 20 }, { refetchInterval: 30_000 });
  const support = trpc.support.listTickets.useQuery({ status: "open" }, { refetchInterval: 60_000 });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const refresh = useCallback(() => {
    void dashboard.refetch();
    void incidents.refetch();
    void support.refetch();
    setLastRefresh(new Date());
  }, [dashboard, incidents, support]);

  useEffect(() => {
    const id = setInterval(() => setLastRefresh(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setFullscreen(false);
    }
  };

  const d = dashboard.data;
  const incRows = incidents.data?.rows ?? [];
  const criticalCount = incidents.data?.critical ?? 0;
  const openTickets = Array.isArray(support.data) ? support.data.filter((t: any) => t.status === "open" || t.status === "in_progress").length : 0;

  const routerList = d?.routerList ?? [];
  const onlineRouters = routerList.filter((r) => r.isActive);
  const offlineRouters = routerList.filter((r) => !r.isActive);

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white p-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_10px_#10b981] animate-pulse" />
            <h1 className="text-2xl font-black tracking-tight text-white">NOC WALLBOARD</h1>
          </div>
          <span className="text-xs text-slate-500 bg-slate-800/60 px-3 py-1 rounded-full border border-slate-700">
            LIVE — refreshes every 30s
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            Last: {lastRefresh.toLocaleTimeString()}
          </span>
          <button
            type="button"
            onClick={refresh}
            className="p-2 rounded-lg bg-slate-800/60 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <RefreshCw size={16} />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-slate-800/60 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiTile icon={Server} label="Routers Online" value={d?.routersOnline ?? 0} color="green" sub={`${d?.routersOffline ?? 0} offline`} />
        <KpiTile icon={Users} label="Active Subs" value={d?.activeSubscriptions ?? 0} color="blue" sub={`${d?.pppoeActive ?? 0} PPPoE · ${d?.hotspotActive ?? 0} HS`} />
        <KpiTile icon={ShoppingCart} label="Pending Orders" value={d?.pendingOrders ?? 0} color={((d?.pendingOrders ?? 0) > 5) ? "amber" : "cyan"} />
        <KpiTile
          icon={TrendingUp}
          label="Revenue Today"
          value={`৳${fmt(d?.monthRevenueBdt)}`}
          color="purple"
          sub="this month"
        />
        <KpiTile
          icon={AlertTriangle}
          label="Active Incidents"
          value={criticalCount + (incidents.data?.warning ?? 0)}
          color={criticalCount > 0 ? "red" : "amber"}
          sub={criticalCount > 0 ? `${criticalCount} critical` : "no criticals"}
        />
        <KpiTile icon={Ticket} label="Open Tickets" value={openTickets} color={openTickets > 10 ? "red" : "cyan"} />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Routers Grid */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Server size={18} className="text-blue-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">Router Status</h2>
            <span className="text-xs text-slate-500 ml-auto">
              {onlineRouters.length}/{routerList.length} online
            </span>
          </div>
          {routerList.length === 0 ? (
            <div className="text-slate-500 text-sm p-6 text-center border border-slate-800 rounded-xl">
              No routers configured
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {onlineRouters.map((r) => <RouterTile key={r.id} r={r} />)}
              {offlineRouters.map((r) => <RouterTile key={r.id} r={r} />)}
            </div>
          )}
        </div>

        {/* Right Panel */}
        <div className="flex flex-col gap-4">
          {/* Summary Stats */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 flex flex-col gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Activity size={16} className="text-cyan-400" />
              Customer Overview
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Total Customers", value: d?.totalCustomers ?? 0, color: "text-blue-400" },
                { label: "PPPoE Active", value: d?.pppoeActive ?? 0, color: "text-emerald-400" },
                { label: "Hotspot Active", value: d?.hotspotActive ?? 0, color: "text-cyan-400" },
                { label: "Expired", value: d?.expiredSubs ?? 0, color: "text-red-400" },
              ].map((item) => (
                <div key={item.label} className="bg-black/30 rounded-lg p-3 text-center">
                  <p className={`text-2xl font-black ${item.color}`}>{fmt(item.value)}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide mt-1">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Revenue Box */}
          <div className="rounded-xl border border-purple-500/20 bg-purple-950/10 p-4 flex flex-col gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <TrendingUp size={16} className="text-purple-400" />
              Revenue
            </h2>
            <div className="flex justify-between items-end">
              <div>
                <p className="text-3xl font-black text-purple-400">৳{fmt(d?.monthRevenueBdt)}</p>
                <p className="text-xs text-slate-500">This month</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-purple-300">৳{fmt(d?.totalRevenueBdt)}</p>
                <p className="text-xs text-slate-500">All time</p>
              </div>
            </div>
          </div>

          {/* Incidents Feed */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 flex flex-col gap-3 flex-1">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className={criticalCount > 0 ? "text-red-400" : "text-amber-400"} />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">Live Incidents</h2>
              {criticalCount > 0 && (
                <span className="ml-auto text-xs font-bold text-red-400 bg-red-400/10 border border-red-500/30 px-2 py-0.5 rounded-full animate-pulse">
                  {criticalCount} CRITICAL
                </span>
              )}
            </div>
            <IncidentFeed incidents={incRows as IncidentRow[]} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-slate-600 border-t border-slate-800/60 pt-3">
        <span>ISP Nexus NOC Dashboard</span>
        <span>{new Date().toLocaleDateString("en-BD", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
        <span className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          LIVE
        </span>
      </div>
    </div>
  );
}
