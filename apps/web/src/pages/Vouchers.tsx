import { useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Plus, RefreshCw, Ban } from "lucide-react";
import { Card, CardContent, Button, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Empty, Modal, Input, Select } from "../components/ui/index";

const EMPTY = { routerId: "", packageId: "", batchName: "", count: 10, profile: "default", sharedUsers: 1, price: 0 };

function voucherVariant(s: string): "success" | "default" | "destructive" | "warning" {
  if (s === "unused") return "success";
  if (s === "used") return "default";
  if (s === "revoked") return "destructive";
  return "warning";
}

export default function Vouchers() {
  const { data: routers } = trpc.routerMgmt.list.useQuery();
  const { data, refetch, isLoading } = trpc.voucher.list.useQuery({});
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const createBatch = trpc.voucher.createBatch.useMutation({
    onSuccess: (d) => { refetch(); setShowCreate(false); setForm(EMPTY); toast.success(`${d.count} vouchers created`); },
    onError: (e) => toast.error(e.message),
  });
  const revoke = trpc.voucher.revoke.useMutation({
    onSuccess: () => { refetch(); toast.success("Voucher revoked"); },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Vouchers</h1>
          <p className="text-muted-foreground text-sm">{data?.length ?? 0} total</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={14} /></Button>
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus size={14} /> Create Batch</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}
          {!isLoading && data && data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Profile</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-sm font-bold">{v.code}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{v.batchName ?? "—"}</TableCell>
                    <TableCell><Badge variant={voucherVariant(v.status)}>{v.status}</Badge></TableCell>
                    <TableCell className="text-sm">{v.profile ?? "—"}</TableCell>
                    <TableCell>{v.price ? `৳${v.price}` : "Free"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(v.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {v.status === "unused" && (
                        <Button variant="ghost" size="icon" title="Revoke"
                          onClick={() => { if (globalThis.confirm("Revoke voucher?")) revoke.mutate({ id: v.id }); }}>
                          <Ban size={14} className="text-muted-foreground hover:text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && !data?.length && <Empty message="No vouchers — create a batch first" />}
        </CardContent>
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Voucher Batch" className="max-w-lg">
        <form onSubmit={(e) => {
          e.preventDefault();
          if (!form.routerId) { toast.error("Select a router"); return; }
          createBatch.mutate({ ...form, count: Number(form.count), sharedUsers: Number(form.sharedUsers), price: Number(form.price) });
        }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="v-router" className="block text-xs font-medium text-muted-foreground mb-1.5">Router *</label>
              <Select id="v-router" title="Router" value={form.routerId} onChange={(e) => setForm({ ...form, routerId: e.target.value })} className="w-full" required>
                <option value="">Select router…</option>
                {routers?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </div>
            <div>
              <label htmlFor="v-batch" className="block text-xs font-medium text-muted-foreground mb-1.5">Batch Name *</label>
              <Input id="v-batch" value={form.batchName} onChange={(e) => setForm({ ...form, batchName: e.target.value })} required />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="v-count" className="block text-xs font-medium text-muted-foreground mb-1.5">Count</label>
              <Input id="v-count" type="number" min="1" max="500" value={form.count} onChange={(e) => setForm({ ...form, count: +e.target.value })} />
            </div>
            <div>
              <label htmlFor="v-profile" className="block text-xs font-medium text-muted-foreground mb-1.5">Profile</label>
              <Input id="v-profile" value={form.profile} onChange={(e) => setForm({ ...form, profile: e.target.value })} />
            </div>
            <div>
              <label htmlFor="v-price" className="block text-xs font-medium text-muted-foreground mb-1.5">Price (BDT)</label>
              <Input id="v-price" type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: +e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1" disabled={createBatch.isPending}>{createBatch.isPending ? "Creating…" : `Create ${form.count} Vouchers`}</Button>
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
