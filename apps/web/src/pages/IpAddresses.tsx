import { useState } from "react";
import { trpc } from "../lib/trpc";
import { RefreshCw } from "lucide-react";
import { Card, CardContent, Button, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Select, Empty } from "../components/ui/index";

function isTruthy(val: any) {
  return val === true || val === "true";
}

export default function IpAddresses() {
  const { data: routers } = trpc.routerMgmt.list.useQuery();
  const [routerId, setRouterId] = useState("");
  const selected = routerId || routers?.[0]?.id || "";

  const { data: addresses, refetch, isLoading } = trpc.mikrotik.getIpAddresses.useQuery(
    { routerId: selected }, { enabled: !!selected }
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">IP Addresses</h1>
          <p className="text-muted-foreground text-sm">{addresses?.length ?? 0} addresses</p>
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
          {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}
          {!isLoading && addresses && addresses.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>Network</TableHead>
                  <TableHead>Interface</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Comment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {addresses.map((a: any, i: number) => (
                  <TableRow key={a[".id"] ?? i}>
                    <TableCell className="font-mono text-sm font-medium">{a.address}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{a.network ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{a.interface ?? "—"}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={isTruthy(a.disabled) ? "destructive" : isTruthy(a.dynamic) ? "warning" : "success"}>
                        {isTruthy(a.disabled) ? "Disabled" : isTruthy(a.dynamic) ? "Dynamic" : "Static"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.comment ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && (!addresses || addresses.length === 0) && <Empty message={selected ? "No IP addresses found" : "Select a router first"} />}
        </CardContent>
      </Card>
    </div>
  );
}
