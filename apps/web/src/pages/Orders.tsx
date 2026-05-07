import { useState, useEffect } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { CheckCircle, XCircle, RefreshCw, AlertTriangle, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Empty, Modal, Input } from "../components/ui/index";
import { onEvent } from "../lib/socket";

function StatusBadge({ status }: Readonly<{ status: string }>) {
  const map: Record<string, "warning" | "success" | "destructive" | "default"> = {
    pending: "warning", approved: "success", rejected: "destructive", refunded: "default",
  };
  return <Badge variant={map[status] ?? "default"}>{status}</Badge>;
}

export default function Orders() {
  const { data: pending, refetch: refetchPending } = trpc.order.listPending.useQuery();
  const { data: all, refetch: refetchAll } = trpc.order.list.useQuery({ limit: 50 });
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [liveAlert, setLiveAlert] = useState<{ customerName: string; amountBdt: number; paymentMethod: string } | null>(null);

  // Real-time order notifications via WebSocket
  useEffect(() => {
    const offNew = onEvent("order:new", (data) => {
      setLiveAlert({ customerName: data.customerName, amountBdt: data.amountBdt, paymentMethod: data.paymentMethod });
      toast.info(`💳 New order: ${data.customerName} · ৳${data.amountBdt} via ${data.paymentMethod}`);
      void refetchPending();
      void refetchAll();
    });
    const offApproved = onEvent("order:approved", (data) => {
      toast.success(`✅ Order approved: ${data.customerName} · ৳${data.amountBdt}`);
      void refetchPending();
      void refetchAll();
    });
    return () => { offNew(); offApproved(); };
  }, [refetchPending, refetchAll]);

  const approve = trpc.order.approve.useMutation({
    onSuccess: () => { refetchPending(); refetchAll(); toast.success("Order approved — subscription activated"); },
    onError: (e) => toast.error(e.message),
  });
  const reject = trpc.order.reject.useMutation({
    onSuccess: () => { refetchPending(); refetchAll(); setNoteId(null); setNote(""); toast.success("Order rejected"); },
    onError: (e) => toast.error(e.message),
  });

  const orders = tab === "pending" ? (pending ?? []) : (all ?? []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Orders</h1>
          <p className="text-muted-foreground text-sm">{pending?.length ?? 0} pending approval</p>
        </div>
        <div className="flex gap-2">
          {["pending", "all"].map((t) => (
            <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t as any)}>
              {t === "pending" ? `Pending (${pending?.length ?? 0})` : "All Orders"}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={() => { refetchPending(); refetchAll(); }}>
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {/* Real-time new order flash */}
      {liveAlert && (
        <div className="flex items-center justify-between p-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 animate-pulse">
          <div className="flex items-center gap-2">
            <Zap size={15} className="text-cyan-400" />
            <span className="text-sm font-medium text-cyan-300">
              New order live: <strong>{liveAlert.customerName}</strong> · ৳{liveAlert.amountBdt} via {liveAlert.paymentMethod}
            </span>
          </div>
          <button type="button" onClick={() => setLiveAlert(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
        </div>
      )}

      {pending && pending.length > 0 && tab === "pending" && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-amber-400">
              <AlertTriangle size={16} /> {pending.length} Payment{pending.length > 1 ? "s" : ""} Awaiting Approval
            </CardTitle>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {orders.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Trx ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell><StatusBadge status={o.status} /></TableCell>
                    <TableCell className="text-sm">{o.customerId.slice(0, 8)}…</TableCell>
                    <TableCell className="font-semibold">৳{o.amountBdt.toLocaleString()}</TableCell>
                    <TableCell><Badge variant="outline">{o.paymentMethod ?? "—"}</Badge></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{o.trxId ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(o.createdAt).toLocaleDateString("en-BD")}
                    </TableCell>
                    <TableCell>
                      {o.status === "pending" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="text-emerald-400 hover:text-emerald-300"
                            disabled={approve.isPending}
                            onClick={() => approve.mutate({ id: o.id })}>
                            <CheckCircle size={14} />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300"
                            onClick={() => { setNoteId(o.id); setNote(""); }}>
                            <XCircle size={14} />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty message={tab === "pending" ? "No pending orders — great!" : "No orders found"} />
          )}
        </CardContent>
      </Card>

      <Modal open={!!noteId} onClose={() => setNoteId(null)} title="Reject Order">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Add a note explaining the rejection (optional):</p>
          <Input placeholder="e.g. Invalid transaction ID" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button variant="destructive" className="flex-1"
              disabled={reject.isPending}
              onClick={() => noteId && reject.mutate({ id: noteId, note: note || undefined })}>
              {reject.isPending ? "Rejecting…" : "Reject Order"}
            </Button>
            <Button variant="outline" onClick={() => setNoteId(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
