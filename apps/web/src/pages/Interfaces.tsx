import { useState } from "react";
import { trpc } from "../lib/trpc";
import { RefreshCw } from "lucide-react";
import { Card, CardContent, Button, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Select, Empty } from "../components/ui/index";
import { formatBytes } from "../lib/utils";

export default function Interfaces() {
  const { data: routers } = trpc.routerMgmt.list.useQuery();
  const [routerId, setRouterId] = useState("");
  const selected = routerId || routers?.[0]?.id || "";

  const { data: ifaces, refetch, isLoading } = trpc.mikrotik.getInterfaces.useQuery(
    { routerId: selected }, { enabled: !!selected, refetchInterval: 10_000 }
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Interfaces</h1>
          <p className="text-muted-foreground text-sm">{ifaces?.length ?? 0} interfaces</p>
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
          {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading interfaces…</div>}
          {!isLoading && ifaces && ifaces.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>MAC Address</TableHead>
                  <TableHead>MTU</TableHead>
                  <TableHead>RX Bytes</TableHead>
                  <TableHead>TX Bytes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ifaces.map((i: any) => (
                  <TableRow key={i[".id"] ?? i.name}>
                    <TableCell>
                      <div className={`w-2 h-2 rounded-full ${i.running === "true" ? "bg-emerald-400" : "bg-red-400"}`} />
                    </TableCell>
                    <TableCell className="font-mono text-sm font-medium">{i.name}</TableCell>
                    <TableCell><Badge variant="outline">{i.type ?? "ether"}</Badge></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{i["mac-address"] ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{i.mtu ?? "1500"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{i["rx-byte"] ? formatBytes(Number(i["rx-byte"])) : "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{i["tx-byte"] ? formatBytes(Number(i["tx-byte"])) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && (!ifaces || ifaces.length === 0) && <Empty message={selected ? "No interfaces found" : "Select a router first"} />}
        </CardContent>
      </Card>
    </div>
  );
}
