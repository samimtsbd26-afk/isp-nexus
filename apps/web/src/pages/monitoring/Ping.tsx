import { useState } from "react";
import { NavLink } from "react-router";
import { trpc } from "../../lib/trpc";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const NAV_TABS = [
  { to: "/monitoring", label: "Overview" },
  { to: "/monitoring/bandwidth", label: "Bandwidth" },
  { to: "/monitoring/ping", label: "Ping" },
  { to: "/monitoring/sfp", label: "SFP" },
  { to: "/monitoring/wireless", label: "Wireless" },
];

export default function PingMonitor() {
  const { data: routers } = trpc.routerMgmt.list.useQuery();
  const [routerId, setRouterId] = useState("");
  const selected = routerId || routers?.[0]?.id || "";

  const { data: targets, refetch } = trpc.monitoring.getPingTargets.useQuery(
    { routerId: selected }, { enabled: !!selected, refetchInterval: 30_000 }
  );
  const { data: snapshots } = trpc.monitoring.getPingSnapshots.useQuery(
    { routerId: selected }, { enabled: !!selected, refetchInterval: 15_000 }
  );

  const [form, setForm] = useState({ name: "", target: "", intervalSeconds: 60, count: 5 });
  const create = trpc.monitoring.createPingTarget.useMutation({
    onSuccess: () => { refetch().catch(() => {}); setForm({ name: "", target: "", intervalSeconds: 60, count: 5 }); toast.success("Ping target added"); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.monitoring.deletePingTarget.useMutation({
    onSuccess: () => { refetch().catch(() => {}); toast.success("Deleted"); },
  });

  const chartData = [...(snapshots ?? [])].reverse().slice(-60).map((s) => ({
    time: new Date(s.capturedAt).toLocaleTimeString(),
    avg: s.avgMs ? Number(s.avgMs.toFixed(1)) : 0,
    loss: s.packetLossPct != null ? Number(s.packetLossPct.toFixed(1)) : 0,
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Ping Monitor</h1>
        <select title="Select router" value={selected} onChange={(e) => setRouterId(e.target.value)}
          className="bg-secondary border border-border rounded px-3 py-1.5 text-sm outline-none">
          {routers?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>

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

      <div className="bg-card border border-border rounded-lg p-4">
        <h2 className="text-sm font-medium mb-3">Add Ping Target</h2>
        <form
          onSubmit={(e) => { e.preventDefault(); if (selected) create.mutate({ routerId: selected, ...form }); }}
          className="flex gap-2 flex-wrap"
        >
          <input placeholder="Name (e.g. Google)" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="bg-secondary border border-border rounded px-3 py-1.5 text-sm outline-none flex-1 min-w-32" required />
          <input placeholder="Host (e.g. 8.8.8.8)" value={form.target}
            onChange={(e) => setForm({ ...form, target: e.target.value })}
            className="bg-secondary border border-border rounded px-3 py-1.5 text-sm outline-none flex-1 min-w-32" required />
          <button type="submit" disabled={!selected || create.isPending}
            className="flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1.5 rounded text-sm hover:bg-primary/90 disabled:opacity-50">
            <Plus size={14} /> Add
          </button>
        </form>
      </div>

      <div className="space-y-2">
        {targets?.map((t) => (
          <div key={t.id} className="bg-card border border-border rounded-lg px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t.name} <span className="text-muted-foreground font-normal">— {t.target}</span></p>
              <p className="text-xs text-muted-foreground">Every {t.intervalSeconds}s, count {t.count}</p>
            </div>
            <button type="button" title="Delete ping target" onClick={() => del.mutate({ id: t.id })} className="text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {selected && !targets?.length && (
          <p className="text-muted-foreground text-sm">No ping targets — add one above.</p>
        )}
      </div>

      {chartData.length > 1 && (
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium">Latency History (ms)</h2>
            <span className="text-xs text-muted-foreground">{chartData.length} samples</span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} unit="ms" />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`${v} ms`, "Avg Latency"]} />
              <ReferenceLine y={100} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.6} label={{ value: "100ms", fontSize: 10, fill: "#f59e0b" }} />
              <ReferenceLine y={200} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.6} label={{ value: "200ms", fontSize: 10, fill: "#ef4444" }} />
              <Line type="monotone" dataKey="avg" stroke="#22c55e" strokeWidth={2} dot={false} name="Avg ms" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {chartData.length > 1 && chartData.some((d) => d.loss > 0) && (
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium">Packet Loss (%)</h2>
            <span className="text-xs text-red-400 font-medium">
              Latest: {chartData[chartData.length - 1]?.loss ?? 0}%
            </span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, 100]} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`${v}%`, "Packet Loss"]} />
              <ReferenceLine y={5} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.6} />
              <Line type="monotone" dataKey="loss" stroke="#ef4444" strokeWidth={2} dot={false} name="Loss %" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
