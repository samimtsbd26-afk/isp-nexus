import { useState, useRef, useEffect } from "react";
import { trpc } from "../../lib/trpc";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { NavLink } from "react-router";
import { Cpu, MemoryStick, Thermometer, Clock, Activity } from "lucide-react";

const NAV_TABS = [
  { to: "/monitoring", label: "Resource" },
  { to: "/monitoring/bandwidth", label: "Bandwidth" },
  { to: "/monitoring/ping", label: "Ping" },
  { to: "/monitoring/sfp", label: "SFP" },
];

function GaugeBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.style.setProperty("--gauge-pct", `${pct}%`);
  }, [pct]);
  return (
    <div className="w-full bg-secondary rounded-full h-1.5 mt-1">
      <div ref={ref} className={`gauge-fill h-1.5 rounded-full transition-all duration-500 ${color}`} />
    </div>
  );
}

export default function Monitoring() {
  const { data: routers } = trpc.routerMgmt.list.useQuery();
  const [routerId, setRouterId] = useState("");
  const selected = routerId || routers?.[0]?.id || "";

  const { data: snapshots } = trpc.monitoring.getResourceSnapshots.useQuery(
    { routerId: selected },
    { enabled: !!selected, refetchInterval: 10_000 },
  );

  const latest = snapshots?.[0];
  const memUsed = latest?.totalMemoryMb && latest?.freeMemoryMb
    ? latest.totalMemoryMb - latest.freeMemoryMb
    : 0;
  const memPct = latest?.totalMemoryMb
    ? Math.round((memUsed / latest.totalMemoryMb) * 100)
    : 0;

  const uptime = latest?.uptimeSeconds
    ? (() => {
        const d = Math.floor(latest.uptimeSeconds / 86400);
        const h = Math.floor((latest.uptimeSeconds % 86400) / 3600);
        const m = Math.floor((latest.uptimeSeconds % 3600) / 60);
        return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
      })()
    : null;

  const chartData = [...(snapshots ?? [])].reverse().slice(-60).map((s) => ({
    time: new Date(s.capturedAt).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }),
    cpu: s.cpuLoadPct ?? 0,
    mem: s.totalMemoryMb
      ? Math.round(((s.totalMemoryMb - (s.freeMemoryMb ?? 0)) / s.totalMemoryMb) * 100)
      : 0,
    temp: s.temperatureC ?? 0,
  }));

  const cpu = latest?.cpuLoadPct ?? 0;
  const temp = latest?.temperatureC ?? 0;
  const cpuColor = cpu > 80 ? "text-red-400" : cpu > 50 ? "text-amber-400" : "text-emerald-400";
  const cpuBar = cpu > 80 ? "bg-red-500" : cpu > 50 ? "bg-amber-500" : "bg-emerald-500";
  const memColor = memPct > 80 ? "text-red-400" : memPct > 60 ? "text-amber-400" : "text-blue-400";
  const memBar = memPct > 80 ? "bg-red-500" : memPct > 60 ? "bg-amber-500" : "bg-blue-500";
  const tempColor = temp > 70 ? "text-red-400" : temp > 55 ? "text-amber-400" : "text-cyan-400";
  const tempBarColor = temp > 70 ? "bg-red-500" : temp > 55 ? "bg-amber-500" : "bg-cyan-500";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Resource Monitor</h1>
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

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* CPU */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-blue-500/10">
              <Cpu size={14} className="text-blue-400" />
            </div>
            <span className="text-xs text-muted-foreground">CPU Load</span>
          </div>
          <p className={`text-2xl font-bold ${cpuColor}`}>{cpu}%</p>
          <GaugeBar value={cpu} color={cpuBar} />
        </div>

        {/* Memory */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-purple-500/10">
              <MemoryStick size={14} className="text-purple-400" />
            </div>
            <span className="text-xs text-muted-foreground">Memory</span>
          </div>
          <p className={`text-2xl font-bold ${memColor}`}>{memPct}%</p>
          <GaugeBar value={memPct} color={memBar} />
          {latest?.totalMemoryMb && (
            <p className="text-[10px] text-muted-foreground mt-1">
              {memUsed} / {latest.totalMemoryMb} MB
            </p>
          )}
        </div>

        {/* Temperature */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10">
              <Thermometer size={14} className="text-amber-400" />
            </div>
            <span className="text-xs text-muted-foreground">Temperature</span>
          </div>
          <p className={`text-2xl font-bold ${tempColor}`}>
            {temp ? `${temp}°C` : "N/A"}
          </p>
          {temp > 0 && <GaugeBar value={temp} max={90} color={tempBarColor} />}
        </div>

        {/* Uptime */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10">
              <Clock size={14} className="text-emerald-400" />
            </div>
            <span className="text-xs text-muted-foreground">Uptime</span>
          </div>
          <p className="text-xl font-bold text-emerald-400">{uptime ?? "—"}</p>
          {latest?.capturedAt && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Updated {new Date(latest.capturedAt).toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      {/* CPU + Memory Chart */}
      {chartData.length > 1 ? (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={15} className="text-muted-foreground" />
            <h2 className="text-sm font-medium">CPU & Memory — last hour</h2>
            <span className="ml-auto text-xs text-muted-foreground">{chartData.length} samples</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                interval="preserveStartEnd"
              />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} unit="%" />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, n: string) => [`${v}%`, n === "cpu" ? "CPU" : "Memory"]}
              />
              <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.5} />
              <Line type="monotone" dataKey="cpu" stroke="#3b82f6" strokeWidth={2} dot={false} name="cpu" />
              <Line type="monotone" dataKey="mem" stroke="#a855f7" strokeWidth={2} dot={false} name="mem" />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 inline-block" /> CPU</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-purple-500 inline-block" /> Memory</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-500 opacity-50 inline-block border-dashed" /> 80% threshold</span>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <Activity size={36} className="mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground text-sm">
            {selected ? "Collecting snapshots — data appears after the first monitoring job runs." : "No routers configured."}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Monitoring worker polls every 30 seconds in production mode.
          </p>
        </div>
      )}

      {/* Temperature Chart */}
      {chartData.some((d) => d.temp > 0) && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-medium mb-4">Temperature History (°C)</h2>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} unit="°" />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`${v}°C`, "Temperature"]}
              />
              <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.5} />
              <Line type="monotone" dataKey="temp" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Router Details */}
      {routers && routers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {routers.map((r) => (
            <div key={r.id} className={`bg-card border rounded-xl p-4 ${r.id === selected ? "border-primary" : "border-border"}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${r.isActive ? "bg-emerald-400" : "bg-red-400"}`} />
                <span className="text-sm font-medium truncate">{r.name}</span>
              </div>
              <p className="text-xs text-muted-foreground">{r.host}</p>
              {r.cpuLoad !== null && (
                <div className="mt-2">
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-muted-foreground">CPU</span>
                    <span className={r.cpuLoad > 80 ? "text-red-400" : "text-emerald-400"}>{r.cpuLoad}%</span>
                  </div>
                  <GaugeBar
                    value={r.cpuLoad}
                    color={r.cpuLoad > 80 ? "bg-red-500" : r.cpuLoad > 50 ? "bg-amber-500" : "bg-emerald-500"}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
