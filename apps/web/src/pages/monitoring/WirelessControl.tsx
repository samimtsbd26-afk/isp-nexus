import { useState, useEffect } from "react";
import { trpc } from "../../lib/trpc";
import { toast } from "sonner";
import {
  Wifi, WifiOff, RefreshCw, Radio, BarChart3, Zap, Activity,
  Thermometer, Users, Signal, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronRight, Power, Settings2, Search,
  Cpu, MemoryStick, ArrowUpDown,
} from "lucide-react";
import {
  Card, CardContent, CardHeader, CardTitle, Button, Badge, Modal,
} from "../../components/ui/index";

// ── types ──────────────────────────────────────────────────────────────────

type Health = "green" | "yellow" | "red";

interface ApData {
  id: string;
  routerId: string;
  interfaceName: string;
  ssid: string | null;
  band: string | null;
  channel: string | null;
  frequency: number | null;
  channelWidth: string | null;
  txPower: number | null;
  noiseFloor: number | null;
  signalStrength: number | null;
  ccq: number | null;
  txRate: number | null;
  rxRate: number | null;
  registeredClients: number;
  cpuLoad: number | null;
  freeMemoryMb: number | null;
  totalMemoryMb: number | null;
  temperatureC: number | null;
  uptime: string | null;
  isOnline: boolean;
  lastSeenAt: string | null;
  health: { cpu: Health; mem: Health; signal: Health; ccq: Health };
}

interface ChannelRec {
  channel: string;
  interference: "low" | "medium" | "high";
  apCount: number;
  avgSignal: number;
}

// ── helpers ────────────────────────────────────────────────────────────────

const healthBg: Record<Health, string> = {
  green: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  yellow: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400",
  red: "bg-red-500/10 border-red-500/30 text-red-400",
};

const healthDot: Record<Health, string> = {
  green: "bg-emerald-500",
  yellow: "bg-yellow-400",
  red: "bg-red-500",
};

const interferenceBadge: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  high: "bg-red-500/10 text-red-400 border-red-500/30",
};

function fmtBps(bps: number | null): string {
  if (!bps) return "—";
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
  return `${bps} bps`;
}

function memPct(free: number | null, total: number | null): number {
  if (!free || !total || total === 0) return 0;
  return Math.round(((total - free) / total) * 100);
}

// ── sub-components ─────────────────────────────────────────────────────────

