import { useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { Card, CardContent, Button, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Select, Empty, Modal, Input } from "../components/ui/index";
import { formatBytes } from "../lib/utils";

const EMPTY = { interface: "wg0", publicKey: "", allowedAddress: "", endpointAddress: "", endpointPort: 51820, comment: "" };

export default function WireGuard() {
  const { data: routers } = trpc.routerMgmt.list.useQuery();
  const [routerId, setRouterId] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const selected = routerId || routers?.[0]?.id || "";

  const { data: peers, refetch, isLoading } = trpc.mikrotik.getWireguardPeers.useQuery(
    { routerId: selected }, { enabled: !!selected }
  );
  const add = trpc.mikrotik.addWireguardPeer.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(EMPTY); toast.success("Peer added"); },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.mikrotik.removeWireguardPeer.useMutation({
    onSuccess: () => { refetch(); toast.success("Peer removed"); },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">WireGuard VPN</h1>
          <p className="text-muted-foreground text-sm">{peers?.length ?? 0} peers — Starlink CGNAT bypass</p>
        </div>
        <div className="flex gap-2">
          <Select title="Router" value={selected} onChange={(e) => setRouterId(e.target.value)} className="w-44">
            {routers?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={14} /></Button>
          <Button size="sm" onClick={() => setShowAdd(true)} disabled={!selected}><Plus size={14} /> Add Peer</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}
          {!isLoading && peers && peers.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Interface</TableHead>
                  <TableHead>Public Key</TableHead>
                  <TableHead>Allowed IPs</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>RX / TX</TableHead>
                  <TableHead>Last Handshake</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {peers.map((p: any, i: number) => (
                  <TableRow key={p[".id"] ?? i}>
                    <TableCell><Badge variant="outline">{p.interface}</Badge></TableCell>
                    <TableCell className="font-mono text-xs max-w-[120px] truncate" title={p["public-key"]}>{p["public-key"]?.slice(0, 20)}…</TableCell>
                    <TableCell className="font-mono text-xs">{p["allowed-address"] ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{p["current-endpoint-address"] ? `${p["current-endpoint-address"]}:${p["current-endpoint-port"]}` : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatBytes(Number.parseInt(p.rx ?? "0", 10))} / {formatBytes(Number.parseInt(p.tx ?? "0", 10))}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p["last-handshake"] ?? "Never"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon"
                        onClick={() => { if (globalThis.confirm("Remove peer?")) remove.mutate({ routerId: selected, id: p[".id"] }); }}>
                        <Trash2 size={14} className="text-muted-foreground hover:text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && (!peers || peers.length === 0) && <Empty message={selected ? "No WireGuard peers configured" : "Select a router first"} />}
        </CardContent>
      </Card>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add WireGuard Peer">
        <form onSubmit={(e) => { e.preventDefault(); add.mutate({ routerId: selected, ...form, endpointPort: Number(form.endpointPort) }); }} className="space-y-3">
          {[
            { key: "publicKey", label: "Public Key", id: "wg-pk" },
            { key: "allowedAddress", label: "Allowed Address (e.g. 10.100.0.2/32)", id: "wg-allowed" },
            { key: "endpointAddress", label: "Endpoint Address (optional)", id: "wg-ep" },
            { key: "comment", label: "Comment", id: "wg-comment" },
          ].map(({ key, label, id }) => (
            <div key={key}>
              <label htmlFor={id} className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
              <Input id={id} value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1" disabled={add.isPending}>{add.isPending ? "Adding…" : "Add Peer"}</Button>
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
