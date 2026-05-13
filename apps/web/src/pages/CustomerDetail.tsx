import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import {
  ArrowLeft, Phone, Mail, MapPin, CreditCard, Server, Router, HardDrive,
  Wifi, Globe, Receipt, ShoppingCart, Activity, Zap, User, Shield, Smartphone,
} from "lucide-react";
import {
  Card, CardContent, CardHeader, CardTitle, Button, Badge,
  Tabs, TabsList, TabsTrigger, TabsContent, Table, TableHeader, TableBody,
  TableRow, TableHead, TableCell, Empty, Modal,
} from "../components/ui/index";

function statusVariant(s: string): "success" | "warning" | "destructive" | "default" {
  if (s === "active") return "success";
  if (s === "suspended") return "warning";
  if (s === "cancelled" || s === "expired") return "destructive";
  return "default";
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, refetch } = trpc.customer.get.useQuery({ id: id ?? "" }, { enabled: !!id });
  const [tab, setTab] = useState("overview");

  const [resetConfirm, setResetConfirm] = useState(false);

  const disconnectHotspot = trpc.mikrotik.forceDisconnectHotspot.useMutation({ onSuccess: () => refetch() });
  const disconnectPppoe = trpc.mikrotik.forceDisconnectPppoe.useMutation({ onSuccess: () => refetch() });
  const resetDevice = trpc.customer.resetDevice.useMutation({
    onSuccess: () => {
      setResetConfirm(false);
      refetch();
      toast.success("ডিভাইস রিসেট সম্পন্ন হয়েছে");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div className="py-20 text-center text-muted-foreground text-sm">Loading customer…</div>;
  if (!data) return <div className="py-20 text-center text-muted-foreground text-sm">Customer not found</div>;

  const {
    subscriptions,
    orders,
    payments,
    deviceBindings,
    activityLogs,
    liveHotspotSessions,
    livePppoeSessions,
    ...customer
  } = data as any;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/customers")}>
          <ArrowLeft size={18} />
        </Button>
        <div className="flex items-center gap-3">
          {customer.avatar ? (
            <img src={customer.avatar} alt="" className="w-10 h-10 rounded-full object-cover border border-border" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
              <User size={18} className="text-muted-foreground" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold">{customer.fullName}</h1>
            <p className="text-muted-foreground text-sm">{customer.customerCode} {customer.role && <Badge variant="outline" className="ml-2">{customer.role}</Badge>}</p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="orders">Orders & Payments</TabsTrigger>
          <TabsTrigger value="devices">Devices</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-1">
              <CardHeader><CardTitle>Contact Info</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[
                  { icon: Phone, label: "Phone", value: customer.phone },
                  { icon: Mail, label: "Email", value: customer.email ?? "—" },
                  { icon: MapPin, label: "Address", value: customer.address ?? "—" },
                  { icon: CreditCard, label: "NID", value: customer.nid ?? "—" },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-3">
                    <Icon size={14} className="text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-sm font-medium">{value}</p>
                    </div>
                  </div>
                ))}
                {customer.notes && (
                  <div className="pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm">{customer.notes}</p>
                  </div>
                )}
                {customer.permissions && Array.isArray(customer.permissions) && customer.permissions.length > 0 && (
                  <div className="pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-1">Permissions</p>
                    <div className="flex flex-wrap gap-1">
                      {customer.permissions.map((p: string) => (
                        <Badge key={p} variant="outline" className="text-[10px]"><Shield size={10} className="mr-1" />{p}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server size={16} /> Subscriptions ({subscriptions?.length ?? 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {subscriptions?.length ? (
                  <div className="space-y-3">
                    {subscriptions.map((s: any) => (
                      <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border">
                        <div>
                          <p className="font-mono text-sm font-semibold">{s.username}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.ipAddress ?? "Dynamic IP"}
                            {s.expiresAt ? ` · Expires ${new Date(s.expiresAt).toLocaleDateString()}` : ""}
                            {s.routerName ? ` · Router: ${s.routerName}` : ""}
                          </p>
                        </div>
                        <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm py-8 text-center">No subscriptions yet</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick Stats */}
          <div className="grid gap-3 sm:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Orders</p><p className="text-2xl font-bold">{orders?.length ?? 0}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Payments</p><p className="text-2xl font-bold">{payments?.length ?? 0}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Devices</p><p className="text-2xl font-bold">{deviceBindings?.length ?? 0}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Live Sessions</p><p className="text-2xl font-bold">{(liveHotspotSessions?.length ?? 0) + (livePppoeSessions?.length ?? 0)}</p></CardContent></Card>
          </div>
        </TabsContent>

        {/* Services Tab */}
        <TabsContent value="services">
          <div className="space-y-4">
            {/* Live Hotspot Sessions */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Wifi size={16} /> Live Hotspot Sessions</CardTitle></CardHeader>
              <CardContent className="p-0">
                {liveHotspotSessions?.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Username</TableHead><TableHead>IP</TableHead><TableHead>MAC</TableHead><TableHead>Uptime</TableHead><TableHead>Bytes</TableHead><TableHead className="w-24"></TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {liveHotspotSessions.map((s: any) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-sm">{s.name}</TableCell>
                          <TableCell className="text-xs font-mono">{s.ipAddress ?? "—"}</TableCell>
                          <TableCell className="text-xs font-mono">{s.macAddress ?? "—"}</TableCell>
                          <TableCell className="text-sm">{s.uptime ?? "—"}</TableCell>
                          <TableCell className="text-sm">{s.bytesIn ?? 0} / {s.bytesOut ?? 0}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => s.routerId && disconnectHotspot.mutate({ routerId: s.routerId, name: s.name })}>
                              <Zap size={12} className="mr-1" /> Kick
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : <Empty message="No active hotspot sessions" />}
              </CardContent>
            </Card>

            {/* Live PPPoE Sessions */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Globe size={16} /> Live PPPoE Sessions</CardTitle></CardHeader>
              <CardContent className="p-0">
                {livePppoeSessions?.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Username</TableHead><TableHead>IP</TableHead><TableHead>Caller ID</TableHead><TableHead>Uptime</TableHead><TableHead className="w-24"></TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {livePppoeSessions.map((s: any) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-sm">{s.name}</TableCell>
                          <TableCell className="text-xs font-mono">{s.remoteAddress ?? "—"}</TableCell>
                          <TableCell className="text-xs font-mono">{s.callerId ?? "—"}</TableCell>
                          <TableCell className="text-sm">{s.uptime ?? "—"}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => s.routerId && disconnectPppoe.mutate({ routerId: s.routerId, name: s.name })}>
                              <Zap size={12} className="mr-1" /> Kick
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : <Empty message="No active PPPoE sessions" />}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Orders & Payments Tab */}
        <TabsContent value="orders">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><ShoppingCart size={16} /> Orders History</CardTitle></CardHeader>
              <CardContent className="p-0">
                {orders?.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Status</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead><TableHead>Date</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((o: any) => (
                        <TableRow key={o.id}>
                          <TableCell><Badge variant={statusVariant(o.status)}>{o.status}</Badge></TableCell>
                          <TableCell className="text-sm font-medium">৳{o.amountBdt}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{o.paymentMethod ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleDateString("en-BD")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : <Empty message="No orders found" />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Receipt size={16} /> Payment History</CardTitle></CardHeader>
              <CardContent className="p-0">
                {payments?.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Invoice #</TableHead><TableHead>Amount</TableHead><TableHead>Tax</TableHead><TableHead>Total</TableHead><TableHead>Paid</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((inv: any) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                          <TableCell className="text-sm">৳{inv.amountBdt}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">৳{inv.taxBdt}</TableCell>
                          <TableCell className="text-sm font-medium">৳{inv.totalBdt}</TableCell>
                          <TableCell className="text-xs">{inv.paidAt ? new Date(inv.paidAt).toLocaleDateString("en-BD") : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : <Empty message="No payments found" />}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Devices Tab */}
        <TabsContent value="devices">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><HardDrive size={16} /> Device Bindings</CardTitle>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setResetConfirm(true)}
                className="gap-2"
              >
                <Smartphone size={14} /> Reset Device
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {deviceBindings?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>MAC Address</TableHead><TableHead>IP Address</TableHead><TableHead>Router</TableHead><TableHead>Description</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {deviceBindings.map((d: any) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs">{d.macAddress}</TableCell>
                        <TableCell className="font-mono text-xs">{d.ipAddress ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{d.routerId ?? "—"}</TableCell>
                        <TableCell className="text-sm">{d.description ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <Empty message="No device bindings found" />}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Activity size={16} /> Activity Logs</CardTitle></CardHeader>
            <CardContent className="p-0">
              {activityLogs?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Changes</TableHead><TableHead>Date</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {activityLogs.map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell><Badge variant="outline">{log.action}</Badge></TableCell>
                        <TableCell className="text-sm">{log.entityType} {log.entityId ? `· ${log.entityId.slice(0, 8)}` : ""}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{log.changes ? JSON.stringify(log.changes) : "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <Empty message="No activity logs" />}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="text-xs text-muted-foreground">
        Customer since: {new Date(customer.createdAt).toLocaleString()}
      </div>

      {/* Reset Device Confirmation */}
      <Modal
        open={resetConfirm}
        onClose={() => setResetConfirm(false)}
        title="ডিভাইস রিসেট করুন"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            এই ইউজারের ডিভাইস লগইন ডেটা রিসেট হবে। প্যাকেজ বা মেয়াদ পরিবর্তন হবে না।
          </p>
          <p className="text-sm text-muted-foreground">
            রিসেটের পর ইউজারকে আবার লগইন করতে হবে।
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setResetConfirm(false)}>
              বাতিল
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={resetDevice.isPending}
              onClick={() => id && resetDevice.mutate({ customerId: id })}
            >
              {resetDevice.isPending ? "রিসেট হচ্ছে…" : "হ্যাঁ, রিসেট করুন"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