function HealthBar({ label, value, color }: { label: string; value: string; color: Health }) {
  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded border text-xs ${healthBg[color]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${healthDot[color]} shrink-0`} />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold ml-auto">{value}</span>
    </div>
  );
}

function ApCard({ ap, onAction }: {
  ap: ApData;
  onAction: (type: "reboot" | "channel" | "txpower" | "disable" | "scan", ap: ApData) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={`transition-all ${ap.isOnline ? "" : "opacity-60"}`}>
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${ap.isOnline ? "bg-emerald-500/15" : "bg-slate-500/15"}`}>
            {ap.isOnline ? <Wifi size={16} className="text-emerald-400" /> : <WifiOff size={16} className="text-slate-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{ap.ssid ?? ap.interfaceName}</span>
              <span className="text-xs text-muted-foreground font-mono">{ap.interfaceName}</span>
              <Badge variant={ap.isOnline ? "success" : "default"} className="text-[10px]">
                {ap.isOnline ? "Online" : "Offline"}
              </Badge>
              {ap.band && <Badge variant="info" className="text-[10px]">{ap.band}</Badge>}
            </div>
            <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
              {ap.channel && <span>Ch {ap.channel}</span>}
              {ap.frequency && <span>{ap.frequency} MHz</span>}
              {ap.channelWidth && <span>{ap.channelWidth}</span>}
              <span className="flex items-center gap-1"><Users size={10} /> {ap.registeredClients} clients</span>
              {ap.uptime && <span>Up: {ap.uptime}</span>}
            </div>
          </div>
          <button onClick={() => setExpanded((x) => !x)} className="text-muted-foreground hover:text-foreground transition-colors">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-3">
          {ap.cpuLoad != null && (
            <HealthBar label="CPU" value={`${ap.cpuLoad}%`} color={ap.health.cpu} />
          )}
          {ap.freeMemoryMb != null && ap.totalMemoryMb != null && (
            <HealthBar label="RAM" value={`${memPct(ap.freeMemoryMb, ap.totalMemoryMb)}%`} color={ap.health.mem} />
          )}
          {ap.signalStrength != null && (
            <HealthBar label="Signal" value={`${ap.signalStrength} dBm`} color={ap.health.signal} />
          )}
          {ap.ccq != null && (
            <HealthBar label="CCQ" value={`${ap.ccq}%`} color={ap.health.ccq} />
          )}
          {ap.noiseFloor != null && (
            <HealthBar label="Noise" value={`${ap.noiseFloor} dBm`} color="green" />
          )}
          {ap.txPower != null && (
            <HealthBar label="TX Power" value={`${ap.txPower} dBm`} color="green" />
          )}
          {ap.temperatureC != null && (
            <HealthBar
              label="Temp"
              value={`${ap.temperatureC.toFixed(1)}°C`}
              color={ap.temperatureC > 70 ? "red" : ap.temperatureC > 55 ? "yellow" : "green"}
            />
          )}
        </div>

        {/* TX/RX rates */}
        {(ap.txRate != null || ap.rxRate != null) && (
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
            {ap.txRate != null && <span>TX: <span className="text-foreground font-medium">{fmtBps(ap.txRate)}</span></span>}
            {ap.rxRate != null && <span>RX: <span className="text-foreground font-medium">{fmtBps(ap.rxRate)}</span></span>}
          </div>
        )}

        {/* Expanded detail + actions */}
        {expanded && (
          <div className="mt-4 pt-3 border-t border-border space-y-3">
            <div className="text-xs text-muted-foreground grid grid-cols-2 gap-y-1">
              {ap.lastSeenAt && <span>Last seen: {new Date(ap.lastSeenAt).toLocaleString()}</span>}
              {ap.freeMemoryMb != null && ap.totalMemoryMb != null && (
                <span>Free RAM: {ap.freeMemoryMb} / {ap.totalMemoryMb} MB</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => onAction("scan", ap)} className="text-xs gap-1.5">
                <Search size={12} /> Scan Channels
              </Button>
              <Button size="sm" variant="outline" onClick={() => onAction("channel", ap)} className="text-xs gap-1.5">
                <Radio size={12} /> Change Channel
              </Button>
              <Button size="sm" variant="outline" onClick={() => onAction("txpower", ap)} className="text-xs gap-1.5">
                <Signal size={12} /> TX Power
              </Button>
              <Button size="sm" variant="outline" onClick={() => onAction("disable", ap)} className="text-xs gap-1.5 text-amber-400 border-amber-500/30">
                <Power size={12} /> Disable IF
              </Button>
              <Button size="sm" variant="destructive" onClick={() => onAction("reboot", ap)} className="text-xs gap-1.5">
                <RefreshCw size={12} /> Reboot AP
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── main component ─────────────────────────────────────────────────────────

export default function WirelessControl() {
  const [activeTab, setActiveTab] = useState<"overview" | "channels" | "clients" | "topology">("overview");
  const [confirmModal, setConfirmModal] = useState<null | {
    title: string;
    body: string;
    onConfirm: () => void;
  }>(null);
  const [channelModal, setChannelModal] = useState<null | { ap: ApData; recs: ChannelRec[] }>(null);
  const [txModal, setTxModal] = useState<null | { ap: ApData }>(null);
  const [newTxPower, setNewTxPower] = useState(17);
  const [newChannel, setNewChannel] = useState("");
  const [selectedAp, setSelectedAp] = useState<ApData | null>(null);

  const { data: aps = [], refetch: refetchAps, isLoading } = trpc.wireless.listAps.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const { data: scanResults = [] } = trpc.wireless.getChannelScans.useQuery(
    { routerId: selectedAp?.routerId ?? "", interfaceName: selectedAp?.interfaceName ?? "" },
    { enabled: !!selectedAp && activeTab === "channels" }
  );

  const { data: channelRecs } = trpc.wireless.getChannelRecommendations.useQuery(
    { routerId: selectedAp?.routerId ?? "", interfaceName: selectedAp?.interfaceName ?? "" },
    { enabled: !!selectedAp && activeTab === "channels" }
  );

  const { data: registrations = [] } = trpc.wireless.getRegistrationTable.useQuery(
    { routerId: selectedAp?.routerId ?? "" },
    { enabled: !!selectedAp && activeTab === "clients" }
  );

  const syncAps = trpc.wireless.syncAps.useMutation({
    onSuccess: (d) => { refetchAps(); toast.success(`Synced ${d.synced} wireless interfaces`); },
    onError: (e) => toast.error(e.message),
  });

  const runScan = trpc.wireless.runChannelScan.useMutation({
    onSuccess: (d) => { toast.success(`Scanned ${d.scanned} nearby APs`); },
    onError: (e) => toast.error(e.message),
  });

  const applyChannel = trpc.wireless.applyChannel.useMutation({
    onSuccess: (d) => { toast.success(`Channel set to ${d.applied}`); setChannelModal(null); refetchAps(); },
    onError: (e) => toast.error(e.message),
  });

  const applyTx = trpc.wireless.applyTxPower.useMutation({
    onSuccess: () => { toast.success("TX power updated"); setTxModal(null); refetchAps(); },
    onError: (e) => toast.error(e.message),
  });

  const rebootAp = trpc.wireless.rebootAp.useMutation({
    onSuccess: () => { toast.success("Reboot command sent"); setConfirmModal(null); },
    onError: (e) => toast.error(e.message),
  });

  const disableIface = trpc.wireless.setInterfaceEnabled.useMutation({
    onSuccess: () => { toast.success("Interface disabled"); setConfirmModal(null); refetchAps(); },
    onError: (e) => toast.error(e.message),
  });

  const sendAlert = trpc.wireless.sendApAlert.useMutation({
    onSuccess: () => toast.success("Alert sent to Telegram"),
    onError: (e) => toast.error(e.message),
  });

  const handleAction = (type: "reboot" | "channel" | "txpower" | "disable" | "scan", ap: ApData) => {
    setSelectedAp(ap);
    if (type === "reboot") {
      setConfirmModal({
        title: "Reboot AP",
        body: `Reboot router for interface "${ap.interfaceName}"? All connected clients will be disconnected for ~60 seconds.`,
        onConfirm: () => rebootAp.mutate({ routerId: ap.routerId }),
      });
    } else if (type === "disable") {
      setConfirmModal({
        title: "Disable Interface",
        body: `Disable wireless interface "${ap.interfaceName}"? All clients will disconnect. You can re-enable it from Winbox.`,
        onConfirm: () => disableIface.mutate({ routerId: ap.routerId, interfaceName: ap.interfaceName, enabled: false }),
      });
    } else if (type === "channel") {
      setChannelModal({ ap, recs: channelRecs?.recommendations ?? [] });
      setActiveTab("channels");
    } else if (type === "txpower") {
      setNewTxPower(ap.txPower ?? 17);
      setTxModal({ ap });
    } else if (type === "scan") {
      runScan.mutate({ routerId: ap.routerId, interfaceName: ap.interfaceName });
      setActiveTab("channels");
    }
  };

  const onlineCount = aps.filter((a) => a.isOnline).length;
  const totalClients = aps.reduce((s, a) => s + a.registeredClients, 0);
  const overloadedAps = aps.filter((a) => a.registeredClients > 20);
  const criticalAps = aps.filter((a) =>
    a.health.cpu === "red" || a.health.mem === "red" || a.health.signal === "red" || !a.isOnline
  );

  const tabs = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "channels", label: "Channel Analyzer", icon: Radio },
    { id: "clients", label: "Clients", icon: Users },
    { id: "topology", label: "Topology", icon: ArrowUpDown },
  ] as const;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Wifi size={20} className="text-blue-400" /> Wireless Control Center
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Monitor, analyze, and optimize all access points</p>
        </div>
        <div className="flex gap-2">
          {criticalAps.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => sendAlert.mutate({ message: `⚠️ ${criticalAps.length} AP(s) in critical state: ${criticalAps.map((a) => a.interfaceName).join(", ")}` })}
              className="text-red-400 border-red-500/30 gap-1.5 text-xs">
              <AlertTriangle size={13} /> Send Alert
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => syncAps.mutate()}
            disabled={syncAps.isPending}
            className="gap-1.5 text-xs">
            <RefreshCw size={13} className={syncAps.isPending ? "animate-spin" : ""} />
            {syncAps.isPending ? "Syncing…" : "Sync All APs"}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total APs</p>
            <p className="text-2xl font-bold mt-1">{aps.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Online</p>
            <p className={`text-2xl font-bold mt-1 ${onlineCount === aps.length ? "text-emerald-400" : "text-yellow-400"}`}>{onlineCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Clients</p>
            <p className="text-2xl font-bold mt-1">{totalClients}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Critical</p>
            <p className={`text-2xl font-bold mt-1 ${criticalAps.length > 0 ? "text-red-400" : "text-emerald-400"}`}>{criticalAps.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Load balancing warning */}
      {overloadedAps.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-400">Load Balancing Warning</p>
              <p className="text-muted-foreground text-xs mt-1">
                {overloadedAps.map((a) => a.interfaceName).join(", ")} {overloadedAps.length === 1 ? "has" : "have"} more than 20 clients.
                Consider reducing TX power on overloaded APs to steer clients to less-congested APs.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border pb-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-b-2 -mb-px ${
              activeTab === t.id
                ? "border-blue-500 text-blue-400 font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ──────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-10 text-sm">Loading wireless data…</div>
          ) : aps.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center space-y-3">
                <Wifi size={32} className="mx-auto text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">No wireless interfaces found. Click &quot;Sync All APs&quot; to fetch data from routers.</p>
                <Button size="sm" onClick={() => syncAps.mutate()} disabled={syncAps.isPending}>
                  <RefreshCw size={13} className={syncAps.isPending ? "animate-spin" : ""} /> Sync Now
                </Button>
              </CardContent>
            </Card>
          ) : (
            aps.map((ap) => (
              <ApCard key={ap.id} ap={ap as ApData} onAction={handleAction} />
            ))
          )}
        </div>
      )}

      {/* ── CHANNEL ANALYZER TAB ──────────────────────────────────────────── */}
      {activeTab === "channels" && (
        <div className="space-y-4">
          {/* AP selector */}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">Select AP to Analyze</p>
              <div className="flex flex-wrap gap-2">
                {aps.filter((a) => a.isOnline).map((ap) => (
                  <button
                    key={ap.id}
                    onClick={() => setSelectedAp(ap as ApData)}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                      selectedAp?.id === ap.id
                        ? "bg-blue-500/15 border-blue-500/40 text-blue-400"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}>
                    <Wifi size={11} className="inline mr-1" />
                    {ap.ssid ?? ap.interfaceName}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {selectedAp && (
            <>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => runScan.mutate({ routerId: selectedAp.routerId, interfaceName: selectedAp.interfaceName })}
                  disabled={runScan.isPending}
                  className="gap-1.5 text-xs">
                  <Search size={13} className={runScan.isPending ? "animate-spin" : ""} />
                  {runScan.isPending ? "Scanning…" : "Run Channel Scan"}
                </Button>
              </div>

              {/* Recommendations */}
              {channelRecs && channelRecs.recommendations.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Zap size={14} className="text-yellow-400" /> Channel Recommendations
                      {channelRecs.bestChannel && (
                        <Badge variant="success" className="text-[10px]">Best: Ch {channelRecs.bestChannel}</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {channelRecs.recommendations.map((rec) => (
                      <div key={rec.channel} className="flex items-center gap-3">
                        <div className={`px-3 py-1.5 rounded border text-xs flex items-center gap-2 flex-1 ${interferenceBadge[rec.interference]}`}>
                          <span className="font-semibold">Ch {rec.channel}</span>
                          <span className="text-muted-foreground ml-auto">{rec.apCount} APs nearby</span>
                          <span>{rec.avgSignal !== -100 ? `${rec.avgSignal} dBm avg` : "Clear"}</span>
                          <Badge className={`text-[9px] ${interferenceBadge[rec.interference]}`}>{rec.interference}</Badge>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs shrink-0"
                          onClick={() => {
                            setNewChannel(rec.channel);
                            setChannelModal({ ap: selectedAp, recs: channelRecs.recommendations });
                          }}>
                          Apply
                        </Button>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground mt-2">
                      For 2.4GHz use channels 1, 6, or 11 only to avoid overlap. For 5GHz any non-DFS channel is safe.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Raw scan results */}
              {scanResults.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Nearby APs ({scanResults.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border">
                            {["SSID", "BSSID", "Channel", "Freq (MHz)", "Signal", "Band"].map((h) => (
                              <th key={h} className="text-left px-3 py-2 text-[11px] text-muted-foreground font-medium">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {scanResults.map((s) => (
                            <tr key={s.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                              <td className="px-3 py-2 font-medium">{s.ssid ?? "—"}</td>
                              <td className="px-3 py-2 font-mono text-muted-foreground">{s.bssid ?? "—"}</td>
                              <td className="px-3 py-2">{s.channel ?? "—"}</td>
                              <td className="px-3 py-2">{s.frequency ?? "—"}</td>
                              <td className={`px-3 py-2 font-semibold ${
                                (s.signalStrength ?? -100) >= -65 ? "text-emerald-400"
                                : (s.signalStrength ?? -100) >= -80 ? "text-yellow-400"
                                : "text-red-400"
                              }`}>{s.signalStrength != null ? `${s.signalStrength} dBm` : "—"}</td>
                              <td className="px-3 py-2 text-muted-foreground">{s.band ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ── CLIENTS TAB ───────────────────────────────────────────────────── */}
      {activeTab === "clients" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">Select AP</p>
              <div className="flex flex-wrap gap-2">
                {aps.filter((a) => a.isOnline).map((ap) => (
                  <button
                    key={ap.id}
                    onClick={() => setSelectedAp(ap as ApData)}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                      selectedAp?.id === ap.id
                        ? "bg-blue-500/15 border-blue-500/40 text-blue-400"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}>
                    {ap.ssid ?? ap.interfaceName} ({ap.registeredClients})
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {registrations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Connected Clients ({registrations.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {["MAC", "Interface", "Signal", "SNR", "TX Rate", "RX Rate", "CCQ", "Uptime", "Loss%"].map((h) => (
                          <th key={h} className="text-left px-3 py-2 text-[11px] text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {registrations.map((r, i) => (
                        <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/30">
                          <td className="px-3 py-2 font-mono">{r.macAddress || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.interface || "—"}</td>
                          <td className={`px-3 py-2 font-semibold ${
                            (r.signalStrength ?? -100) >= -65 ? "text-emerald-400"
                            : (r.signalStrength ?? -100) >= -80 ? "text-yellow-400"
                            : "text-red-400"
                          }`}>{r.signalStrength != null ? `${r.signalStrength}` : "—"}</td>
                          <td className="px-3 py-2">{r.signalToNoise ?? "—"}</td>
                          <td className="px-3 py-2">{fmtBps(r.txRate)}</td>
                          <td className="px-3 py-2">{fmtBps(r.rxRate)}</td>
                          <td className={`px-3 py-2 ${(r.ccq ?? 100) < 50 ? "text-red-400" : (r.ccq ?? 100) < 80 ? "text-yellow-400" : "text-emerald-400"}`}>
                            {r.ccq != null ? `${r.ccq}%` : "—"}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{r.uptime || "—"}</td>
                          <td className={`px-3 py-2 ${(r.packetsLost ?? 0) > 5 ? "text-red-400" : "text-muted-foreground"}`}>
                            {r.packetsLost != null ? `${r.packetsLost}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Signal optimizer tips */}
          {registrations.length > 0 && (
            <Card className="border-blue-500/20 bg-blue-500/5">
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-semibold text-blue-400 flex items-center gap-2"><Zap size={14} /> Signal Optimizer Tips</p>
                {registrations.filter((r) => (r.signalStrength ?? 0) < -80).length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    ⚠️ {registrations.filter((r) => (r.signalStrength ?? 0) < -80).length} client(s) with weak signal (&lt;-80 dBm).
                    Consider repositioning the AP closer to these clients or adding a repeater.
                  </p>
                )}
                {registrations.filter((r) => (r.ccq ?? 100) < 50).length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    ⚠️ Low CCQ on {registrations.filter((r) => (r.ccq ?? 100) < 50).length} client(s).
                    Possible hidden node interference — consider changing channel or adding a directional antenna.
                  </p>
                )}
                {registrations.filter((r) => (r.packetsLost ?? 0) > 10).length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    ⚠️ High packet loss detected. Check for interference or retry with a different channel width.
                  </p>
                )}
                {registrations.every((r) => (r.signalStrength ?? -100) >= -75 && (r.ccq ?? 100) >= 70) && (
                  <p className="text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={12} /> All clients have good signal quality.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── TOPOLOGY TAB ──────────────────────────────────────────────────── */}
      {activeTab === "topology" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Live topology — Router → AP → Clients</p>
          {aps.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground text-sm">
                No APs found. Sync first.
              </CardContent>
            </Card>
          ) : (
            Object.entries(
              aps.reduce((acc: Record<string, ApData[]>, ap) => {
                const key = ap.routerId;
                if (!acc[key]) acc[key] = [];
                acc[key].push(ap as ApData);
                return acc;
              }, {})
            ).map(([routerId, routerAps]) => (
              <Card key={routerId}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Settings2 size={14} className="text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Router</p>
                      <p className="text-xs text-muted-foreground font-mono">{routerId.slice(0, 8)}…</p>
                    </div>
                  </div>
                  <div className="ml-4 border-l border-border pl-4 space-y-2">
                    {routerAps.map((ap) => (
                      <div key={ap.id} className="flex items-start gap-2">
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${ap.isOnline ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                          {ap.isOnline ? <Wifi size={12} className="text-emerald-400" /> : <WifiOff size={12} className="text-red-400" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs font-semibold">{ap.ssid ?? ap.interfaceName}</p>
                            <span className="text-[10px] text-muted-foreground">{ap.interfaceName}</span>
                            {ap.channel && <Badge variant="info" className="text-[9px]">Ch {ap.channel}</Badge>}
                            <Badge variant={ap.isOnline ? "success" : "default"} className="text-[9px]">
                              {ap.registeredClients} clients
                            </Badge>
                          </div>
                          {ap.registeredClients > 0 && (
                            <div className="ml-3 mt-1 border-l border-border/50 pl-3">
                              <p className="text-[10px] text-muted-foreground">{ap.registeredClients} wireless client(s)</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {ap.signalStrength != null && (
                                  <span className={`text-[10px] ${
                                    ap.signalStrength >= -65 ? "text-emerald-400"
                                    : ap.signalStrength >= -80 ? "text-yellow-400"
                                    : "text-red-400"
                                  }`}>{ap.signalStrength} dBm avg</span>
                                )}
                                {ap.ccq != null && (
                                  <span className={`text-[10px] ${ap.ccq >= 80 ? "text-emerald-400" : ap.ccq >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                                    CCQ {ap.ccq}%
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── CONFIRM MODAL ─────────────────────────────────────────────────── */}
      {confirmModal && (
        <Modal open={true} onClose={() => setConfirmModal(null)} title={confirmModal.title}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{confirmModal.body}</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setConfirmModal(null)}>Cancel</Button>
              <Button variant="destructive" onClick={confirmModal.onConfirm}>Confirm</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── CHANNEL MODAL ─────────────────────────────────────────────────── */}
      {channelModal && (
        <Modal open={true} onClose={() => setChannelModal(null)} title="Apply Best Channel">
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400">
              Changing the channel will briefly disconnect all clients. A backup of current settings is logged.
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Target Channel</label>
              <input
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value)}
                placeholder="e.g. 6 or 36"
              />
            </div>
            {channelModal.recs.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Recommended:</p>
                {channelModal.recs.slice(0, 3).map((r) => (
                  <button
                    key={r.channel}
                    onClick={() => setNewChannel(r.channel)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs border transition-colors ${
                      newChannel === r.channel ? "bg-blue-500/15 border-blue-500/40" : "border-border hover:bg-secondary/40"
                    }`}>
                    Ch {r.channel} — {r.apCount} APs nearby — <span className={interferenceBadge[r.interference].split(" ")[1]}>{r.interference} interference</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setChannelModal(null)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!newChannel) return;
                  applyChannel.mutate({
                    routerId: channelModal.ap.routerId,
                    interfaceName: channelModal.ap.interfaceName,
                    channel: newChannel,
                  });
                }}
                disabled={!newChannel || applyChannel.isPending}>
                {applyChannel.isPending ? "Applying…" : "Apply Channel"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── TX POWER MODAL ────────────────────────────────────────────────── */}
      {txModal && (
        <Modal open={true} onClose={() => setTxModal(null)} title="Set TX Power">
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-blue-400">
              Reduce TX power on overloaded APs to steer clients to nearby APs with better coverage.
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">TX Power: {newTxPower} dBm</label>
              <input
                type="range" min={5} max={30} step={1}
                value={newTxPower}
                onChange={(e) => setNewTxPower(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>5 dBm (low)</span><span>17 dBm (med)</span><span>30 dBm (max)</span>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setTxModal(null)}>Cancel</Button>
              <Button
                onClick={() => applyTx.mutate({ routerId: txModal.ap.routerId, interfaceName: txModal.ap.interfaceName, txPower: newTxPower })}
                disabled={applyTx.isPending}>
                {applyTx.isPending ? "Applying…" : "Apply"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
