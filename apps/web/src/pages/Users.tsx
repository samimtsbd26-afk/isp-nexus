import { useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Plus, Trash2, Shield, User } from "lucide-react";
import { Card, CardContent, Button, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Empty, Modal, Input, Select } from "../components/ui/index";

const EMPTY: { name: string; email: string; password: string; role: "admin" | "reseller" | "viewer" } = { name: "", email: "", password: "", role: "admin" };

export default function Users() {
  const { data, refetch, isLoading } = trpc.auth.listUsers.useQuery();
  const { data: me } = trpc.auth.me.useQuery();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const create = trpc.auth.createUser.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(EMPTY); toast.success("User created"); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.auth.deleteUser.useMutation({
    onSuccess: () => { refetch(); toast.success("User deleted"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Admin Users</h1>
          <p className="text-muted-foreground text-sm">{data?.length ?? 0} users</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}><Plus size={14} /> Add User</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}
          {!isLoading && data && data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs font-bold">
                          {u.name[0].toUpperCase()}
                        </div>
                        <span className="font-medium text-sm">{u.name}</span>
                        {u.id === me?.id && <Badge variant="info">You</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      {(() => {
                        let v: "destructive" | "info" | "default" = "default";
                        if (u.role === "superadmin") v = "destructive";
                        else if (u.role === "admin") v = "info";
                        return (
                      <Badge variant={v}>
                        {u.role === "superadmin" ? <Shield size={11} className="inline mr-1" /> : <User size={11} className="inline mr-1" />}
                        {u.role}
                      </Badge>); })()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.isActive ? "success" : "destructive"}>{u.isActive ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}
                    </TableCell>
                    <TableCell>
                      {u.id !== me?.id && (
                        <Button variant="ghost" size="icon"
                          onClick={() => { if (globalThis.confirm(`Delete "${u.name}"?`)) del.mutate({ id: u.id }); }}>
                          <Trash2 size={14} className="text-muted-foreground hover:text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && !data?.length && <Empty message="No admin users found" />}
        </CardContent>
      </Card>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Admin User">
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(form); }} className="space-y-3">
          <div>
            <label htmlFor="u-name" className="block text-xs font-medium text-muted-foreground mb-1.5">Full Name</label>
            <Input id="u-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label htmlFor="u-email" className="block text-xs font-medium text-muted-foreground mb-1.5">Email</label>
            <Input id="u-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div>
            <label htmlFor="u-pass" className="block text-xs font-medium text-muted-foreground mb-1.5">Password</label>
            <Input id="u-pass" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </div>
          <div>
            <label htmlFor="u-role" className="block text-xs font-medium text-muted-foreground mb-1.5">Role</label>
            <Select id="u-role" title="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "reseller" | "viewer" })} className="w-full">
              <option value="admin">Admin</option>
              <option value="reseller">Reseller</option>
              <option value="viewer">Viewer</option>
            </Select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create User"}</Button>
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
