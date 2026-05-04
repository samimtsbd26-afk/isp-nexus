import { useState } from "react";
import { trpc } from "../lib/trpc";
import { ScrollText, User, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Select, Empty } from "../components/ui/index";

const ENTITY_TYPES = ["", "customer", "subscription", "order", "invoice", "router", "user", "package", "voucher"];

const ACTION_COLORS: Record<string, "success" | "destructive" | "info" | "default"> = {
  create: "success",
  delete: "destructive",
  update: "info",
  approve: "success",
  reject: "destructive",
  suspend: "destructive",
  reactivate: "success",
  login: "default",
  logout: "default",
};

export default function Activity() {
  const [entityType, setEntityType] = useState("");

  const { data, isLoading } = trpc.activity.list.useQuery({
    limit: 200,
    entityType: entityType || undefined,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Activity Log</h1>
          <p className="text-muted-foreground text-sm">Full audit trail of all actions</p>
        </div>
        <Select title="Entity Type" value={entityType} onChange={(e) => setEntityType(e.target.value)} className="w-44">
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>{t || "All Types"}</option>
          ))}
        </Select>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent Activity ({data?.length ?? 0})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}
          {!isLoading && data && data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((entry) => (
                  <ActivityRow key={entry.id} entry={entry} />
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && (!data || data.length === 0) && (
            <Empty message="No activity recorded yet" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ActivityRow({ entry }: Readonly<{ entry: any }>) {
  const [expanded, setExpanded] = useState(false);
  const actionKey = entry.action?.split("_")[0] ?? "";
  const variant = ACTION_COLORS[actionKey] ?? "default";

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <TableCell>
          <Badge variant={variant}>{entry.action}</Badge>
        </TableCell>
        <TableCell>
          {entry.entityType && (
            <div>
              <span className="text-xs font-medium capitalize">{entry.entityType}</span>
              {entry.entityId && <span className="text-xs text-muted-foreground ml-1">#{entry.entityId.slice(0, 8)}</span>}
            </div>
          )}
        </TableCell>
        <TableCell>
          {entry.userId ? (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center">
                <User size={10} className="text-muted-foreground" />
              </div>
              <span className="text-xs text-muted-foreground">{entry.userId.slice(0, 8)}</span>
            </div>
          ) : <span className="text-xs text-muted-foreground">System</span>}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground font-mono">{entry.ipAddress ?? "—"}</TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {new Date(entry.createdAt).toLocaleString()}
        </TableCell>
        <TableCell>
          {entry.changes && <ChevronDown size={14} className={`text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />}
        </TableCell>
      </TableRow>
      {expanded && entry.changes && (
        <TableRow>
          <TableCell colSpan={6} className="bg-secondary/20">
            <pre className="text-xs text-muted-foreground overflow-x-auto p-2 rounded">
              {JSON.stringify(entry.changes, null, 2)}
            </pre>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
