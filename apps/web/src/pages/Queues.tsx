import { useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { Card, CardContent, Button, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Select, Empty, Modal, Input } from "../components/ui/index";

const EMPTY = { name: "", target: "", maxLimit: "10M/10M", comment: "" };

export default function Queues() {
  const { data: routers } = trpc.routerMgmt.list.useQuery();
  const [routerId, setRouterId] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const selected = routerId || routers?.[0]?.id || "";

  const { data: queues, refetch, isLoading } = trpc.mikrotik.getQueues.useQuery(
    { routerId: selected }, { enabled: !!selected }
  );
  const add = trpc.mikrotik.addQueue.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(EMPTY); toast.success("Queue added"); },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.mikrotik.removeQueue.useMutation({
    onSuccess: () => { refetch(); toast.success("Queue removed"); },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Simple Queues</h1>
          <p className="text-muted-foreground text-sm">{queues?.length ?? 0} queues</p>
        </div>
        <div className="flex gap-2">
          <Select title="Router" value={selected} onChange={(e) => setRouterId(e.target.value)} className="w-44">
            {routers?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={14} /></Button>
          <Button size="sm" onClick={() => setShowAdd(true)} disabled={!selected}><Plus size={14} /> Add</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading queues…</div>}
          {!isLoading && queues && queues.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Max Limit</TableHead>
                  <TableHead>Bytes (RX/TX)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queues.map((q: any) => (
                  <TableRow key={q[".id"]}>
                    <TableCell className="font-medium text-sm">{q.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{q.target}</TableCell>
                    <TableCell><Badge variant="outline">{q["max-limit"] ?? "—"}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{q.bytes ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={q.disabled === "true" ? "destructive" : "success"}>
                        {q.disabled === "true" ? "Disabled" : "Active"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon"
                        onClick={() => { if (globalThis.confirm(`Remove queue "${q.name}"?`)) remove.mutate({ routerId: selected, id: q[".id"] }); }}>
                        <Trash2 size={14} className="text-muted-foreground hover:text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && (!queues || queues.length === 0) && <Empty message={selected ? "No queues found" : "Select a router first"} />}
        </CardContent>
      </Card>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Simple Queue">
        <form onSubmit={(e) => { e.preventDefault(); add.mutate({ routerId: selected, ...form }); }} className="space-y-3">
          <div>
            <label htmlFor="q-name" className="block text-xs font-medium text-muted-foreground mb-1.5">Queue Name *</label>
            <Input id="q-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Customer-01" required />
          </div>
          <div>
            <label htmlFor="q-target" className="block text-xs font-medium text-muted-foreground mb-1.5">Target IP *</label>
            <Input id="q-target" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="e.g. 192.168.1.100" required />
          </div>
          <div>
            <label htmlFor="q-limit" className="block text-xs font-medium text-muted-foreground mb-1.5">Max Limit (download/upload)</label>
            <Input id="q-limit" value={form.maxLimit} onChange={(e) => setForm({ ...form, maxLimit: e.target.value })} placeholder="e.g. 10M/5M" />
          </div>
          <div>
            <label htmlFor="q-comment" className="block text-xs font-medium text-muted-foreground mb-1.5">Comment</label>
            <Input id="q-comment" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1" disabled={add.isPending}>{add.isPending ? "Adding…" : "Add Queue"}</Button>
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
