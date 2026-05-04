import { useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Plus, RefreshCw, Trash2, UserCheck, UserX } from "lucide-react";
import { Card, CardContent, Button, Input, Modal, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Select, Empty } from "../components/ui/index";

const EMPTY = { name: "", password: "", profile: "default", service: "pppoe", comment: "" };

export default function PppoeUsers() {
  const { data: routers } = trpc.routerMgmt.list.useQuery();
  const [routerId, setRouterId] = useState("");
  const selected = routerId || routers?.[0]?.id || "";

  const { data: users, refetch, isLoading } = trpc.mikrotik.getPppoeUsers.useQuery({ routerId: selected }, { enabled: !!selected });
  const { data: active } = trpc.mikrotik.getActivePppoeSessions.useQuery({ routerId: selected }, { enabled: !!selected, refetchInterval: 15_000 });
  const { data: profiles } = trpc.mikrotik.getPppoeProfiles.useQuery({ routerId: selected }, { enabled: !!selected });

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState("");

  const add = trpc.mikrotik.addPppoeUser.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(EMPTY); toast.success("PPPoE user added"); },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.mikrotik.removePppoeUser.useMutation({
    onSuccess: () => { refetch(); toast.success("User removed"); },
    onError: (e) => toast.error(e.message),
  });

  const activeNames = new Set((active ?? []).map((a: any) => a.name));
  const filtered = (users ?? []).filter((u: any) =>
    !search || u.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">PPPoE Users</h1>
          <p className="text-muted-foreground text-sm">{active?.length ?? 0} online / {users?.length ?? 0} total</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select title="Select router" value={selected} onChange={(e) => setRouterId(e.target.value)} className="w-44">
            {routers?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-36" />
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={14} /></Button>
          <Button size="sm" onClick={() => setShowAdd(true)} disabled={!selected}><Plus size={14} /> Add</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>
          ) : filtered.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Profile</TableHead>
                  <TableHead>Remote IP</TableHead>
                  <TableHead>Comment</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u: any) => {
                  const online = activeNames.has(u.name);
                  return (
                    <TableRow key={u[".id"] ?? u.name}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {online
                            ? <UserCheck size={14} className="text-emerald-400" />
                            : <UserX size={14} className="text-muted-foreground" />}
                          <Badge variant={online ? "success" : "default"}>{online ? "Online" : "Offline"}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm font-medium">{u.name}</TableCell>
                      <TableCell><Badge variant="outline">{u.profile ?? "default"}</Badge></TableCell>
                      <TableCell className="text-muted-foreground text-sm font-mono">{u["remote-address"] ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-[180px] truncate">{u.comment ?? "—"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon"
                          onClick={() => { if (globalThis.confirm(`Delete "${u.name}"?`)) remove.mutate({ routerId: selected, name: u.name }); }}>
                          <Trash2 size={14} className="text-muted-foreground hover:text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Empty message={selected ? "No PPPoE users found" : "Select a router first"} />
          )}
        </CardContent>
      </Card>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add PPPoE User">
        <form onSubmit={(e) => { e.preventDefault(); add.mutate({ routerId: selected, ...form }); }} className="space-y-3">
          <div>
            <label htmlFor="pppoe-name" className="block text-xs font-medium text-muted-foreground mb-1.5">Username</label>
            <Input id="pppoe-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label htmlFor="pppoe-pass" className="block text-xs font-medium text-muted-foreground mb-1.5">Password</label>
            <Input id="pppoe-pass" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </div>
          <div>
            <label htmlFor="pppoe-profile" className="block text-xs font-medium text-muted-foreground mb-1.5">Profile</label>
            <Select id="pppoe-profile" title="Profile" value={form.profile} onChange={(e) => setForm({ ...form, profile: e.target.value })} className="w-full">
              {profiles?.length ? profiles.map((p: any) => <option key={p.name} value={p.name}>{p.name}</option>) : <option value="default">default</option>}
            </Select>
          </div>
          <div>
            <label htmlFor="pppoe-comment" className="block text-xs font-medium text-muted-foreground mb-1.5">Comment (optional)</label>
            <Input id="pppoe-comment" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1" disabled={add.isPending}>{add.isPending ? "Adding…" : "Add User"}</Button>
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
