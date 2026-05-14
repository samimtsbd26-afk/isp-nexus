import { useState, useEffect } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { CheckCircle, XCircle, RefreshCw, AlertTriangle, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Button, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Empty, Modal, Input, OrderStatusBadge, PaymentMethodBadge } from "../components/ui/index";
import { onEvent } from "../lib/socket";


function OrderSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3 items-center">
          <div className="h-6 w-16 bg-muted rounded animate-pulse" />
          <div className="h-6 w-24 bg-muted rounded animate-pulse" />
          <div className="h-6 w-20 bg-muted rounded animate-pulse" />
          <div className="h-6 w-16 bg-muted rounded animate-pulse" />
          <div className="h-6 w-28 bg-muted rounded animate-pulse" />
          <div className="h-6 w-20 bg-muted rounded animate-pulse" />
          <div className="h-6 w-16 bg-muted rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export default function Orders() {
  const { data: pending, refetch: refetchPending, isLoading: pendingLoading, error: pendingError } = trpc.order.listPending.useQuery();
  const { data: all, refetch: refetchAll, isLoading: allLoading, error: allError } = trpc.order.list.useQuery({ limit: 50 });
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
  const isLoading = tab === "pending" ? pendingLoading : allLoading;
  const error = tab === "pending" ? pendingError : allError;

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
          {/* Loading state */}
          {isLoading && <OrderSkeleton />}

          {/* Error state */}
          {!isLoading && error && (
            <div className="p-8 text-center space-y-3">
              <AlertTriangle size={32} className="text-destructive mx-auto" />
              <p className="text-sm text-muted-foreground">Failed to load orders</p>
              <p className="text-xs text-muted-foreground">{error.message}</p>
              <Button size="sm" variant="outline" onClick={() => { refetchPending(); refetchAll(); }}>
                <RefreshCw size={14} className="mr-1" /> Retry
              </Button>
            </div>
          )}

          {/* Data state */}
          {!isLoading && !error && orders.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Sender</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Trx ID</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-44">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell><OrderStatusBadge status={o.status} /></TableCell>
                      <TableCell className="font-mono text-xs">{o.paymentFrom ?? "—"}</TableCell>
                      <TableCell><PaymentMethodBadge method={o.paymentMethod} /></TableCell>
                      <TableCell className="font-semibold">৳{o.amountBdt?.toLocaleString() ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{o.trxId ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {o.createdAt ? new Date(o.createdAt).toLocaleDateString("en-BD") : "—"}
                      </TableCell>
                      <TableCell>
                        {o.status === "pending" && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="text-emerald-400 hover:text-emerald-300 text-xs"
                              disabled={approve.isPending}
                              onClick={() => approve.mutate({ id: o.id })}>
                              <CheckCircle size={12} className="mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 text-xs"
                              onClick={() => { setNoteId(o.id); setNote(""); }}>
                              <XCircle size={12} className="mr-1" /> Reject
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            !isLoading && !error && <Empty message={tab === "pending" ? "No pending orders — great!" : "No orders found"} />
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
