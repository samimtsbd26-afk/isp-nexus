import { useState } from "react";
import { trpc } from "../lib/trpc";
import { RefreshCw, Network } from "lucide-react";
import { Card, CardContent, Button, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Select, Empty } from "../components/ui/index";

export default function Neighbors() {
  const { data: routers } = trpc.routerMgmt.list.useQuery();
  const [routerId, setRouterId] = useState("");
  const selected = routerId || routers?.[0]?.id || "";

  const { data: neighbors, refetch, isLoading } = trpc.mikrotik.getNeighbors.useQuery(
    { routerId: selected }, { enabled: !!selected, refetchInterval: 30_000 }
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Neighbors</h1>
          <p className="text-muted-foreground text-sm">CDP / LLDP / MNDP discovered devices</p>
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
          {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading neighbors…</div>}
          {!isLoading && neighbors && neighbors.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Identity</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Interface</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>MAC Address</TableHead>
                  <TableHead>Uptime</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {neighbors.map((n: any, i: number) => (
                  <TableRow key={n[".id"] ?? i}>
                    <TableCell className="font-medium">{n.identity ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{n.platform ?? "Unknown"}</Badge></TableCell>
                    <TableCell className="font-mono text-sm">{n.interface ?? "—"}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{n.address ?? n["ip-address"] ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{n["mac-address"] ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{n.uptime ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && (!neighbors || neighbors.length === 0) && (
            <div className="py-16 text-center space-y-2">
              <Network size={40} className="mx-auto text-muted-foreground opacity-40" />
              <p className="text-muted-foreground text-sm">{selected ? "No neighbors discovered" : "Select a router first"}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
