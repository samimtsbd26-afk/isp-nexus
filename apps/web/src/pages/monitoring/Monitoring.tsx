import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "../../lib/trpc";
import { joinRouter, onEvent, reconnectSocket } from "../../lib/socket";
import { liveCache, type ResourceState } from "../../lib/cache";
import {
  AlertTriangle,
  Bell,
  ChevronsUpDown,
  Cpu,
  GripVertical,
  HardDrive,
  MemoryStick,
  Network,
  RadioTower,
  Router,
  Search,
  ShieldCheck,
  Signal,
  Thermometer,
  Users,
  Wifi,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const REFRESH_MS = 5_000;
const SELECTED_ROUTER_KEY = "isp_monitoring_selected_router";
const LAYOUT_KEY_PREFIX = "isp_monitoring_widget_layout";

const TIME_RANGES = [
  { label: "15m", ms: 15 * 60_000 },
  { label: "1h", ms: 60 * 60_000 },
  { label: "6h", ms: 6 * 60 * 60_000 },
  { label: "24h", ms: 24 * 60 * 60_000 },
];

type WidgetSize = "sm" | "md" | "lg" | "xl";
type WidgetId =
  | "telemetry"
  | "wan"
  | "wireguard"
  | "packet"
  | "ping"
  | "interfaces"
  | "sessions"
  | "topology"
  | "alerts";

type WidgetLayout = { id: WidgetId; size: WidgetSize };

const DEFAULT_LAYOUT: WidgetLayout[] = [
  { id: "telemetry", size: "xl" },
  { id: "wan", size: "lg" },
  { id: "wireguard", size: "md" },
  { id: "packet", size: "md" },
  { id: "ping", size: "md" },
  { id: "interfaces", size: "lg" },
  { id: "sessions", size: "md" },
  { id: "topology", size: "md" },
  { id: "alerts", size: "md" },
];

type RouterRow = {
  id: string;
  name: string;
  host: string;
  isActive: boolean;
  identity?: string | null;
  model?: string | null;
  rosVersion?: string | null;
  lastSeenAt?: string | Date | null;
};

type LiveInterface = { name: string; rx: number; tx: number };
type LiveResource = {
  routerId: string;
  cpuLoadPct: number;
  freeMemoryMb: number;
  totalMemoryMb: number;
  temperatureC?: number;
  voltageV?: number;
};
type LiveAlert = {
  routerId: string;
  routerName: string;
  alertType: string;
  message: string;
  severity: string;
  createdAt: Date;
};
type ChartRow = Record<string, string | number | null>;
type AlertItem = { id: string; severity: string; message: string; createdAt: string | Date; source: string };

function pct(value: number | null | undefined, max = 100) {
  if (value == null || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}

function formatBps(value: number | null | undefined) {
  const bps = Number(value || 0);
  if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
  return `${bps} bps`;
}

function formatBytes(value: number | null | undefined) {
  const bytes = Number(value || 0);
  if (bytes >= 1_099_511_627_776) return `${(bytes / 1_099_511_627_776).toFixed(2)} TB`;
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function hotspotSessionUser(session: any): string {
  return String(session?.user ?? session?.name ?? session?.username ?? "");
}

function hotspotSessionBytes(session: any): string {
  const inbound = Number(session?.["bytes-in"] ?? session?.bytesIn ?? 0);
  const outbound = Number(session?.["bytes-out"] ?? session?.bytesOut ?? 0);
  const total = inbound + outbound;
  return total > 0 ? formatBytes(total) : "--";
}

function timeLabel(value: string | Date) {
  return new Date(value).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function chartValue(value: unknown) {
  if (typeof value !== "number") return value == null ? "--" : String(value);
  return Number.isFinite(value) ? value : "--";
}

function layoutKey(adminId: string | undefined) {
  return `${LAYOUT_KEY_PREFIX}_${adminId ?? "local"}`;
}

function loadLayout(adminId: string | undefined): WidgetLayout[] {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  try {
    const parsed = JSON.parse(localStorage.getItem(layoutKey(adminId)) ?? "[]") as WidgetLayout[];
    const valid = parsed.filter((item) => DEFAULT_LAYOUT.some((base) => base.id === item.id));
    const missing = DEFAULT_LAYOUT.filter((base) => !valid.some((item) => item.id === base.id));
    return valid.length ? [...valid, ...missing] : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function sizeClass(size: WidgetSize) {
  const classes = {
    sm: "xl:col-span-3",
    md: "xl:col-span-4",
    lg: "xl:col-span-6",
    xl: "xl:col-span-12",
  };
  return classes[size];
}

function nextSize(size: WidgetSize) {
  const sizes: WidgetSize[] = ["sm", "md", "lg", "xl"];
  return sizes[(sizes.indexOf(size) + 1) % sizes.length];
}

function TelemetryTile({ label, value, unit, sub, tone, icon: Icon }: {
  label: string;
  value: number | null;
  unit?: string;
  sub?: string;
  tone: "cyan" | "emerald" | "amber" | "red" | "violet" | "blue";
  icon: typeof Cpu;
}) {
  const colors = {
    cyan: "#22d3ee",
    emerald: "#34d399",
    amber: "#f59e0b",
    red: "#f87171",
    violet: "#a78bfa",
    blue: "#60a5fa",
  };
  const percent = value == null ? 0 : pct(value, unit === "C" ? 100 : 100) ?? 0;
  return (
    <div className="min-h-[132px] rounded-lg border border-slate-800 bg-slate-950/80 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-slate-900">
          <Icon size={15} style={{ color: colors[tone] }} />
        </span>
        <span className={`h-2 w-2 rounded-full ${value == null ? "bg-slate-600" : "bg-emerald-400"}`} />
      </div>
      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-slate-100">{value == null ? "--" : `${Math.round(value)}${unit ?? ""}`}</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-900">
          <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: colors[tone] }} />
        </div>
        <p className="mt-2 truncate text-xs text-slate-500">{sub ?? "Real-time sample"}</p>
      </div>
    </div>
  );
}

function TelemetryChart({ title, data, lines, unit, height = 238 }: {
  title: string;
  data: ChartRow[];
  lines: Array<{ key: string; name: string; color: string }>;
  unit?: string;
  height?: number;
}) {
  return (
    <div className="h-full">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        <span className="text-xs text-slate-500">{data.length} samples</span>
      </div>
      {data.length > 1 ? (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data}>
            <defs>
              {lines.map((line) => (
                <linearGradient key={line.key} id={`${line.key}TelemetryGrad`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={line.color} stopOpacity={0.32} />
                  <stop offset="95%" stopColor={line.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#64748b" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: "#64748b" }} unit={unit} />
            <Tooltip
              contentStyle={{ background: "#020617", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12, color: "#e2e8f0" }}
              formatter={(value, name) => [
                `${chartValue(value)}${typeof value === "number" && Number.isFinite(value) ? (unit ?? "") : ""}`,
                lines.find((line) => line.key === name)?.name ?? name,
              ]}
            />
            {lines.map((line) => (
              <Area
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.key}
                stroke={line.color}
                fill={`url(#${line.key}TelemetryGrad)`}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ height }} className="grid place-items-center rounded-lg border border-dashed border-slate-800 bg-slate-950/70 text-sm text-slate-500">
          No collected data for this metric yet.
        </div>
      )}
    </div>
  );
}

function WidgetShell({ item, title, subtitle, children, onResize, onDragStart, onDrop, onDragOver }: {
  item: WidgetLayout;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onResize: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onDragOver: (event: React.DragEvent) => void;
}) {
  return (
    <section
      draggable
      onDragStart={onDragStart}
      onDrop={onDrop}
      onDragOver={onDragOver}
      className={`${sizeClass(item.size)} min-h-[220px] rounded-xl border border-slate-800 bg-slate-950/85 p-4 shadow-xl shadow-black/25`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-100">{title}</h2>
          {subtitle && <p className="mt-1 truncate text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" title="Resize widget" onClick={onResize} className="grid h-8 w-8 place-items-center rounded-md border border-slate-800 text-slate-500 hover:text-slate-100">
            <ChevronsUpDown size={14} />
          </button>
          <span title="Drag widget" className="grid h-8 w-8 cursor-grab place-items-center rounded-md border border-slate-800 text-slate-500">
            <GripVertical size={14} />
          </span>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function Monitoring() {
  const queryClient = useQueryClient();
  const { data: me } = trpc.auth.me.useQuery();
  const { data: routers, dataUpdatedAt: routersUpdatedAt } = trpc.routerMgmt.list.useQuery(undefined, { refetchInterval: REFRESH_MS });
  const [routerId, setRouterId] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(SELECTED_ROUTER_KEY) ?? "";
  });
  const [timeRangeMs, setTimeRangeMs] = useState(TIME_RANGES[1].ms);
  const [search, setSearch] = useState("");
  const [hydratedRouterId, setHydratedRouterId] = useState("");
  const [lastLiveAt, setLastLiveAt] = useState<Date | null>(null);
  const [draggedWidget, setDraggedWidget] = useState<WidgetId | null>(null);
  const [layout, setLayout] = useState<WidgetLayout[]>(() => loadLayout(undefined));
  const [liveResource, setLiveResource] = useState<LiveResource | null>(null);
  const prevRouterRef = useRef("");
  const [liveInterfaces, setLiveInterfaces] = useState<LiveInterface[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<LiveAlert[]>([]);

  useEffect(() => setLayout(loadLayout(me?.id)), [me?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(layoutKey(me?.id), JSON.stringify(layout));
  }, [layout, me?.id]);

  const routerRows = routers as RouterRow[] | undefined;
  const firstActiveRouter = routerRows?.find((router) => router.isActive);
  const persistedRouter = routerRows?.find((router) => router.id === routerId && router.isActive);
  const selected = persistedRouter?.id ?? firstActiveRouter?.id ?? routerRows?.[0]?.id ?? "";
  const selectedRouter = routerRows?.find((router) => router.id === selected);
  const since = useMemo(() => new Date(Date.now() - timeRangeMs).toISOString(), [timeRangeMs]);

  const resourceQuery = trpc.monitoring.getResourceSnapshots.useQuery(
    { routerId: selected, since },
    { enabled: !!selected, refetchInterval: REFRESH_MS, staleTime: 0, gcTime: 0 },
  );
  const bandwidthQuery = trpc.monitoring.getBandwidthSnapshots.useQuery(
    { routerId: selected, since },
    { enabled: !!selected, refetchInterval: REFRESH_MS, staleTime: 0, gcTime: 0 },
  );
  const pingQuery = trpc.monitoring.getPingSnapshots.useQuery(
    { routerId: selected, since },
    { enabled: !!selected, refetchInterval: REFRESH_MS, staleTime: 0, gcTime: 0 },
  );
  const sfpQuery = trpc.monitoring.getSfpSnapshots.useQuery(
    { routerId: selected },
    { enabled: !!selected, refetchInterval: REFRESH_MS, staleTime: 0, gcTime: 0 },
  );
  const alertsQuery = trpc.monitoring.getAlerts.useQuery(
    { routerId: selected, limit: 12 },
    { enabled: !!selected, refetchInterval: REFRESH_MS, staleTime: 0, gcTime: 0 },
  );
  const hotspotUsersQuery = trpc.mikrotik.getHotspotUsers.useQuery({ routerId: selected }, { enabled: !!selected, refetchInterval: REFRESH_MS });
  const activeHotspotQuery = trpc.mikrotik.getActiveHotspotSessions.useQuery({ routerId: selected }, { enabled: !!selected, refetchInterval: REFRESH_MS });
  const pppoeUsersQuery = trpc.mikrotik.getPppoeUsers.useQuery({ routerId: selected }, { enabled: !!selected, refetchInterval: REFRESH_MS });
  const activePppoeQuery = trpc.mikrotik.getActivePppoeSessions.useQuery({ routerId: selected }, { enabled: !!selected, refetchInterval: REFRESH_MS });

  useEffect(() => {
    if (!routerRows?.length) return;
    if (routerId && routerRows.some((router) => router.id === routerId && router.isActive)) return;
    const nextRouterId = firstActiveRouter?.id ?? routerRows[0]?.id ?? "";
    if (nextRouterId) setRouterId(nextRouterId);
  }, [firstActiveRouter?.id, routerId, routerRows]);

  useEffect(() => {
    if (!selected || typeof window === "undefined") return;
    localStorage.setItem(SELECTED_ROUTER_KEY, selected);
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLiveResource(null);
    setLiveInterfaces([]);
    setLiveAlerts([]);
    setHydratedRouterId("");
    queryClient.removeQueries({
      predicate: (query) => JSON.stringify(query.queryKey).includes("monitoring"),
    });
    Promise.all([
      resourceQuery.refetch(),
      bandwidthQuery.refetch(),
      pingQuery.refetch(),
      sfpQuery.refetch(),
      alertsQuery.refetch(),
    ]).then(() => {
      if (!cancelled) setHydratedRouterId(selected);
    });
    return () => {
      cancelled = true;
    };
  }, [selected, since]);

  useEffect(() => {
    if (!selected || hydratedRouterId !== selected) return;
    reconnectSocket();
    joinRouter(selected);
    const markLive = () => setLastLiveAt(new Date());
    // Restore cached resource data for instant display on tab-return.
    if (selected !== prevRouterRef.current) {
      const cached = liveCache.getResource(selected);
      if (cached) setLiveResource(cached as LiveResource);
      prevRouterRef.current = selected;
    }

    const offResource = onEvent("resource:update", (event) => {
      if (event.routerId !== selected) return;
      setLiveResource(event);
      liveCache.setResource(selected, event as ResourceState);
      markLive();
    });
    const offBandwidth = onEvent("bandwidth:update", (event) => {
      if (event.routerId !== selected) return;
      setLiveInterfaces(event.interfaces.map((iface) => ({ name: iface.name, rx: iface.rxBps, tx: iface.txBps })));
      markLive();
    });
    const offAlert = onEvent("alert:new", (event) => {
      if (event.routerId !== selected) return;
      setLiveAlerts((current) => [{ ...event, createdAt: new Date() }, ...current].slice(0, 12));
      markLive();
    });
    return () => {
      offResource();
      offBandwidth();
      offAlert();
    };
  }, [hydratedRouterId, selected]);

  const latestResource = liveResource ?? resourceQuery.data?.[0];
  const latestSfp = sfpQuery.data?.[0];
  const memoryPct = latestResource?.totalMemoryMb
    ? Math.round(((latestResource.totalMemoryMb - (latestResource.freeMemoryMb ?? 0)) / latestResource.totalMemoryMb) * 100)
    : null;
  const hotspotUsers = hotspotUsersQuery.data?.length ?? null;
  const pppoeUsers = pppoeUsersQuery.data?.length ?? null;
  const activeSessions = (activeHotspotQuery.data?.length ?? 0) + (activePppoeQuery.data?.length ?? 0);
  const activeHotspotSessions = activeHotspotQuery.data ?? [];
  const activeHotspotUsers = new Set(activeHotspotSessions.map((session: any) => hotspotSessionUser(session)).filter(Boolean)).size;

  const bandwidthRows = bandwidthQuery.data ?? [];
  const latestBandwidthAt = bandwidthRows[0]?.capturedAt;
  const latestInterfaces = useMemo(() => {
    if (liveInterfaces.length > 0) {
      return [...liveInterfaces].sort((a, b) => b.rx + b.tx - (a.rx + a.tx));
    }
    const rows = latestBandwidthAt
      ? bandwidthRows.filter((row) => new Date(row.capturedAt).getTime() === new Date(latestBandwidthAt).getTime())
      : [];
    return rows
      .map((row) => ({
        name: row.interfaceName ?? "unknown",
        rx: Number(row.rxRateBps ?? 0),
        tx: Number(row.txRateBps ?? 0),
      }))
      .sort((a, b) => b.rx + b.tx - (a.rx + a.tx));
  }, [bandwidthRows, latestBandwidthAt, liveInterfaces]);

  const filteredInterfaces = latestInterfaces.filter((row) => row.name.toLowerCase().includes(search.toLowerCase()));
  const wanRows = latestInterfaces.filter((row) => /wan|ether1|internet/i.test(row.name));
  const wireguardRows = latestInterfaces.filter((row) => /wg|wireguard/i.test(row.name));
  const hotspotRows = latestInterfaces.filter((row) => /hotspot/i.test(row.name));
  const totalWan = wanRows.reduce((sum, row) => sum + row.rx + row.tx, 0);
  const totalWireguard = wireguardRows.reduce((sum, row) => sum + row.rx + row.tx, 0);

  const trafficData = useMemo(() => {
    const grouped = new Map<string, { time: string; wanRx: number; wanTx: number; wg: number; starlink: number; interfaces: number }>();
    for (const row of [...bandwidthRows].reverse()) {
      const time = timeLabel(row.capturedAt);
      const entry = grouped.get(time) ?? { time, wanRx: 0, wanTx: 0, wg: 0, starlink: 0, interfaces: 0 };
      const name = row.interfaceName ?? "";
      const rx = Math.round(Number(row.rxRateBps ?? 0) / 1000);
      const tx = Math.round(Number(row.txRateBps ?? 0) / 1000);
      entry.interfaces += rx + tx;
      if (/wan|ether1|internet/i.test(name)) {
        entry.wanRx += rx;
        entry.wanTx += tx;
      }
      if (/wg|wireguard/i.test(name)) entry.wg += rx + tx;
      if (/starlink/i.test(name)) entry.starlink += rx + tx;
      grouped.set(time, entry);
    }
    return Array.from(grouped.values()).slice(-90);
  }, [bandwidthRows]);

  const pingData = useMemo(() => [...(pingQuery.data ?? [])].reverse().slice(-90).map((row) => ({
    time: timeLabel(row.capturedAt),
    latency: row.avgMs == null ? null : Number(row.avgMs.toFixed(1)),
    loss: row.packetLossPct == null ? null : Number(row.packetLossPct.toFixed(1)),
  })), [pingQuery.data]);

  const sessionData = useMemo(() => {
    const updatedAt = Math.max(activeHotspotQuery.dataUpdatedAt || 0, activePppoeQuery.dataUpdatedAt || 0);
    if (!updatedAt) return [];
    return [{
      time: timeLabel(new Date(updatedAt)),
      hotspot: activeHotspotQuery.data?.length ?? 0,
      pppoe: activePppoeQuery.data?.length ?? 0,
      total: activeSessions,
    }];
  }, [activeHotspotQuery.data?.length, activeHotspotQuery.dataUpdatedAt, activePppoeQuery.data?.length, activePppoeQuery.dataUpdatedAt, activeSessions]);

  const computedAlerts: AlertItem[] = useMemo(() => {
    const now = new Date();
    const items: AlertItem[] = [];
    if (selectedRouter && !selectedRouter.isActive) {
      items.push({ id: "router-offline", severity: "critical", message: `${selectedRouter.name} is marked offline`, createdAt: now, source: "router" });
    }
    if (latestResource?.cpuLoadPct != null && latestResource.cpuLoadPct >= 80) {
      items.push({ id: "high-cpu", severity: "warning", message: `CPU load is ${latestResource.cpuLoadPct}%`, createdAt: now, source: "resource" });
    }
    const latestLoss = pingQuery.data?.[0]?.packetLossPct;
    if (latestLoss != null && latestLoss > 0) {
      items.push({ id: "packet-loss", severity: "warning", message: `Packet loss detected at ${latestLoss.toFixed(1)}%`, createdAt: now, source: "ping" });
    }
    if (selectedRouter?.isActive && wireguardRows.length === 0) {
      items.push({ id: "tunnel-down", severity: "warning", message: "No WireGuard interface traffic visible in the latest sample", createdAt: now, source: "wireguard" });
    }
    return items;
  }, [latestResource?.cpuLoadPct, pingQuery.data, selectedRouter, wireguardRows.length]);

  const alerts: AlertItem[] = [
    ...computedAlerts,
    ...liveAlerts.map((alert, index) => ({
      id: `live-${alert.routerId}-${index}`,
      severity: alert.severity,
      message: alert.message,
      createdAt: alert.createdAt,
      source: alert.alertType,
    })),
    ...(alertsQuery.data ?? []).map((alert) => ({
      id: alert.id,
      severity: alert.severity,
      message: alert.message,
      createdAt: alert.createdAt,
      source: alert.alertType ?? "alert",
    })),
  ].filter((alert) => alert.message.toLowerCase().includes(search.toLowerCase())).slice(0, 12);

  const liveConnected = !!selected && hydratedRouterId === selected && selectedRouter?.isActive !== false;

  function resizeWidget(id: WidgetId) {
    setLayout((current) => current.map((item) => item.id === id ? { ...item, size: nextSize(item.size) } : item));
  }

  function dropWidget(target: WidgetId) {
    if (!draggedWidget || draggedWidget === target) return;
    setLayout((current) => {
      const from = current.findIndex((item) => item.id === draggedWidget);
      const to = current.findIndex((item) => item.id === target);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDraggedWidget(null);
  }

  const widgetContent: Record<WidgetId, { title: string; subtitle?: string; render: () => React.ReactNode }> = {
    telemetry: {
      title: "Telemetry Matrix",
      subtitle: selectedRouter ? `${selectedRouter.name} / ${selectedRouter.host}` : "Select a router",
      render: () => (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TelemetryTile label="CPU Load" value={latestResource?.cpuLoadPct ?? null} unit="%" icon={Cpu} tone={(latestResource?.cpuLoadPct ?? 0) > 80 ? "red" : "cyan"} />
          <TelemetryTile label="Memory" value={memoryPct} unit="%" icon={MemoryStick} tone={(memoryPct ?? 0) > 80 ? "red" : "violet"} sub={latestResource?.totalMemoryMb ? `${latestResource.freeMemoryMb ?? 0} MB free` : undefined} />
          <TelemetryTile label="Temperature" value={latestResource?.temperatureC ?? null} unit="C" icon={Thermometer} tone={(latestResource?.temperatureC ?? 0) > 70 ? "red" : "amber"} />
          <TelemetryTile label="Voltage" value={latestResource?.voltageV ?? latestSfp?.voltageV ?? null} unit="V" icon={Zap} tone="blue" />
          <TelemetryTile label="Hotspot Active" value={activeHotspotQuery.data?.length ?? 0} icon={Wifi} tone="emerald" sub={`${activeHotspotUsers} online users`} />
          <TelemetryTile label="Online Users" value={activeSessions} icon={ShieldCheck} tone="emerald" sub={`${activeHotspotQuery.data?.length ?? 0} hotspot / ${activePppoeQuery.data?.length ?? 0} PPPoE`} />
          <TelemetryTile label="Sessions" value={activeSessions} icon={Users} tone="blue" sub={`${hotspotUsers ?? 0} hotspot accounts`} />
          <TelemetryTile label="PPPoE Users" value={pppoeUsers} icon={Users} tone="blue" />
          <TelemetryTile label="Interfaces" value={latestInterfaces.length} icon={Network} tone="cyan" sub={`${formatBps(totalWan)} WAN now`} />
        </div>
      ),
    },
    wan: {
      title: "WAN_STARLINK Traffic",
      subtitle: `${formatBps(totalWan)} latest aggregate`,
      render: () => <TelemetryChart title="WAN RX / TX" data={trafficData} unit="K" lines={[{ key: "wanRx", name: "WAN RX", color: "#22c55e" }, { key: "wanTx", name: "WAN TX", color: "#38bdf8" }]} />,
    },
    wireguard: {
      title: "WireGuard Tunnel Traffic",
      subtitle: `${wireguardRows.length} tunnel interfaces`,
      render: () => <TelemetryChart title="WireGuard" data={trafficData} unit="K" lines={[{ key: "wg", name: "WireGuard", color: "#34d399" }]} />,
    },
    packet: {
      title: "Packet Loss",
      subtitle: pingQuery.data?.[0]?.packetLossPct == null ? "No ping samples" : `${pingQuery.data[0].packetLossPct.toFixed(1)}% latest`,
      render: () => <TelemetryChart title="Loss %" data={pingData} unit="%" lines={[{ key: "loss", name: "Packet loss", color: "#f87171" }]} />,
    },
    ping: {
      title: "Ping Latency",
      subtitle: pingQuery.data?.[0]?.avgMs == null ? "No ping samples" : `${pingQuery.data[0].avgMs.toFixed(1)} ms latest`,
      render: () => <TelemetryChart title="Latency" data={pingData} unit="ms" lines={[{ key: "latency", name: "Latency", color: "#a78bfa" }]} />,
    },
    interfaces: {
      title: "Interface Traffic",
      subtitle: `${filteredInterfaces.length}/${latestInterfaces.length} interfaces`,
      render: () => (
        <div className="space-y-3">
          <TelemetryChart title="All Interface Throughput" data={trafficData} unit="K" height={180} lines={[{ key: "interfaces", name: "All interfaces", color: "#22d3ee" }, { key: "starlink", name: "Starlink", color: "#f59e0b" }]} />
          <div className="max-h-[320px] overflow-auto rounded-lg border border-slate-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-950 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Interface</th>
                  <th className="px-3 py-2 text-right">RX</th>
                  <th className="px-3 py-2 text-right">TX</th>
                  <th className="px-3 py-2 text-right">Class</th>
                </tr>
              </thead>
              <tbody>
                {filteredInterfaces.slice(0, 18).map((row) => (
                  <tr key={row.name} className="border-t border-slate-900">
                    <td className="px-3 py-2 font-mono text-xs text-slate-200">{row.name}</td>
                    <td className="px-3 py-2 text-right text-emerald-300">{formatBps(row.rx)}</td>
                    <td className="px-3 py-2 text-right text-cyan-300">{formatBps(row.tx)}</td>
                    <td className="px-3 py-2 text-right text-xs text-slate-500">
                      {/starlink/i.test(row.name) ? "Starlink" : /wg|wireguard/i.test(row.name) ? "WireGuard" : /hotspot/i.test(row.name) ? "Hotspot" : /wan|ether1|internet/i.test(row.name) ? "WAN" : "LAN"}
                    </td>
                  </tr>
                ))}
                {filteredInterfaces.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-10 text-center text-sm text-slate-500">No interfaces match the current filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
    sessions: {
      title: "Client Sessions",
      subtitle: `${activeSessions} active sessions`,
      render: () => (
        <div className="space-y-4">
          <TelemetryChart title="Active Sessions" data={sessionData} height={150} lines={[{ key: "hotspot", name: "Hotspot", color: "#22c55e" }, { key: "pppoe", name: "PPPoE", color: "#60a5fa" }, { key: "total", name: "Total", color: "#f59e0b" }]} />
          <div className="max-h-[300px] overflow-auto rounded-lg border border-slate-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-950 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Username</th>
                  <th className="px-3 py-2 text-left">IP</th>
                  <th className="px-3 py-2 text-left">MAC</th>
                  <th className="px-3 py-2 text-right">Uptime</th>
                  <th className="px-3 py-2 text-right">Bytes</th>
                </tr>
              </thead>
              <tbody>
                {activeHotspotSessions.slice(0, 18).map((session: any) => (
                  <tr key={session[".id"] ?? `${hotspotSessionUser(session)}-${session.address}`} className="border-t border-slate-900">
                    <td className="px-3 py-2 font-mono text-xs text-slate-100">{hotspotSessionUser(session) || "--"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-400">{session.address ?? session["ip-address"] ?? "--"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-400">{session["mac-address"] ?? "--"}</td>
                    <td className="px-3 py-2 text-right text-xs text-slate-400">{session.uptime ?? "--"}</td>
                    <td className="px-3 py-2 text-right text-xs text-emerald-300">{hotspotSessionBytes(session)}</td>
                  </tr>
                ))}
                {activeHotspotSessions.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-10 text-center text-sm text-slate-500">No active hotspot sessions returned by MikroTik.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
    topology: {
      title: "Topology",
      subtitle: "Router -> WAN -> WireGuard -> Hotspot",
      render: () => (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: selectedRouter?.name ?? "Router", value: selectedRouter?.host ?? "--", icon: Router, ok: selectedRouter?.isActive !== false },
            { label: "WAN", value: wanRows[0]?.name ?? "No WAN sample", icon: RadioTower, ok: wanRows.length > 0 },
            { label: "WireGuard", value: wireguardRows[0]?.name ?? "No tunnel sample", icon: ShieldCheck, ok: wireguardRows.length > 0 },
            { label: "Hotspot", value: hotspotRows[0]?.name ?? `${hotspotUsers ?? 0} users`, icon: Wifi, ok: (hotspotUsers ?? 0) > 0 || hotspotRows.length > 0 },
          ].map(({ label, value, icon: Icon, ok }, index) => (
            <div key={label} className="relative rounded-lg border border-slate-800 bg-slate-950/80 p-4">
              {index < 3 && <div className="absolute -right-3 top-1/2 hidden h-px w-6 bg-cyan-400/50 sm:block" />}
              <div className="flex items-center justify-between gap-3">
                <span className={`grid h-10 w-10 place-items-center rounded-lg ${ok ? "bg-cyan-400/10 text-cyan-300" : "bg-red-400/10 text-red-300"}`}>
                  <Icon size={18} />
                </span>
                <span className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-400" : "bg-red-500"}`} />
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-100">{label}</p>
              <p className="mt-1 truncate text-xs text-slate-500">{value}</p>
            </div>
          ))}
        </div>
      ),
    },
    alerts: {
      title: "Alert Center",
      subtitle: `${alerts.length} active alerts`,
      render: () => (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div key={alert.id} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-semibold uppercase ${alert.severity === "critical" ? "text-red-300" : "text-amber-300"}`}>{alert.severity}</span>
                <span className="text-[11px] text-slate-500">{new Date(alert.createdAt).toLocaleTimeString()}</span>
              </div>
              <p className="mt-2 text-sm leading-5 text-slate-300">{alert.message}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-600">{alert.source}</p>
            </div>
          ))}
          {!alerts.length && (
            <div className="grid min-h-[220px] place-items-center rounded-lg border border-dashed border-slate-800 bg-slate-950/70 text-center">
              <div>
                <Bell size={28} className="mx-auto mb-2 text-slate-600" />
                <p className="text-sm text-slate-500">No active alerts for this router.</p>
              </div>
            </div>
          )}
        </div>
      ),
    },
  };

  return (
    <div className="min-h-screen space-y-5 bg-[#030712] text-slate-100">
      <div className="sticky top-0 z-20 rounded-xl border border-slate-800 bg-slate-950/95 p-3 shadow-xl shadow-black/30 backdrop-blur">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">NOC Telemetry Mesh</p>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-50">Enterprise Monitoring</h1>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[220px_240px_220px_180px] xl:w-auto">
            <select title="Select router" value={selected} onChange={(event) => setRouterId(event.target.value)} className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none">
              {routerRows?.map((router) => <option key={router.id} value={router.id}>{router.name}</option>)}
            </select>
            <label className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search interfaces or alerts" className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900 pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-600" />
            </label>
            <div className="flex overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
              {TIME_RANGES.map((range) => (
                <button key={range.label} type="button" onClick={() => setTimeRangeMs(range.ms)} className={`flex-1 px-3 text-xs font-semibold ${timeRangeMs === range.ms ? "bg-cyan-400 text-slate-950" : "text-slate-400 hover:text-slate-100"}`}>
                  {range.label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-400">
              <span className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${liveConnected ? "bg-emerald-400" : "bg-red-500"}`} />
                {liveConnected ? "Live connected" : "Disconnected"}
              </span>
              <Signal size={14} className={liveConnected ? "text-emerald-300" : "text-red-300"} />
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
          <span>Last query {routersUpdatedAt ? new Date(routersUpdatedAt).toLocaleTimeString() : "--"}</span>
          <span>Last socket {lastLiveAt ? lastLiveAt.toLocaleTimeString() : "--"}</span>
          <span>Model <strong className="text-slate-300">{selectedRouter?.model ?? "unknown"}</strong></span>
          <span>RouterOS <strong className="text-slate-300">{selectedRouter?.rosVersion ?? "unknown"}</strong></span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {layout.map((item) => {
          const widget = widgetContent[item.id];
          return (
            <WidgetShell
              key={item.id}
              item={item}
              title={widget.title}
              subtitle={widget.subtitle}
              onResize={() => resizeWidget(item.id)}
              onDragStart={() => setDraggedWidget(item.id)}
              onDrop={() => dropWidget(item.id)}
              onDragOver={(event) => event.preventDefault()}
            >
              {widget.render()}
            </WidgetShell>
          );
        })}
      </div>
    </div>
  );
}
