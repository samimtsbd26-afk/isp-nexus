import { useState } from "react";
import { trpc } from "../lib/trpc";
import { RefreshCw } from "lucide-react";
import { Card, CardContent, Button, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Select, Empty } from "../components/ui/index";

export default function Routes() {
  const { data: routers } = trpc.routerMgmt.list.useQuery();
  const [routerId, setRouterId] = useState("");
  const selected = routerId || routers?.[0]?.id || "";

  const { data: routes, refetch, isLoading } = trpc.mikrotik.getRoutes.useQuery(
    { routerId: selected }, { enabled: !!selected }
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Routes</h1>
          <p className="text-muted-foreground text-sm">{routes?.length ?? 0} routes</p>
        </div>
        <div className="flex gap-2">
          <Select title="Router" value={selected} onChange={(e) => setRouterId(e.target.value)} className="w-44">
            {routers?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={14} /></Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading routes…</div>}
          {!isLoading && routes && routes.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Destination</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead>Interface</TableHead>
                  <TableHead>Distance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Comment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes.map((r: any, i: number) => (
                  <TableRow key={r[".id"] ?? i}>
                    <TableCell className="font-mono text-sm font-medium">{r["dst-address"] ?? "—"}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{r.gateway ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{r.interface ?? "—"}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.distance ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {r.active === "true" && <Badge variant="success">Active</Badge>}
                        {r.dynamic === "true" && <Badge variant="warning">Dynamic</Badge>}
                        {r.disabled === "true" && <Badge variant="destructive">Disabled</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate">{r.comment ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && (!routes || routes.length === 0) && <Empty message={selected ? "No routes found" : "Select a router first"} />}
        </CardContent>
      </Card>
    </div>
  );
}
