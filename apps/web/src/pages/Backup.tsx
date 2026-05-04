import { useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { HardDrive, FileCode, Trash2, Download, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Button, Select, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Empty, Modal, Input } from "../components/ui/index";

export default function Backup() {
  const { data: routers } = trpc.routerMgmt.list.useQuery();
  const [routerId, setRouterId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [backupType, setBackupType] = useState<"backup" | "export">("export");
  const [description, setDescription] = useState("");
  const selected = routerId || routers?.[0]?.id || "";

  const { data: backups, refetch, isLoading } = trpc.backup.list.useQuery(
    { routerId: selected || undefined },
    { enabled: true },
  );

  const create = trpc.backup.create.useMutation({
    onSuccess: () => { refetch(); setShowCreate(false); setDescription(""); toast.success("Backup created successfully"); },
    onError: (e) => toast.error(e.message),
  });

  const del = trpc.backup.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Backup deleted"); },
    onError: (e) => toast.error(e.message),
  });

  function downloadContent(id: string, filename: string) {
    // Fetch content and trigger browser download
    void (async () => {
      try {
        const input = encodeURIComponent(JSON.stringify({ json: { id } }));
        const result = await fetch(`/api/trpc/backup.getContent?input=${input}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("isp_access_token")}` },
        });
        const json = await result.json();
        const content = json?.result?.data?.json?.configData;
        if (!content) { toast.error("No content to download"); return; }
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } catch { toast.error("Download failed"); }
    })();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Backup & Restore</h1>
          <p className="text-muted-foreground text-sm">MikroTik router configuration backups</p>
        </div>
        <div className="flex gap-2">
          <Select title="Router" value={selected} onChange={(e) => setRouterId(e.target.value)} className="w-44">
            <option value="">All Routers</option>
            {routers?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={14} /></Button>
          <Button size="sm" onClick={() => setShowCreate(true)} disabled={!selected}>
            <HardDrive size={14} /> Create Backup
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="p-3 rounded-xl bg-blue-500/10">
              <HardDrive size={24} className="text-blue-400" />
            </div>
            <div>
              <p className="font-semibold">Binary Backup</p>
              <p className="text-sm text-muted-foreground">Complete router backup (.backup file)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="p-3 rounded-xl bg-emerald-500/10">
              <FileCode size={24} className="text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold">Export Script</p>
              <p className="text-sm text-muted-foreground">Human-readable RSC export file</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Saved Backups ({backups?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}
          {!isLoading && backups && backups.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{b.name}</div>
                      {b.fileName && <div className="text-xs text-muted-foreground">{b.fileName}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={b.backupType === "export" ? "info" : "default"}>
                        {b.backupType === "export" ? <FileCode size={11} className="inline mr-1" /> : <HardDrive size={11} className="inline mr-1" />}
                        {b.backupType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {b.fileSize ? `${(b.fileSize / 1024).toFixed(1)} KB` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(b.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {b.backupType === "export" && (
                          <Button variant="ghost" size="icon" title="Download"
                            onClick={() => downloadContent(b.id, b.fileName ?? `${b.name}.rsc`)}>
                            <Download size={14} className="text-muted-foreground" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon"
                          onClick={() => { if (globalThis.confirm("Delete this backup?")) del.mutate({ id: b.id }); }}>
                          <Trash2 size={14} className="text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && (!backups || backups.length === 0) && (
            <Empty message="No backups saved yet — create your first backup" />
          )}
        </CardContent>
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Router Backup">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Router</label>
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-sm font-medium">{routers?.find((r) => r.id === selected)?.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{routers?.find((r) => r.id === selected)?.host}</p>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Backup Type</label>
            <Select title="Type" value={backupType} onChange={(e) => setBackupType(e.target.value as "backup" | "export")} className="w-full">
              <option value="export">Export Script (.rsc) — downloadable text</option>
              <option value="backup">Binary Backup (.backup) — full backup</option>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description (optional)</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Before firmware upgrade" />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={create.isPending || !selected}
              onClick={() => create.mutate({ routerId: selected, type: backupType, description: description || undefined })}>
              {create.isPending ? "Creating…" : "Create Backup"}
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
