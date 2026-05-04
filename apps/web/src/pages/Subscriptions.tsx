import { trpc } from "../lib/trpc";

function statusVariant(s: string): "success" | "warning" | "destructive" | "default" {
  if (s === "active") return "success";
  if (s === "suspended") return "warning";
  if (s === "cancelled") return "destructive";
  return "default";
}
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Card, CardContent, Button, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Empty } from "../components/ui/index";

export default function Subscriptions() {
  const { data, refetch, isLoading } = trpc.subscription.list.useQuery({});

  const suspend = trpc.subscription.suspend.useMutation({ onSuccess: () => { refetch(); toast.success("Suspended"); } });
  const reactivate = trpc.subscription.reactivate.useMutation({ onSuccess: () => { refetch(); toast.success("Reactivated"); } });
  const cancel = trpc.subscription.cancel.useMutation({ onSuccess: () => { refetch(); toast.success("Cancelled"); } });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Subscriptions</h1>
          <p className="text-muted-foreground text-sm">{data?.length ?? 0} total</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={14} /></Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}
          {!isLoading && data && data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-sm font-medium">{s.username}</TableCell>
                    <TableCell><Badge variant={statusVariant(s.status)}>{s.status}</Badge></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.ipAddress ?? "Dynamic"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.startedAt ? new Date(s.startedAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.expiresAt ? new Date(s.expiresAt).toLocaleDateString() : "∞"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {s.status === "active" && (
                          <Button size="sm" variant="outline" className="text-amber-400 border-amber-500/30 hover:bg-amber-500/10 text-xs h-7"
                            onClick={() => suspend.mutate({ id: s.id })}>Suspend</Button>
                        )}
                        {s.status === "suspended" && (
                          <Button size="sm" variant="outline" className="text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 text-xs h-7"
                            onClick={() => reactivate.mutate({ id: s.id })}>Reactivate</Button>
                        )}
                        {s.status !== "cancelled" && (
                          <Button size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10 text-xs h-7"
                            onClick={() => { if (globalThis.confirm("Cancel subscription?")) cancel.mutate({ id: s.id }); }}>
                            Cancel
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && !data?.length && <Empty message="No subscriptions found" />}
        </CardContent>
      </Card>
    </div>
  );
}
