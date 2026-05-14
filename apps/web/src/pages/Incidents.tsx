import { useState } from "react";
import { trpc } from "../lib/trpc";
import { AlertTriangle, Router, Database, Globe, CreditCard, LogIn, Clock, Shield, Activity, Trash2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/index";
import { toast } from "sonner";

type IncidentType =
  | "router_disconnect"
  | "redis_failure"
  | "postgres_failure"
  | "tls_failure"
  | "payment_mismatch"
  | "login_failure"
  | "expiry_failure"
  | "fraud_detected"
  | "health_degraded";

const INCIDENT_META: Record<IncidentType, { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; color: string; bg: string }> = {
  router_disconnect:  { label: "Router Disconnect",  icon: Router,        color: "text-red-400",    bg: "bg-red-500/10" },
  redis_failure:      { label: "Redis Failure",       icon: Database,      color: "text-orange-400", bg: "bg-orange-500/10" },
  postgres_failure:   { label: "Postgres Failure",    icon: Database,      color: "text-red-400",    bg: "bg-red-500/10" },
  tls_failure:        { label: "TLS Failure",         icon: Globe,         color: "text-amber-400",  bg: "bg-amber-500/10" },
  payment_mismatch:   { label: "Payment Mismatch",    icon: CreditCard,    color: "text-purple-400", bg: "bg-purple-500/10" },
  login_failure:      { label: "Login Failure",       icon: LogIn,         color: "text-blue-400",   bg: "bg-blue-500/10" },
  expiry_failure:     { label: "Expiry Failure",      icon: Clock,         color: "text-amber-400",  bg: "bg-amber-500/10" },
  fraud_detected:     { label: "Fraud Detected",      icon: Shield,        color: "text-red-400",    bg: "bg-red-500/10" },
  health_degraded:    { label: "Health Degraded",     icon: Activity,      color: "text-orange-400", bg: "bg-orange-500/10" },
};

const FILTER_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "router_disconnect", label: "Router" },
  { value: "redis_failure", label: "Redis" },
  { value: "postgres_failure", label: "Postgres" },
  { value: "tls_failure", label: "TLS" },
  { value: "payment_mismatch", label: "Payment" },
  { value: "login_failure", label: "Login" },
  { value: "expiry_failure", label: "Expiry" },
  { value: "fraud_detected", label: "Fraud" },
];

function formatRelativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Incidents() {
  const [filter, setFilter] = useState<string>("all");
  const utils = trpc.useUtils();

  const { data: incidents, isLoading, refetch } = trpc.settings.listIncidents.useQuery(
    { limit: 200 },
    { refetchInterval: 30_000 },
  );

  const clearMutation = trpc.settings.clearIncidents.useMutation({
    onSuccess: () => {
      toast.success("Incident log cleared");
      void utils.settings.listIncidents.invalidate();
    },
    onError: () => toast.error("Failed to clear incidents"),
  });

  const filtered = (incidents ?? []).filter((i) => filter === "all" || i.type === filter);

  const counts = (incidents ?? []).reduce((acc, i) => {
    acc[i.type] = (acc[i.type] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const criticalTypes: IncidentType[] = ["router_disconnect", "postgres_failure", "fraud_detected", "expiry_failure"];
  const criticalCount = criticalTypes.reduce((s, t) => s + (counts[t] ?? 0), 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <AlertTriangle size={20} className="text-amber-400" />
            Incident Log
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            System health events — last {(incidents ?? []).length} incidents
            {criticalCount > 0 && (
              <span className="ml-2 text-red-400 font-medium">· {criticalCount} critical</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-secondary transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Clear all incidents for this organization?")) {
                clearMutation.mutate();
              }
            }}
            disabled={clearMutation.isPending || (incidents ?? []).length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
          >
            <Trash2 size={13} />
            Clear Log
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {(["router_disconnect", "redis_failure", "postgres_failure", "tls_failure", "fraud_detected"] as IncidentType[]).map((type) => {
          const meta = INCIDENT_META[type];
          const count = counts[type] ?? 0;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setFilter(filter === type ? "all" : type)}
              className={`rounded-xl border p-4 flex items-center gap-3 text-left transition-all ${
                filter === type
                  ? "border-[hsl(var(--sidebar-primary))] bg-[hsl(var(--sidebar-primary))]/10"
                  : "border-border bg-card hover:border-[hsl(var(--sidebar-primary))]/40"
              }`}
            >
              <div className={`p-2 rounded-lg ${meta.bg}`}>
                <meta.icon size={16} className={meta.color} />
              </div>
              <div>
                <p className={`text-xl font-bold ${count > 0 ? meta.color : "text-muted-foreground"}`}>{count}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{meta.label}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter + Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Events</CardTitle>
            <div className="flex items-center gap-1 flex-wrap">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFilter(opt.value)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    filter === opt.value
                      ? "bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))]"
                      : "border border-border hover:bg-secondary text-muted-foreground"
                  }`}
                >
                  {opt.label}
                  {opt.value !== "all" && counts[opt.value] ? (
                    <span className="ml-1 opacity-70">({counts[opt.value]})</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground animate-pulse">Loading incidents…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {filter === "all" ? "No incidents recorded yet." : "No incidents of this type."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2 font-medium">Type</th>
                    <th className="text-left px-4 py-2 font-medium">Message</th>
                    <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">Details</th>
                    <th className="text-right px-4 py-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((incident, idx) => {
                    const type = (incident.type ?? "health_degraded") as IncidentType;
                    const meta = INCIDENT_META[type] ?? INCIDENT_META.health_degraded;
                    return (
                      <tr key={idx} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${meta.bg} ${meta.color}`}>
                            <meta.icon size={11} />
                            <span className="hidden sm:inline">{meta.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-foreground max-w-xs">
                          <span className="line-clamp-2">{incident.message}</span>
                        </td>
                        <td className="px-4 py-2.5 hidden sm:table-cell">
                          {incident.meta && Object.keys(incident.meta).length > 0 && (
                            <span className="text-xs text-muted-foreground font-mono">
                              {Object.entries(incident.meta)
                                .slice(0, 3)
                                .map(([k, v]) => `${k}: ${String(v)}`)
                                .join(" · ")}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <span className="text-xs text-muted-foreground" title={incident.ts}>
                            {formatRelativeTime(incident.ts)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
