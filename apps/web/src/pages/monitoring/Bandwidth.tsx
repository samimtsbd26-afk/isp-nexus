import { useState, useEffect, useRef } from "react";
import { trpc } from "../../lib/trpc";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar, Legend,
} from "recharts";
import { NavLink } from "react-router";
import { ArrowDown, ArrowUp, Wifi, Network, Activity, RefreshCw } from "lucide-react";
import { getSocket, joinRouter, onEvent, reconnectSocket } from "../../lib/socket";
import { liveCache, type BwState } from "../../lib/cache";

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

function fromCache(routerId: string): BwState {
  return liveCache.getBandwidth(routerId) ?? {
    points: [],
    live: null,
    ifaceStats: [],
    peakRx: 0,
    peakTx: 0,
  };
}

// Converts DB bandwidth snapshot rows (grouped by ~30s buckets) into chart points
function dbSnapshotsToPoints(rows: Array<{ interfaceName: string | null; rxRateBps: number | null; txRateBps: number | null; capturedAt: Date | string }>): BwState["points"] {
  // Group by timestamp bucket (round to nearest 30s)
  const buckets = new Map<number, { rx: number; tx: number }>();
  for (const row of rows) {
    if (!row.interfaceName) continue;
    const t = new Date(row.capturedAt instanceof Date ? row.capturedAt : String(row.capturedAt)).getTime();
    const bucket = Math.round(t / 30_000) * 30_000;
    const cur = buckets.get(bucket) ?? { rx: 0, tx: 0 };
    cur.rx += row.rxRateBps ?? 0;
    cur.tx += row.txRateBps ?? 0;
    buckets.set(bucket, cur);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .slice(-120)
    .map(([ts, { rx, tx }]) => ({
      time: new Date(ts).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      rx: Math.round(rx / 1000),
      tx: Math.round(tx / 1000),
    }));
}

export default function BandwidthMonitor() {
  const { data: routers } = trpc.routerMgmt.list.useQuery();
  const [routerId, setRouterId] = useState("");
  const selected = routerId || routers?.[0]?.id || "";

  // Socket status indicators
  const [socketConnected, setSocketConnected] = useState(() => getSocket().connected);
  const [lastUpdateAt, setLastUpdateAt] = useState<Date | null>(null);
  const [updateCount, setUpdateCount] = useState(0);
  const [reconnectCount, setReconnectCount] = useState(0);
  // Track whether chart was seeded from DB (not just waiting for first socket event)
  const dbSeededRef = useRef(false);

  // Initialise from module-level cache so tab-switches are instant.
  const [bwState, setBwState] = useState<BwState>(() => fromCache(selected));
  const prevSelectedRef = useRef(selected);

  // DB fallback: load last-hour bandwidth snapshots so chart renders immediately
  // even before any socket event arrives.
  const { data: dbSnapshots } = trpc.monitoring.getBandwidthSnapshots.useQuery(
    { routerId: selected },
    { enabled: !!selected, staleTime: 30_000, refetchOnWindowFocus: false }
  );

  useEffect(() => {
    if (!dbSnapshots || dbSnapshots.length === 0 || dbSeededRef.current) return;
    // Only seed from DB if cache is still empty (no live data yet)
    if (liveCache.getBandwidth(selected)?.points?.length) return;
    const pts = dbSnapshotsToPoints(dbSnapshots);
    if (pts.length === 0) return;
    const rxVals = pts.map((p) => p.rx * 1000);
    const txVals = pts.map((p) => p.tx * 1000);
    const peakRx = Math.max(...rxVals, 0);
    const peakTx = Math.max(...txVals, 0);
    // Build ifaceStats from the most recent DB row per interface
    const latestPerIface = new Map<string, { rxRateBps: number | null; txRateBps: number | null }>();
    for (const row of dbSnapshots) {
      if (!row.interfaceName) continue;
      if (!latestPerIface.has(row.interfaceName)) latestPerIface.set(row.interfaceName, row);
    }
    const ifaceStats = Array.from(latestPerIface.entries())
      .filter(([, r]) => (r.rxRateBps ?? 0) > 0 || (r.txRateBps ?? 0) > 0)
      .sort(([, a], [, b]) => (b.rxRateBps ?? 0) - (a.rxRateBps ?? 0))
      .slice(0, 12)
      .map(([name, r]) => ({ name, rxBps: r.rxRateBps ?? 0, txBps: r.txRateBps ?? 0 }));
    setBwState((prev) => {
      if (prev.points.length > 0) return prev; // socket already delivered data
      return { points: pts, live: null, peakRx, peakTx, ifaceStats };
    });
    dbSeededRef.current = true;
  }, [dbSnapshots, selected]);

  // When the selected router changes, load cached data for that router.
  useEffect(() => {
    if (selected && selected !== prevSelectedRef.current) {
      dbSeededRef.current = false;
      setBwState(fromCache(selected));
      prevSelectedRef.current = selected;
    }
  }, [selected]);

  // On first mount restore for the initial router.
  useEffect(() => {
    if (selected) {
      const cached = liveCache.getBandwidth(selected);
      if (cached) setBwState(cached);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track socket connection state and reconnects.
  useEffect(() => {
    const sock = getSocket();
    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);
    const onReconnect = () => setReconnectCount((n) => n + 1);
    sock.on("connect", onConnect);
    sock.on("disconnect", onDisconnect);
    sock.io.on("reconnect", onReconnect);
    setSocketConnected(sock.connected);
    return () => {
      sock.off("connect", onConnect);
      sock.off("disconnect", onDisconnect);
      sock.io.off("reconnect", onReconnect);
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    joinRouter(selected);

    const off = onEvent("bandwidth:update", (data) => {
      if (data.routerId !== selected) return;

      const total = data.interfaces.reduce(
        (acc: { rx: number; tx: number }, iface: { rxBps: number; txBps: number }) => ({
          rx: acc.rx + iface.rxBps,
          tx: acc.tx + iface.txBps,
        }),
        { rx: 0, tx: 0 },
      );

      const newPoint = {
        time: new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        rx: Math.round(total.rx / 1000),
        tx: Math.round(total.tx / 1000),
      };

      setLastUpdateAt(new Date());
      setUpdateCount((n) => n + 1);

      setBwState((prev) => {
        const next: BwState = {
          live: total,
          peakRx: Math.max(prev.peakRx, total.rx),
          peakTx: Math.max(prev.peakTx, total.tx),
          ifaceStats: data.interfaces
            .filter((i: { rxBps: number; txBps: number }) => i.rxBps > 0 || i.txBps > 0)
            .sort((a: { rxBps: number }, b: { rxBps: number }) => b.rxBps - a.rxBps)
            .slice(0, 12),
          points: [...prev.points.slice(-119), newPoint],
        };
        // Persist to module cache so the next mount is instant.
        liveCache.setBandwidth(selected, next);
        return next;
      });
    });

    return () => { off(); };
  }, [selected]);

  const { points, live, ifaceStats, peakRx } = bwState;

  const barData = ifaceStats.map((i: IfaceStats) => ({
    name: i.name,
    rx: Math.round(i.rxBps / 1000),
    tx: Math.round(i.txBps / 1000),
  }));

  const hasCachedData = points.length > 0;
  // Chart renders with 1+ points (DB-seeded or live). Show immediately — don't wait for 2nd event.
  const chartReady = points.length >= 1;
  // True once a live socket update has arrived (not just DB-seeded data)
  const isLive = live !== null || updateCount > 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Bandwidth Monitor</h1>
          {/* Socket status row */}
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {/* Live/Disconnected indicator */}
            <span className={`flex items-center gap-1.5 text-xs font-medium ${socketConnected ? "text-emerald-400" : "text-red-400"}`}>
              <span className={`w-2 h-2 rounded-full inline-block ${socketConnected && isLive ? "bg-emerald-400 animate-pulse" : socketConnected ? "bg-yellow-400 animate-pulse" : "bg-red-400"}`} />
              {socketConnected ? (isLive ? "Live" : "Connected — waiting…") : "Disconnected"}
            </span>
            {/* Last update time */}
            {lastUpdateAt && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Activity size={11} />
                {lastUpdateAt.toLocaleTimeString()}
              </span>
            )}
            {/* Packet counter */}
            {updateCount > 0 && (
              <span className="text-xs text-muted-foreground">{updateCount} event{updateCount !== 1 ? "s" : ""}</span>
            )}
            {/* Reconnect counter */}
            {reconnectCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-amber-400">
                <RefreshCw size={11} /> {reconnectCount} reconnect{reconnectCount !== 1 ? "s" : ""}
              </span>
            )}
            {/* DB-seeded indicator */}
            {hasCachedData && !isLive && (
              <span className="text-xs text-muted-foreground">DB data · awaiting live…</span>
            )}
            {/* Router online badge */}
            {routers && selected && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                routers.find((r) => r.id === selected)?.isActive
                  ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                  : "text-red-400 border-red-500/30 bg-red-500/10"
              }`}>
                {routers.find((r) => r.id === selected)?.isActive ? "Router Online" : "Router Offline"}
              </span>
            )}
            {/* Reconnect button when disconnected */}
            {!socketConnected && (
              <button onClick={() => reconnectSocket()} className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                <RefreshCw size={11} /> Reconnect
              </button>
            )}
          </div>
        </div>
        <select
          title="Select router"
          value={selected}
          onChange={(e) => { setRouterId(e.target.value); }}
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium">
            {isLive ? "Live Traffic (Kbps)" : hasCachedData ? "Traffic History (DB)" : "Traffic (Kbps)"}
          </h2>
          {chartReady && (
            <div className="flex items-center gap-2">
              {isLive && <span className="flex items-center gap-1 text-xs text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live</span>}
              {!isLive && hasCachedData && <span className="text-xs text-muted-foreground">Last hour from DB</span>}
              <span className="text-xs text-muted-foreground">{points.length} pts</span>
            </div>
          )}
        </div>
        {chartReady ? (
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
          <div className="py-10 text-center space-y-3">
            <div className="flex items-end justify-center gap-1 h-16 mb-3 opacity-20">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="w-3 bg-emerald-400 rounded-sm animate-pulse"
                  style={{ height: `${20 + (i * 13 % 60)}%`, animationDelay: `${i * 50}ms` }} />
              ))}
            </div>
            <p className="text-muted-foreground text-sm">
              {socketConnected
                ? "Socket connected — waiting for first bandwidth:update event…"
                : "Socket disconnected — check API server and monitoring worker"}
            </p>
            <p className="text-xs text-muted-foreground opacity-60">
              Requires monitoring worker running in API (pnpm start / docker-compose up)
            </p>
            {!socketConnected && (
              <button
                onClick={() => reconnectSocket()}
                className="text-xs text-blue-400 hover:underline">
                Retry connection
              </button>
            )}
          </div>
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
                {ifaceStats.map((iface: IfaceStats) => (
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
