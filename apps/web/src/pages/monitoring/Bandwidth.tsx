import { useState, useEffect } from "react";
import { trpc } from "../../lib/trpc";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar, Legend,
} from "recharts";
import { NavLink } from "react-router";
import { ArrowDown, ArrowUp, Wifi, Network } from "lucide-react";
import { joinRouter, onEvent } from "../../lib/socket";

interface BwPoint { time: string; rx: number; tx: number }
interface IfaceStats { name: string; rxBps: number; txBps: number }

function formatBps(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
  return `${bps} bps`;
}

const NAV_TABS = [
  { to: "/monitoring", label: "Resource" },
  { to: "/monitoring/bandwidth", label: "Bandwidth" },
  { to: "/monitoring/ping", label: "Ping" },
  { to: "/monitoring/sfp", label: "SFP" },
];

export default function BandwidthMonitor() {
  const { data: routers } = trpc.routerMgmt.list.useQuery();
  const [routerId, setRouterId] = useState("");
  const [points, setPoints] = useState<BwPoint[]>([]);
  const [live, setLive] = useState<{ rx: number; tx: number } | null>(null);
  const [ifaceStats, setIfaceStats] = useState<IfaceStats[]>([]);
  const [peakRx, setPeakRx] = useState(0);
  const [peakTx, setPeakTx] = useState(0);

  const selected = routerId || routers?.[0]?.id || "";

  useEffect(() => {
    if (!selected) return;
    setPoints([]);
    setLive(null);
    setIfaceStats([]);
    setPeakRx(0);
    setPeakTx(0);
    joinRouter(selected);

    const off = onEvent("bandwidth:update", (data) => {
      if (data.routerId !== selected) return;
      const total = data.interfaces.reduce(
        (a: { rx: number; tx: number }, b: { rxBps: number; txBps: number }) => ({
          rx: a.rx + b.rxBps,
          tx: a.tx + b.txBps,
        }),
        { rx: 0, tx: 0 },
      );
      setLive(total);
      setPeakRx((p) => Math.max(p, total.rx));
      setPeakTx((p) => Math.max(p, total.tx));
      setIfaceStats(
        data.interfaces
          .filter((i: { rxBps: number; txBps: number }) => i.rxBps > 0 || i.txBps > 0)
          .sort((a: { rxBps: number }, b: { rxBps: number }) => b.rxBps - a.rxBps)
          .slice(0, 12),
      );
      setPoints((prev) => [
        ...prev.slice(-119),
        {
          time: new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          rx: Math.round(total.rx / 1000),
          tx: Math.round(total.tx / 1000),
        },
      ]);
    });
    return () => { off(); };
  }, [selected]);

  const barData = ifaceStats.map((i) => ({
    name: i.name,
    rx: Math.round(i.rxBps / 1000),
    tx: Math.round(i.txBps / 1000),
  }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Bandwidth Monitor</h1>
        <select
          title="Select router"
          value={selected}
          onChange={(e) => setRouterId(e.target.value)}
          className="bg-secondary border border-border rounded px-3 py-1.5 text-sm outline-none"
        >
          {routers?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>

      {/* Tab Nav */}
      <div className="flex gap-2 text-sm">
        {NAV_TABS.map(({ to, label }) => (
          <NavLink key={to} to={to} end
            className={({ isActive }) =>
              `px-3 py-1.5 rounded transition-colors ${isActive ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`
            }>
            {label}
          </NavLink>
        ))}
      </div>

      {/* Live Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <ArrowDown size={18} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-lg font-bold text-emerald-400">{live ? formatBps(live.rx) : "—"}</p>
            <p className="text-xs text-muted-foreground">Download (RX)</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10">
            <ArrowUp size={18} className="text-blue-400" />
          </div>
          <div>
            <p className="text-lg font-bold text-blue-400">{live ? formatBps(live.tx) : "—"}</p>
            <p className="text-xs text-muted-foreground">Upload (TX)</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10">
            <Network size={18} className="text-purple-400" />
          </div>
          <div>
            <p className="text-lg font-bold text-purple-400">{formatBps(peakRx)}</p>
            <p className="text-xs text-muted-foreground">Peak RX</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Wifi size={18} className="text-amber-400" />
          </div>
          <div>
            <p className="text-lg font-bold text-amber-400">{ifaceStats.length}</p>
            <p className="text-xs text-muted-foreground">Active Ports</p>
          </div>
        </div>
      </div>

      {/* Live Traffic Chart */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-medium mb-4">Live Traffic (Kbps) — Real-time</h2>
        {points.length > 1 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={points}>
              <defs>
                <linearGradient id="rxGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} unit="K" />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, n: string) => [`${v} Kbps`, n === "rx" ? "↓ Download" : "↑ Upload"]}
              />
              <Legend formatter={(v) => v === "rx" ? "↓ Download" : "↑ Upload"} />
              <Area type="monotone" dataKey="rx" stroke="#22c55e" fill="url(#rxGrad)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="tx" stroke="#3b82f6" fill="url(#txGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted-foreground text-sm py-10 text-center">
            Waiting for live data via Socket.IO…
            <br />
            <span className="text-xs opacity-60">Monitoring worker must be running (production mode)</span>
          </p>
        )}
      </div>

      {/* Per-Interface Bandwidth */}
      {ifaceStats.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-medium mb-4">Per-Interface Bandwidth (Kbps)</h2>
          <ResponsiveContainer width="100%" height={Math.max(180, ifaceStats.length * 30)}>
            <BarChart data={barData} layout="vertical" barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} unit="K" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={90} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, n: string) => [`${v} Kbps`, n === "rx" ? "↓ RX" : "↑ TX"]}
              />
              <Legend formatter={(v) => v === "rx" ? "↓ Download" : "↑ Upload"} />
              <Bar dataKey="rx" fill="#22c55e" name="rx" radius={[0, 3, 3, 0]} />
              <Bar dataKey="tx" fill="#3b82f6" name="tx" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Interface List Table */}
      {ifaceStats.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="text-sm font-medium">Active Ports — Live</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Interface</th>
                  <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">↓ Download</th>
                  <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">↑ Upload</th>
                  <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {ifaceStats.map((iface) => (
                  <tr key={iface.name} className="border-b border-border last:border-0 hover:bg-secondary/30">
                    <td className="px-4 py-2.5 font-mono text-xs">{iface.name}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-400 font-medium">{formatBps(iface.rxBps)}</td>
                    <td className="px-4 py-2.5 text-right text-blue-400 font-medium">{formatBps(iface.txBps)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{formatBps(iface.rxBps + iface.txBps)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
