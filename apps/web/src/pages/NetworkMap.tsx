import { trpc } from "../lib/trpc";
import { Card, CardContent, Badge, Button } from "../components/ui/index";
import {
  Wifi, WifiOff, Cpu, Users, ArrowDown, ArrowUp,
  RefreshCw, AlertCircle, Server, Thermometer,
} from "lucide-react";

type RouterNode = {
  id: string;
  name: string;
  host: string;
  model: string | null;
  rosVersion: string | null;
  isActive: boolean;
  isDefault: boolean;
  cpuLoad: number | null;
  freeMemoryMb: number | null;
  temperatureCelsius: number | null;
  uptimeSeconds: number | null;
  lastSeenAt: Date | null;
  activeUsers: number;
  rxMbps: number;
  txMbps: number;
  liveError: string | null;
};

function fmtUptime(seconds: number | null): string {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function RouterCard({ r }: Readonly<{ r: RouterNode }>) {
  const cpu = r.cpuLoad ?? 0;
  const cpuColor = cpu > 80 ? "text-red-500" : cpu > 60 ? "text-amber-500" : "text-emerald-500";
  const cpuBg = cpu > 80 ? "bg-red-500/10" : cpu > 60 ? "bg-amber-500/10" : "bg-emerald-500/10";

  return (
    <Card className={!r.isActive ? "border-red-500/30 opacity-75" : r.isDefault ? "border-primary/40" : ""}>
      <CardContent className="p-5 space-y-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${r.isActive ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
              {r.isActive
                ? <Wifi size={17} className="text-emerald-500" />
                : <WifiOff size={17} className="text-red-500" />}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{r.name}</p>
              <p className="text-xs text-muted-foreground truncate">{r.host}</p>
            </div>
          </div>
          <Badge variant={r.isActive ? "success" : "destructive"} className="shrink-0 text-[10px]">
            {r.isActive ? "Online" : "Offline"}
          </Badge>
        </div>

        {/* Model / ROS */}
        {(r.model || r.rosVersion) && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Server size={11} />
            {r.model && <span>{r.model}</span>}
            {r.model && r.rosVersion && <span>·</span>}
            {r.rosVersion && <span>ROS {r.rosVersion}</span>}
          </div>
        )}

        {/* Live error banner */}
        {r.liveError && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            <AlertCircle size={12} className="shrink-0" />
            <span className="truncate">{r.liveError}</span>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2">
          {/* CPU */}
          <div className={`rounded-lg p-3 ${cpuBg}`}>
            <div className="flex items-center gap-1 mb-1.5">
              <Cpu size={11} className="text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">CPU</span>
            </div>
            <p className={`text-xl font-bold leading-none ${cpuColor}`}>{cpu}%</p>
            {/* mini bar */}
            <div className="mt-2 h-1 rounded-full bg-black/10">
              <div className={`h-1 rounded-full ${cpu > 80 ? "bg-red-500" : cpu > 60 ? "bg-amber-500" : "bg-emerald-500"}`}
                style={{ width: `${Math.min(cpu, 100)}%` }} />
            </div>
          </div>

          {/* RAM */}
          <div className="rounded-lg p-3 bg-secondary/60">
            <div className="flex items-center gap-1 mb-1.5">
              <Server size={11} className="text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">RAM Free</span>
            </div>
            <p className="text-xl font-bold leading-none">
              {r.freeMemoryMb != null ? r.freeMemoryMb : "—"}
              <span className="text-xs font-normal text-muted-foreground"> MB</span>
            </p>
          </div>

          {/* Active users */}
          <div className="rounded-lg p-3 bg-blue-500/10">
            <div className="flex items-center gap-1 mb-1.5">
              <Users size={11} className="text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Users</span>
            </div>
            <p className="text-xl font-bold leading-none text-blue-600">{r.activeUsers}</p>
          </div>

          {/* Temperature */}
          <div className="rounded-lg p-3 bg-secondary/60">
            <div className="flex items-center gap-1 mb-1.5">
              <Thermometer size={11} className="text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Temp</span>
            </div>
            <p className="text-xl font-bold leading-none">
              {r.temperatureCelsius != null ? r.temperatureCelsius : "—"}
              {r.temperatureCelsius != null && <span className="text-xs font-normal text-muted-foreground"> °C</span>}
            </p>
          </div>
        </div>

        {/* Traffic row */}
        <div className="flex items-center gap-3 py-2 border-t border-border">
          <div className="flex items-center gap-1.5 text-xs">
            <ArrowDown size={12} className="text-emerald-500" />
            <span className="font-semibold text-emerald-600">{r.rxMbps} Mbps</span>
            <span className="text-muted-foreground">↓</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <ArrowUp size={12} className="text-blue-500" />
            <span className="font-semibold text-blue-600">{r.txMbps} Mbps</span>
            <span className="text-muted-foreground">↑</span>
          </div>
          {r.uptimeSeconds != null && (
            <span className="ml-auto text-[10px] text-muted-foreground">up {fmtUptime(r.uptimeSeconds)}</span>
          )}
        </div>

        {/* Last seen */}
        {r.lastSeenAt && (
          <p className="text-[10px] text-muted-foreground -mt-2">
            Last seen {new Date(r.lastSeenAt).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function NetworkMap() {
  const { data, isLoading, refetch, dataUpdatedAt } = trpc.analytics.networkMap.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const online = data?.filter((r) => r.isActive).length ?? 0;
  const offline = data?.filter((r) => !r.isActive).length ?? 0;
  const totalUsers = data?.reduce((s, r) => s + r.activeUsers, 0) ?? 0;
  const totalRx = data?.reduce((s, r) => s + r.rxMbps, 0) ?? 0;
  const totalTx = data?.reduce((s, r) => s + r.txMbps, 0) ?? 0;

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Network Map</h1>
          <p className="text-muted-foreground text-sm">Live router status and traffic — auto-refreshes every 30 s</p>
        </div>
        <div className="flex items-center gap-2">
          {dataUpdatedAt > 0 && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Updated {new Date(dataUpdatedAt).toLocaleTimeString()}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Online", value: online, color: "text-emerald-600" },
          { label: "Offline", value: offline, color: "text-red-500" },
          { label: "Active Users", value: totalUsers, color: "text-foreground" },
          { label: "Traffic ↓/↑", value: `${totalRx} / ${totalTx}`, suffix: " Mbps", color: "text-foreground" },
        ].map(({ label, value, suffix = "", color }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              <p className={`text-xl font-bold ${color}`}>{value}{suffix}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Router grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading && [1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-5 space-y-3 animate-pulse">
              <div className="flex gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-muted" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 bg-muted rounded w-2/3" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[1, 2, 3, 4].map((j) => <div key={j} className="h-16 bg-muted rounded-lg" />)}
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && data?.map((r) => <RouterCard key={r.id} r={r as RouterNode} />)}
        {!isLoading && (!data || data.length === 0) && (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
            <Wifi size={32} className="opacity-20" />
            <p className="text-sm">No routers configured</p>
          </div>
        )}
      </div>
    </div>
  );
}
