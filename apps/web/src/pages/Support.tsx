import { useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { MessageSquare, Send } from "lucide-react";
import { Card, CardContent, Button, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Empty, Modal, Input } from "../components/ui/index";

function TicketBadge({ status }: Readonly<{ status: string }>) {
  const map: Record<string, "warning" | "info" | "success" | "destructive" | "default"> = {
    open: "warning", in_progress: "info", resolved: "success", closed: "default",
  };
  return <Badge variant={map[status] ?? "default"}>{status.replace("_", " ")}</Badge>;
}

export default function Support() {
  const { data: tickets, refetch, isLoading } = trpc.support.listTickets.useQuery({});
  const [selected, setSelected] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  const { data: ticket } = trpc.support.getTicket.useQuery(
    { id: selected ?? "" }, { enabled: !!selected }
  );
  const close = trpc.support.closeTicket.useMutation({
    onSuccess: () => { refetch(); toast.success("Ticket closed"); },
  });
  const send = trpc.support.sendMessage.useMutation({
    onSuccess: () => { setReply(""); refetch(); toast.success("Reply sent"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Support Tickets</h1>
        <p className="text-muted-foreground text-sm">{tickets?.length ?? 0} tickets</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}
          {!isLoading && tickets && tickets.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell><TicketBadge status={t.status} /></TableCell>
                    <TableCell className="font-medium">{t.subject}</TableCell>
                    <TableCell>
                      {(() => {
                        let v: "destructive" | "warning" | "default" = "default";
                        if (t.priority === "urgent") v = "destructive";
                        else if (t.priority === "high") v = "warning";
                        return <Badge variant={v}>{t.priority}</Badge>;
                      })()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setSelected(t.id)}>
                          <MessageSquare size={13} />
                        </Button>
                        {t.status !== "closed" && (
                          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-emerald-400"
                            onClick={() => close.mutate({ id: t.id })}>Close</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && (!tickets || tickets.length === 0) && <Empty message="No support tickets" />}
        </CardContent>
      </Card>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={ticket?.subject ?? "Ticket"} className="max-w-lg">
        <div className="space-y-4">
          {ticket?.messages.map((m) => (
            <div key={m.id} className={`p-3 rounded-lg text-sm ${m.senderType === "admin" ? "bg-blue-500/10 border border-blue-500/20 ml-8" : "bg-secondary/50 mr-8"}`}>
              <p className="text-xs text-muted-foreground mb-1 font-medium">{m.senderType === "admin" ? "You (Admin)" : "Customer"}</p>
              <p>{m.message}</p>
            </div>
          ))}
          <div className="flex gap-2 pt-2 border-t border-border">
            <Input placeholder="Type reply…" value={reply} onChange={(e) => setReply(e.target.value)} className="flex-1"
              onKeyDown={(e) => { if (e.key === "Enter" && reply.trim() && selected) send.mutate({ ticketId: selected, message: reply, senderType: "admin" }); }} />
            <Button size="sm" disabled={!reply.trim() || send.isPending}
              onClick={() => selected && reply.trim() && send.mutate({ ticketId: selected, message: reply, senderType: "admin" })}>
              <Send size={14} />
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
