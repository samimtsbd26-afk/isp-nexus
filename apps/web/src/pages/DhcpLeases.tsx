import { useState } from "react";
import { trpc } from "../lib/trpc";
import { RefreshCw } from "lucide-react";
import { Card, CardContent, Button, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Select, Empty, Input } from "../components/ui/index";

export default function DhcpLeases() {
  const { data: routers } = trpc.routerMgmt.list.useQuery();
  const [routerId, setRouterId] = useState("");
  const [search, setSearch] = useState("");
  const selected = routerId || routers?.[0]?.id || "";

  const { data: leases, refetch, isLoading } = trpc.mikrotik.getDhcpLeases.useQuery(
    { routerId: selected }, { enabled: !!selected, refetchInterval: 30_000 }
  );

  const filtered = (leases ?? []).filter((l: any) =>
    !search || l.address?.includes(search) || l["mac-address"]?.includes(search) || l["host-name"]?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">DHCP Leases</h1>
          <p className="text-muted-foreground text-sm">{leases?.length ?? 0} leases</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select title="Router" value={selected} onChange={(e) => setRouterId(e.target.value)} className="w-44">
            {routers?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <Input placeholder="IP / MAC / Host…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-44" />
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={14} /></Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}
          {!isLoading && filtered.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP Address</TableHead>
                  <TableHead>MAC Address</TableHead>
                  <TableHead>Hostname</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l: any, i: number) => (
                  <TableRow key={l[".id"] ?? i}>
                    <TableCell className="font-mono text-sm font-medium">{l.address}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{l["mac-address"] ?? "—"}</TableCell>
                    <TableCell className="text-sm">{l["host-name"] ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{l.server ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={l.status === "bound" ? "success" : "warning"}>{l.status ?? "unknown"}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{l["expires-after"] ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && filtered.length === 0 && <Empty message={selected ? "No DHCP leases found" : "Select a router first"} />}
        </CardContent>
      </Card>
    </div>
  );
}
