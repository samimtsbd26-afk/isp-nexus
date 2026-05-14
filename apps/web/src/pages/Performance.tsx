import { trpc } from "../lib/trpc";
import { Button } from "../components/ui/index";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "../components/ui/index";
import { RefreshCw, CheckCircle, XCircle, Database, Server, Cpu, Activity, Shield, AlertTriangle } from "lucide-react";

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function QueueRow({ q }: { q: { name: string; waiting: number; active: number; delayed: number; failed: number; completed: number } }) {
  const healthy = q.failed < 5 && q.active >= 0;
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2.5 px-4 text-sm font-mono">{q.name}</td>
      <td className="py-2.5 px-4 text-sm">{q.waiting}</td>
      <td className="py-2.5 px-4 text-sm text-blue-600">{q.active}</td>
      <td className="py-2.5 px-4 text-sm text-amber-600">{q.delayed}</td>
      <td className="py-2.5 px-4 text-sm text-red-500">{q.failed}</td>
      <td className="py-2.5 px-4">
        <Badge variant={healthy ? "success" : "warning"}>{healthy ? "OK" : "Check"}</Badge>
      </td>
    </tr>
  );
}

function SecurityFinding({ f }: { f: { check: string; status: "PASS" | "FAIL" | "WARN"; detail: string } }) {
  const icon = f.status === "PASS"
    ? <CheckCircle size={15} className="text-emerald-500 shrink-0 mt-0.5" />
    : f.status === "WARN"
    ? <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
    : <XCircle size={15} className="text-red-500 shrink-0 mt-0.5" />;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      {icon}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-xs">{f.check}</span>
          <Badge variant={f.status === "PASS" ? "success" : f.status === "WARN" ? "warning" : "destructive"}>
            {f.status}
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">{f.detail}</p>
      </div>
    </div>
  );
}

export default function Performance() {
  const { data, isLoading, refetch, dataUpdatedAt } = trpc.performance.audit.useQuery(undefined, {
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const { data: secData, isLoading: secLoading, refetch: secRefetch } = trpc.performance.securityAudit.useQuery(undefined, {
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Performance & Security Audit</h1>
          <p className="text-muted-foreground text-sm">Redis, BullMQ, PostgreSQL, and multi-org isolation check</p>
        </div>
        <div className="flex items-center gap-2">
          {dataUpdatedAt > 0 && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Updated {new Date(dataUpdatedAt).toLocaleTimeString()}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => { void refetch(); void secRefetch(); }}>
            <RefreshCw size={14} className={(isLoading || secLoading) ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="py-20 text-center text-muted-foreground text-sm animate-pulse">
          Running audit — querying Redis, BullMQ, and Postgres…
        </div>
      )}

      {data && (
        <>
          {/* Redis */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Server size={15} /> Redis Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
                <Stat label="Memory Used" value={data.redis.usedMemoryHuman} />
                <Stat label="Max Memory" value={data.redis.maxMemoryHuman === "0B" ? "No Limit" : data.redis.maxMemoryHuman} />
                <Stat label="Connected Clients" value={data.redis.connectedClients} />
                <Stat label="Total Keys" value={data.redisKeyCount.toLocaleString()} />
                <Stat label="Commands Processed" value={Number(data.redis.totalCommandsProcessed).toLocaleString()} />
                <Stat label="Cache Hits" value={Number(data.redis.keyspaceHits).toLocaleString()} />
                <Stat label="Cache Misses" value={Number(data.redis.keyspaceMisses).toLocaleString()} />
                <Stat label="Version" value={data.redis.version} />
              </div>
            </CardContent>
          </Card>

          {/* BullMQ */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Activity size={15} /> BullMQ Queue Status</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] text-muted-foreground uppercase tracking-wide">
                    <th className="py-2 px-4 text-left">Queue</th>
                    <th className="py-2 px-4 text-left">Waiting</th>
                    <th className="py-2 px-4 text-left">Active</th>
                    <th className="py-2 px-4 text-left">Delayed</th>
                    <th className="py-2 px-4 text-left">Failed</th>
                    <th className="py-2 px-4 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.queues.map((q: any) => <QueueRow key={q.name} q={q} />)}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Postgres */}
          {data.tables && data.tables.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Database size={15} /> PostgreSQL Table Sizes</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-[11px] text-muted-foreground uppercase tracking-wide">
                      <th className="py-2 px-4 text-left">Table</th>
                      <th className="py-2 px-4 text-left">Live Rows</th>
                      <th className="py-2 px-4 text-left">Total Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.tables as any[]).map((t: any, i: number) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="py-2 px-4 font-mono text-xs">{t.tablename}</td>
                        <td className="py-2 px-4 text-muted-foreground">{Number(t.live_rows).toLocaleString()}</td>
                        <td className="py-2 px-4 font-medium">{t.total_size}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Org Isolation Audit */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu size={15} /> Multi-Org Isolation Audit
                <Badge variant={data.orgAudit.isolation === "PASS" ? "success" : "destructive"} className="ml-2">
                  {data.orgAudit.isolation}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.orgAudit.findings.map((f: any) => (
                  <div key={f.key} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                    {f.orgScoped
                      ? <CheckCircle size={15} className="text-emerald-500 shrink-0 mt-0.5" />
                      : <XCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold">{f.key}</span>
                        {f.count != null && (
                          <Badge variant="outline" className="text-[10px]">{f.count.toLocaleString()} rows for this org</Badge>
                        )}
                        <Badge variant={f.orgScoped ? "success" : "warning"}>
                          {f.orgScoped ? "Org-Scoped" : "Global by Design"}
                        </Badge>
                      </div>
                      {f.note && <p className="text-[11px] text-muted-foreground mt-0.5">{f.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Timestamp: {data.timestamp}
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {/* Security Audit */}
      {secData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield size={15} />
              Security Audit
              <Badge variant={secData.overall === "PASS" ? "success" : secData.overall === "WARN" ? "warning" : "destructive"} className="ml-2">
                {secData.overall}
              </Badge>
              <span className="ml-auto text-xs text-muted-foreground font-normal">
                Score: {secData.score}/100 · {secData.passCount} pass · {secData.warnCount} warn · {secData.failCount} fail
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${secData.overall === "PASS" ? "bg-emerald-500" : secData.overall === "WARN" ? "bg-amber-500" : "bg-red-500"}`}
                  style={{ width: `${secData.score}%` }}
                />
              </div>
            </div>
            <div>
              {(secData.findings as any[]).map((f: any) => (
                <SecurityFinding key={f.check} f={f} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">Last checked: {secData.timestamp}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
