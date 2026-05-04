import { useState } from "react";
import { trpc } from "../lib/trpc";
import { RefreshCw } from "lucide-react";
import { Card, CardContent, Button, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Select, Empty } from "../components/ui/index";

type RuleType = "filter" | "nat" | "mangle" | "raw";
const RULE_TYPES: RuleType[] = ["filter", "nat", "mangle", "raw"];

export default function Firewall() {
  const { data: routers } = trpc.routerMgmt.list.useQuery();
  const [routerId, setRouterId] = useState("");
  const [type, setType] = useState<RuleType>("filter");
  const selected = routerId || routers?.[0]?.id || "";

  const { data: rules, refetch, isLoading } = trpc.mikrotik.getFirewallRules.useQuery(
    { routerId: selected, type },
    { enabled: !!selected }
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Firewall Rules</h1>
          <p className="text-muted-foreground text-sm">{rules?.length ?? 0} rules loaded</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select title="Router" value={selected} onChange={(e) => setRouterId(e.target.value)} className="w-44">
            {routers?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <div className="flex border border-border rounded-md overflow-hidden">
            {RULE_TYPES.map((t) => (
              <button key={t} type="button"
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
                onClick={() => setType(t)}>
                {t}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={14} /></Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading rules…</div>}
          {!isLoading && rules && rules.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Chain</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Protocol</TableHead>
                  <TableHead>Src Address</TableHead>
                  <TableHead>Dst Address</TableHead>
                  <TableHead>Dst Port</TableHead>
                  <TableHead>Comment</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r: any, i: number) => (
                  <TableRow key={r[".id"] ?? i}>
                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell><Badge variant="outline">{r.chain}</Badge></TableCell>
                    <TableCell>
                      {(() => {
                        let v: "destructive" | "success" | "default" = "default";
                        if (r.action === "drop" || r.action === "reject") v = "destructive";
                        else if (r.action === "accept") v = "success";
                        return <Badge variant={v}>{r.action}</Badge>;
                      })()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.protocol ?? "any"}</TableCell>
                    <TableCell className="font-mono text-xs">{r["src-address"] ?? "any"}</TableCell>
                    <TableCell className="font-mono text-xs">{r["dst-address"] ?? "any"}</TableCell>
                    <TableCell className="font-mono text-xs">{r["dst-port"] ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">{r.comment ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={r.disabled === "true" ? "destructive" : "success"}>
                        {r.disabled === "true" ? "Disabled" : "Active"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && (!rules || rules.length === 0) && (
            <Empty message={selected ? `No ${type} rules found` : "Select a router first"} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
