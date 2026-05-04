import { useState } from "react";
import { trpc } from "../lib/trpc";
import { RefreshCw } from "lucide-react";
import { Card, CardContent, Button, Badge, Select, Empty, Input } from "../components/ui/index";

type Severity = "debug" | "info" | "warning" | "error" | "critical";

function severityVariant(s: string): "default" | "info" | "warning" | "destructive" {
  if (s === "critical" || s === "error") return "destructive";
  if (s === "warning") return "warning";
  if (s === "info") return "info";
  return "default";
}

export default function SystemLogs() {
  const { data: routers } = trpc.routerMgmt.list.useQuery();
  const [routerId, setRouterId] = useState("");
  const [search, setSearch] = useState("");
  const selected = routerId || routers?.[0]?.id || "";

  const { data: logs, refetch, isLoading } = trpc.mikrotik.getSystemLogs.useQuery(
    { routerId: selected, limit: 200 },
    { enabled: !!selected, refetchInterval: 15_000 }
  );

  const filtered = (logs ?? []).filter((l: any) =>
    !search || l.message?.toLowerCase().includes(search.toLowerCase()) || l.topics?.includes(search)
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">System Logs</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} entries</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select title="Router" value={selected} onChange={(e) => setRouterId(e.target.value)} className="w-44">
            {routers?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <Input placeholder="Search logs…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-44" />
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={14} /></Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading logs…</div>}
          {!isLoading && filtered.length > 0 && (
            <div className="divide-y divide-border">
              {filtered.map((l: any, i: number) => (
                <div key={l[".id"] ?? i} className="flex items-start gap-3 px-4 py-2.5 hover:bg-secondary/30 transition-colors">
                  <div className="shrink-0 mt-0.5">
                    <Badge variant={severityVariant(l.topics ?? "info")} className="text-[10px] py-0">
                      {l.topics ?? "system"}
                    </Badge>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono">{l.message}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 font-mono">{l.time}</span>
                </div>
              ))}
            </div>
          )}
          {!isLoading && filtered.length === 0 && <Empty message={selected ? "No logs found" : "Select a router first"} />}
        </CardContent>
      </Card>
    </div>
  );
}
