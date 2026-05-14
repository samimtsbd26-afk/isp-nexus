import { useState } from "react";
import { trpc } from "../lib/trpc";
import {
  RefreshCw, Wifi, Clock, Shield, Globe, Zap, AlertTriangle,
  Users, ArrowRight, LogIn, Activity, CheckCircle2, XCircle, Server,
  Database, Radio,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from "../components/ui/index";
import { Link } from "react-router";

/* ── helpers ─────────────────────────────────────────────────────────────── */
function fmtBytes(b: string | number) {
  const n = typeof b === "string" ? parseInt(b, 10) : b;
  if (!n || n < 1024) return `${n || 0} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function timeSince(isoTs: string) {
  const diff = Date.now() - new Date(isoTs).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function fmtTtl(sec: number) {
  if (sec <= 0) return "expired";
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h`;
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`w-2 h-2 rounded-full shrink-0 ${ok ? "bg-green-400" : "bg-red-400"}`} />;
}

function PanelHeader({ title, count, color }: { title: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      <Badge className={`text-[10px] h-4 px-1.5 ${color}`}>{count}</Badge>
    </div>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="py-6 text-center text-xs text-muted-foreground">{message}</div>
  );
}

/* ── Health widget ───────────────────────────────────────────────────────── */
function HealthWidget() {
  const { data: health, isLoading, refetch } = trpc.settings.getHealthStatus.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const runCheck = trpc.settings.runHealthCheck.useMutation({ onSuccess: () => refetch() });

  const services = health ? [
    { label: "MikroTik", ...health.mikrotik, icon: <Radio size={13} /> },
    { label: "Redis",    ...health.redis,    icon: <Zap size={13} /> },
    { label: "Postgres", ...health.postgres, icon: <Database size={13} /> },
    { label: "Portal",   ...health.portal,   icon: <Globe size={13} /> },
    { label: "TLS",      ...health.tls,      icon: <Shield size={13} /> },
  ] : [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Server size={15} className="text-muted-foreground" />
          Health Status
          {health && (
            <Badge variant={services.every((s) => s.ok) ? "success" : "destructive"} className="text-[10px]">
              {services.filter((s) => s.ok).length}/{services.length} OK
            </Badge>
          )}
        </CardTitle>
        <Button variant="outline" size="sm" className="h-7 text-xs"
          onClick={() => runCheck.mutate()} disabled={runCheck.isPending || isLoading}>
          <RefreshCw size={11} className={`mr-1 ${runCheck.isPending ? "animate-spin" : ""}`} />
          Check Now
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading && !health && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <RefreshCw size={12} className="animate-spin" /> Checking…
          </div>
        )}
        {health && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {services.map((s) => (
              <div key={s.label} className={`rounded-lg border p-2.5 text-center ${s.ok ? "border-green-500/20 bg-green-500/5" : "border-red-500/30 bg-red-500/10"}`}>
                <div className={`flex items-center justify-center gap-1 mb-1 ${s.ok ? "text-green-400" : "text-red-400"}`}>
                  {s.icon}
                  <span className="text-[10px] font-semibold">{s.label}</span>
                </div>
                {s.ok
                  ? <p className="text-[10px] text-green-400">{s.latencyMs != null ? `${s.latencyMs}ms` : "OK"}</p>
                  : <p className="text-[10px] text-red-400 truncate" title={s.error}>{s.error?.slice(0, 20) || "FAIL"}</p>
                }
              </div>
            ))}
          </div>
        )}
        {health && (
          <p className="text-[10px] text-muted-foreground mt-2 text-right">
            Checked {timeSince(health.checkedAt)} · auto-refreshes every 60s
          </p>
        )}
        {!health && !isLoading && (
          <p className="text-xs text-muted-foreground">No health data yet. Click "Check Now".</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Main page ───────────────────────────────────────────────────────────── */
export default function HotspotDebug() {
  const [activePanel, setActivePanel] = useState<"users" | "pending" | "sessions" | "redirects" | "autologin">("users");

  const { data, isFetching, refetch } = trpc.settings.getHotspotDebug.useQuery(undefined, {
    refetchInterval: 15_000,
  });

  const panels = [
    { id: "users",     label: "Active Users",      icon: <Users size={13} />,    count: data?.activeUsers.length ?? 0 },
    { id: "pending",   label: "Pending Approvals", icon: <Clock size={13} />,    count: data?.pendingApprovals.length ?? 0 },
    { id: "sessions",  label: "Session Tokens",    icon: <Shield size={13} />,   count: data?.sessionCount ?? 0 },
    { id: "redirects", label: "Redirect Logs",     icon: <ArrowRight size={13} />, count: data?.redirectLogs.length ?? 0 },
    { id: "autologin", label: "Auto-Login Logs",   icon: <LogIn size={13} />,    count: data?.autoLoginLogs.length ?? 0 },
  ] as const;

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-muted border">
          <Activity className="w-5 h-5 text-sky-400" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">Hotspot Debug Center</h1>
          <p className="text-sm text-muted-foreground">Live operational view — refreshes every 15s</p>
        </div>
        <Link to="/hotspot-settings" className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
          Settings <ArrowRight size={11} />
        </Link>
        <Button variant="outline" size="sm" className="h-8" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={12} className={`mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {/* Health widget */}
      <HealthWidget />

      {/* Summary stats */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {panels.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActivePanel(p.id)}
              className={`rounded-xl border p-3 text-left transition-all ${
                activePanel === p.id
                  ? "border-sky-400/50 bg-sky-400/5 shadow-sm"
                  : "bg-muted/20 hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <span className={activePanel === p.id ? "text-sky-400" : ""}>{p.icon}</span>
                <span className="truncate">{p.label}</span>
              </div>
              <p className={`text-2xl font-bold ${activePanel === p.id ? "text-sky-400" : "text-foreground"}`}>
                {p.count}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* MikroTik error banner */}
      {data?.mikrotikError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-400 flex items-center gap-2">
          <AlertTriangle size={12} /> MikroTik: {data.mikrotikError}
        </div>
      )}

      {/* Panel content */}
      {!data && !isFetching && (
        <div className="py-8 text-center text-sm text-muted-foreground">No data yet — click Refresh</div>
      )}

      {data && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              {panels.find((p) => p.id === activePanel)?.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">

            {/* ── PANEL 1: Active Users ───────────────────────────────── */}
            {activePanel === "users" && (
              data.activeUsers.length === 0
                ? <EmptyRow message="No active hotspot users" />
                : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          {["", "Phone / User", "MAC", "IP", "Session", "Data In", "Data Out", "Router"].map((h) => (
                            <th key={h} className="text-left px-4 py-2 text-muted-foreground font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.activeUsers.map((u, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="px-4 py-2.5"><StatusDot ok={true} /></td>
                            <td className="px-4 py-2.5 font-medium">{u.phone || "–"}</td>
                            <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{u.mac}</td>
                            <td className="px-4 py-2.5 font-mono">{u.ip}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{u.uptime}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{fmtBytes(u.bytesIn)}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{fmtBytes(u.bytesOut)}</td>
                            <td className="px-4 py-2.5 text-sky-400">{u.router}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
            )}

            {/* ── PANEL 2: Pending Approvals ──────────────────────────── */}
            {activePanel === "pending" && (
              data.pendingApprovals.length === 0
                ? <EmptyRow message="No pending approvals" />
                : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          {["", "Phone", "Customer", "Package", "Method", "Trx ID", "Amount", "Waiting"].map((h) => (
                            <th key={h} className="text-left px-4 py-2 text-muted-foreground font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.pendingApprovals.map((o, i) => {
                          const waitMs = Date.now() - new Date(o.createdAt).getTime();
                          const waitMin = Math.floor(waitMs / 60000);
                          return (
                            <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="px-4 py-2.5"><span className="w-2 h-2 rounded-full bg-amber-400 block" /></td>
                              <td className="px-4 py-2.5 font-medium">{o.customerPhone || "–"}</td>
                              <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[120px]">{o.customerName || "–"}</td>
                              <td className="px-4 py-2.5 text-sky-400">{o.packageName || "–"}</td>
                              <td className="px-4 py-2.5"><Badge className="text-[10px] h-4">{o.paymentMethod}</Badge></td>
                              <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{o.trxId || "–"}</td>
                              <td className="px-4 py-2.5 font-medium">৳{o.amountBdt}</td>
                              <td className={`px-4 py-2.5 font-semibold ${waitMin > 15 ? "text-red-400" : waitMin > 5 ? "text-amber-400" : "text-green-400"}`}>
                                {waitMin}m
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
            )}

            {/* ── PANEL 3: Session Tokens ─────────────────────────────── */}
            {activePanel === "sessions" && (
              data.sessionTokens.length === 0
                ? <EmptyRow message={`No active Redis sessions (total: ${data.sessionCount})`} />
                : (
                  <div className="overflow-x-auto">
                    <div className="px-4 py-2 text-[10px] text-muted-foreground border-b bg-muted/20">
                      Showing {data.sessionTokens.length} of {data.sessionCount} total Redis sessions
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          {["Redis Key", "Phone / Customer", "Org", "Expires In", "Created"].map((h) => (
                            <th key={h} className="text-left px-4 py-2 text-muted-foreground font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.sessionTokens.map((s, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="px-4 py-2.5 font-mono text-[10px] text-sky-400">sess:{s.key}</td>
                            <td className="px-4 py-2.5 font-medium">{s.phone || "–"}</td>
                            <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{s.orgId?.slice(0, 8)}…</td>
                            <td className={`px-4 py-2.5 font-mono font-semibold ${s.expiresInSec < 3600 ? "text-amber-400" : "text-green-400"}`}>
                              {fmtTtl(s.expiresInSec)}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {s.createdAt ? new Date(s.createdAt).toLocaleTimeString("en-BD") : "–"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
            )}

            {/* ── PANEL 4: Redirect Logs ──────────────────────────────── */}
            {activePanel === "redirects" && (
              data.redirectLogs.length === 0
                ? <EmptyRow message="No redirect events yet — waiting for devices to connect" />
                : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          {["", "MAC", "IP", "Redirect URL", "Domain", "Time"].map((h) => (
                            <th key={h} className="text-left px-4 py-2 text-muted-foreground font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.redirectLogs.map((r, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="px-4 py-2.5">
                              {r.success
                                ? <CheckCircle2 size={12} className="text-green-400" />
                                : <XCircle size={12} className="text-red-400" />}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-[10px]">{r.mac || "–"}</td>
                            <td className="px-4 py-2.5 font-mono">{r.ip || "–"}</td>
                            <td className="px-4 py-2.5 text-sky-400 font-mono text-[10px] max-w-[200px] truncate" title={r.redirectUrl}>{r.redirectUrl || "–"}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{r.domain || "–"}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{timeSince(r.ts)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
            )}

            {/* ── PANEL 5: Auto-Login Logs ────────────────────────────── */}
            {activePanel === "autologin" && (
              data.autoLoginLogs.length === 0
                ? <EmptyRow message="No auto-login events yet — waiting for approval flows" />
                : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          {["", "Phone", "Username", "MikroTik Login URL", "Reason", "Time"].map((h) => (
                            <th key={h} className="text-left px-4 py-2 text-muted-foreground font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.autoLoginLogs.map((a, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="px-4 py-2.5">
                              {a.success
                                ? <CheckCircle2 size={12} className="text-green-400" />
                                : <XCircle size={12} className="text-red-400" />}
                            </td>
                            <td className="px-4 py-2.5 font-medium">{a.phone || "–"}</td>
                            <td className="px-4 py-2.5 font-mono">{a.username || "–"}</td>
                            <td className="px-4 py-2.5 font-mono text-[10px] text-sky-400 max-w-[200px] truncate" title={a.loginUrl}>{a.loginUrl || "–"}</td>
                            <td className="px-4 py-2.5">
                              <Badge variant={a.success ? "success" : "destructive"} className="text-[10px] h-4">
                                {a.reason || (a.success ? "ok" : "fail")}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">{timeSince(a.ts)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
            )}

          </CardContent>
        </Card>
      )}

      {/* Walled garden quick view */}
      {data && data.walledGarden.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe size={14} className="text-muted-foreground" /> Walled Garden
              <Badge className="text-[10px] h-4 px-1.5">{data.walledGarden.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.walledGarden.map((w, i) => (
                <span key={i} className="font-mono text-[10px] bg-muted px-2 py-1 rounded border">{w.dstHost}</span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-[10px] text-muted-foreground text-right">
        {data ? `Last refresh: ${new Date(data.timestamp).toLocaleTimeString("en-BD")}` : ""}
      </p>
    </div>
  );
}
