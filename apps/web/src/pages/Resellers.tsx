import { useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import {
  Users, Plus, RefreshCw, Wallet, TrendingUp, Trash2,
  ChevronDown, ChevronRight, UserCheck, Percent, Edit2,
} from "lucide-react";
import {
  Card, CardContent, CardHeader, CardTitle,
  Button, Badge, Table, TableHeader, TableBody,
  TableRow, TableHead, TableCell, Empty, Modal, Input,
} from "../components/ui/index";

export default function Resellers() {
  const { data: list, refetch, isLoading } = trpc.reseller.list.useQuery();
  const { data: allUsers } = trpc.reseller.listUsers.useQuery();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showPay, setShowPay] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ userId: "", commissionPct: 10, notes: "" });
  const [editComm, setEditComm] = useState(0);

  const create = trpc.reseller.create.useMutation({
    onSuccess: () => { refetch(); setShowCreate(false); setForm({ userId: "", commissionPct: 10, notes: "" }); toast.success("Reseller created"); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.reseller.update.useMutation({
    onSuccess: () => { refetch(); setEditId(null); toast.success("Reseller updated"); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.reseller.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Reseller removed"); },
    onError: (e) => toast.error(e.message),
  });
  const pay = trpc.reseller.payCommissions.useMutation({
    onSuccess: (d) => { refetch(); setShowPay(null); toast.success(`Paid ৳${d.totalBdt} to wallet (${d.paid} commissions)`); },
    onError: (e) => toast.error(e.message),
  });

  const totalWallet = list?.reduce((s, r) => s + r.walletBalanceBdt, 0) ?? 0;
  const totalPending = list?.reduce((s, r) => s + r.pendingCommissionBdt, 0) ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Resellers</h1>
          <p className="text-muted-foreground text-sm">Commission-based sub-agents for your ISP</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={14} /></Button>
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus size={14} /> Add Reseller</Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Resellers</p><p className="text-2xl font-bold">{list?.length ?? 0}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Active</p><p className="text-2xl font-bold text-emerald-600">{list?.filter(r => r.isActive).length ?? 0}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Wallet Total</p><p className="text-2xl font-bold">৳{totalWallet.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Pending Commission</p><p className="text-2xl font-bold text-amber-600">৳{totalPending.toLocaleString()}</p></CardContent></Card>
      </div>

      {/* Reseller list */}
      <Card>
        <CardContent className="p-0">
          {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}
          {!isLoading && (!list || list.length === 0) && <Empty message="No resellers — add your first reseller" />}
          {!isLoading && list && list.length > 0 && (
            <div className="divide-y divide-border">
              {list.map((r) => (
                <div key={r.id}>
                  {/* Row */}
                  <div className="flex items-center gap-3 px-5 py-4">
                    <button type="button" onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                      className="text-muted-foreground hover:text-foreground transition-colors">
                      {expanded === r.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>

                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                      {r.userName?.[0]?.toUpperCase() ?? "R"}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{r.userName}</p>
                      <p className="text-xs text-muted-foreground">{r.userEmail}</p>
                    </div>

                    <div className="hidden sm:flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Percent size={12} />
                        <span>{r.commissionPct}%</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Users size={12} />
                        <span>{r.customerCount} customers</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Wallet size={12} />
                        <span>৳{r.walletBalanceBdt.toLocaleString()}</span>
                      </div>
                    </div>

                    {r.pendingCommissionBdt > 0 && (
                      <Badge variant="warning">৳{r.pendingCommissionBdt.toLocaleString()} pending</Badge>
                    )}
                    <Badge variant={r.isActive ? "success" : "default"}>{r.isActive ? "Active" : "Inactive"}</Badge>

                    <div className="flex gap-1 shrink-0">
                      {r.pendingCommissionBdt > 0 && (
                        <Button variant="outline" size="sm" onClick={() => setShowPay(r.id)}>
                          <Wallet size={13} /> Pay
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" title="Edit"
                        onClick={() => { setEditId(r.id); setEditComm(r.commissionPct); }}>
                        <Edit2 size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" title="Remove"
                        onClick={() => { if (confirm(`Remove reseller ${r.userName}?`)) del.mutate({ id: r.id }); }}>
                        <Trash2 size={14} className="text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded: analytics */}
                  {expanded === r.id && <ResellerDetails resellerId={r.id} />}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Reseller">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">User</label>
            <select
              value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value })}
              className="w-full border border-input rounded-md h-9 px-3 text-sm bg-background"
            >
              <option value="">Select a user…</option>
              {allUsers?.filter(u => u.role !== "reseller").map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Commission % (on approved orders)</label>
            <Input type="number" min="0" max="100" value={form.commissionPct}
              onChange={(e) => setForm({ ...form, commissionPct: +e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Notes (optional)</label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={create.isPending || !form.userId}
              onClick={() => create.mutate({ userId: form.userId, commissionPct: form.commissionPct, notes: form.notes || undefined })}>
              {create.isPending ? "Creating…" : "Create Reseller"}
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Edit commission modal */}
      {editId && (
        <Modal open={!!editId} onClose={() => setEditId(null)} title="Edit Commission">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Commission %</label>
              <Input type="number" min="0" max="100" value={editComm}
                onChange={(e) => setEditComm(+e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={update.isPending}
                onClick={() => update.mutate({ id: editId, commissionPct: editComm })}>
                {update.isPending ? "Saving…" : "Save"}
              </Button>
              <Button variant="outline" onClick={() => setEditId(null)}>Cancel</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Pay commissions modal */}
      {showPay && (
        <Modal open={!!showPay} onClose={() => setShowPay(null)} title="Pay Commissions">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              All pending commissions will be marked as paid and added to the reseller's wallet.
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={pay.isPending}
                onClick={() => pay.mutate({ resellerId: showPay })}>
                {pay.isPending ? "Processing…" : "Pay Now"}
              </Button>
              <Button variant="outline" onClick={() => setShowPay(null)}>Cancel</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ResellerDetails({ resellerId }: { resellerId: string }) {
  const { data } = trpc.reseller.analytics.useQuery({ resellerId });
  const { data: customers } = trpc.reseller.getCustomers.useQuery({ resellerId });

  if (!data) return <div className="px-14 pb-4 text-xs text-muted-foreground">Loading…</div>;

  return (
    <div className="px-14 pb-5 space-y-4 bg-muted/30">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
        {[
          { label: "Monthly Revenue", value: `৳${data.monthlyRevenueBdt.toLocaleString()}`, color: "" },
          { label: "Total Revenue", value: `৳${data.totalRevenueBdt.toLocaleString()}`, color: "" },
          { label: "Total Earned", value: `৳${data.totalEarnedBdt.toLocaleString()}`, color: "text-emerald-600" },
          { label: "Wallet", value: `৳${data.walletBalanceBdt.toLocaleString()}`, color: "text-blue-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-background rounded-lg p-3 border border-border">
            <p className="text-[10px] text-muted-foreground">{label}</p>
            <p className={`text-base font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {customers && customers.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2">Assigned Customers ({customers.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {customers.slice(0, 20).map((c) => (
              <span key={c.id} className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
                {c.fullName} ({c.phone})
              </span>
            ))}
            {customers.length > 20 && <span className="text-xs text-muted-foreground">+{customers.length - 20} more</span>}
          </div>
        </div>
      )}
    </div>
  );
}
