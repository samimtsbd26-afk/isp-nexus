import { useState } from "react";
import { trpc } from "../../lib/trpc";
import { NavLink } from "react-router";
import { RefreshCw, Activity, Thermometer, Zap, Gauge } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Select, Empty } from "../../components/ui/index";

const NAV_TABS = [
  { to: "/monitoring", label: "Resource" },
  { to: "/monitoring/bandwidth", label: "Bandwidth" },
  { to: "/monitoring/ping", label: "Ping" },
  { to: "/monitoring/sfp", label: "SFP" },
];

function sfpStatus(tx: number | null, rx: number | null) {
  if (tx == null || rx == null) return { label: "Unknown", variant: "default" as const };
  if (tx < -20 || rx < -25) return { label: "Critical", variant: "destructive" as const };
  if (tx < -15 || rx < -20) return { label: "Warning", variant: "warning" as const };
  return { label: "Good", variant: "success" as const };
}

export default function SfpMonitor() {
  const { data: routers } = trpc.routerMgmt.list.useQuery();
  const [routerId, setRouterId] = useState("");
  const selected = routerId || routers?.[0]?.id || "";

  const { data: modules, refetch: refetchModules, isLoading: modulesLoading } = trpc.mikrotik.getSfpModules.useQuery(
    { routerId: selected }, { enabled: !!selected }
  );
  const { data: snapshots } = trpc.monitoring.getSfpSnapshots.useQuery(
    { routerId: selected }, { enabled: !!selected, refetchInterval: 30_000 }
  );

  const sfpInterfaces = modules?.filter((m: any) => m.sfpModuleType || m["sfp-temperature"] || m["sfp-tx-power"] || m["sfp-rx-power"]) ?? [];

  const chartData = [...(snapshots ?? [])].reverse().map((s) => ({
    time: new Date(s.capturedAt).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }),
    tx: s.txPowerDbm ? Number(s.txPowerDbm.toFixed(2)) : null,
    rx: s.rxPowerDbm ? Number(s.rxPowerDbm.toFixed(2)) : null,
    temp: s.temperatureC ? Number(s.temperatureC.toFixed(1)) : null,
    voltage: s.voltageV ? Number(s.voltageV.toFixed(2)) : null,
    current: s.currentMa ? Number(s.currentMa.toFixed(1)) : null,
  }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">SFP Monitor</h1>
        <div className="flex gap-2">
          <Select title="Select router" value={selected} onChange={(e) => setRouterId(e.target.value)} className="w-44">
            {routers?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <button type="button" onClick={() => refetchModules()} className="p-2 rounded-md border border-border hover:bg-secondary transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>
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

      {/* Live SFP Modules */}
      {modulesLoading && (
        <div className="py-10 text-center text-muted-foreground text-sm">Loading SFP modules…</div>
      )}
      {!modulesLoading && sfpInterfaces.length === 0 && selected && (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <Activity size={36} className="mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground text-sm">No SFP modules detected on this router.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Only optical (SFP/SFP+) interfaces are shown here.</p>
        </div>
      )}
      {!modulesLoading && sfpInterfaces.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sfpInterfaces.map((m: any) => {
            const tx = m["sfp-tx-power"] != null ? Number(m["sfp-tx-power"]) : null;
            const rx = m["sfp-rx-power"] != null ? Number(m["sfp-rx-power"]) : null;
            const temp = m["sfp-temperature"] != null ? Number(m["sfp-temperature"]) : null;
            const volt = m["sfp-voltage"] != null ? Number(m["sfp-voltage"]) : null;
            const curr = m["sfp-current"] != null ? Number(m["sfp-current"]) : null;
            const status = sfpStatus(tx, rx);
            return (
              <Card key={m[".id"] ?? m.name} className={status.variant === "destructive" ? "border-red-500/30" : undefined}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{m.name}</CardTitle>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{m.sfpModuleType ?? "Unknown module"}</p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-emerald-500/10">
                        <Activity size={12} className="text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-xs font-bold">{tx != null ? `${tx.toFixed(2)} dBm` : "—"}</p>
                        <p className="text-[10px] text-muted-foreground">TX Power</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-blue-500/10">
                        <Activity size={12} className="text-blue-400" />
                      </div>
                      <div>
                        <p className="text-xs font-bold">{rx != null ? `${rx.toFixed(2)} dBm` : "—"}</p>
                        <p className="text-[10px] text-muted-foreground">RX Power</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-amber-500/10">
                        <Thermometer size={12} className="text-amber-400" />
                      </div>
                      <div>
                        <p className="text-xs font-bold">{temp != null ? `${temp.toFixed(1)}°C` : "—"}</p>
                        <p className="text-[10px] text-muted-foreground">Temp</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-purple-500/10">
                        <Zap size={12} className="text-purple-400" />
                      </div>
                      <div>
                        <p className="text-xs font-bold">{volt != null ? `${volt.toFixed(2)} V` : "—"}</p>
                        <p className="text-[10px] text-muted-foreground">Voltage</p>
                      </div>
                    </div>
                  </div>
                  {curr != null && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <p className="text-[10px] text-muted-foreground">Current: <span className="font-medium text-foreground">{curr.toFixed(1)} mA</span></p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Historical Charts */}
      {chartData.length > 1 && (
        <>
          {/* TX/RX Power */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity size={14} className="text-muted-foreground" />
                Optical Power (dBm)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} unit="dBm" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <ReferenceLine y={-20} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "TX Warn", fontSize: 10, fill: "#ef4444" }} />
                  <ReferenceLine y={-25} stroke="#dc2626" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "RX Warn", fontSize: 10, fill: "#dc2626" }} />
                  <Line type="monotone" dataKey="tx" stroke="#22c55e" strokeWidth={2} dot={false} name="TX Power" />
                  <Line type="monotone" dataKey="rx" stroke="#3b82f6" strokeWidth={2} dot={false} name="RX Power" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Temperature */}
          {chartData.some((d) => d.temp != null) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Thermometer size={14} className="text-muted-foreground" />
                  Temperature (°C)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} unit="°C" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.5} />
                    <Line type="monotone" dataKey="temp" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Voltage */}
          {chartData.some((d) => d.voltage != null) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Zap size={14} className="text-muted-foreground" />
                  Voltage (V)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} unit="V" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="voltage" stroke="#a855f7" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Snapshots Table */}
      {snapshots && snapshots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Recent Snapshots</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Interface</TableHead>
                  <TableHead>TX</TableHead>
                  <TableHead>RX</TableHead>
                  <TableHead>Temp</TableHead>
                  <TableHead>Voltage</TableHead>
                  <TableHead>Current</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.slice(0, 20).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(s.capturedAt).toLocaleString()}</TableCell>
                    <TableCell className="text-sm font-medium">{s.interfaceName}</TableCell>
                    <TableCell className="text-sm">{s.txPowerDbm != null ? `${s.txPowerDbm.toFixed(2)} dBm` : "—"}</TableCell>
                    <TableCell className="text-sm">{s.rxPowerDbm != null ? `${s.rxPowerDbm.toFixed(2)} dBm` : "—"}</TableCell>
                    <TableCell className="text-sm">{s.temperatureC != null ? `${s.temperatureC.toFixed(1)}°C` : "—"}</TableCell>
                    <TableCell className="text-sm">{s.voltageV != null ? `${s.voltageV.toFixed(2)} V` : "—"}</TableCell>
                    <TableCell className="text-sm">{s.currentMa != null ? `${s.currentMa.toFixed(1)} mA` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!selected && (
        <div className="py-10 text-center text-muted-foreground text-sm">Select a router to view SFP data.</div>
      )}
    </div>
  );
}
