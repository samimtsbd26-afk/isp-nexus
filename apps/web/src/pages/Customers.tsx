import { useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Plus, Search, Eye, Trash2, Phone, Mail } from "lucide-react";
import { Card, CardContent, Button, Input, Modal, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Empty } from "../components/ui/index";
import { useNavigate } from "react-router";

const EMPTY = { fullName: "", phone: "", email: "", address: "", nid: "", notes: "" };

export default function Customers() {
  const navigate = useNavigate();
  const { data, refetch, isLoading } = trpc.customer.list.useQuery({ limit: 100 });
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState("");

  const create = trpc.customer.create.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(EMPTY); toast.success("Customer added"); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.customer.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Customer deleted"); },
  });

  const customers = (data ?? []).filter((c) =>
    !search || c.fullName.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );

  function field(key: keyof typeof form, label: string, id: string, required = false) {
    return (
      <div>
        <label htmlFor={id} className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
        <Input id={id} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required={required} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Customers</h1>
          <p className="text-muted-foreground text-sm">{customers.length} customers</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search name / phone…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-52" />
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)}><Plus size={14} /> Add Customer</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}
          {!isLoading && customers.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{c.customerCode}</TableCell>
                    <TableCell className="font-medium">{c.fullName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Phone size={12} /> {c.phone}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.email ? <div className="flex items-center gap-1.5"><Mail size={12} />{c.email}</div> : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.isActive ? "success" : "destructive"}>
                        {c.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString("en-BD")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => navigate(`/customers/${c.id}`)}>
                          <Eye size={14} />
                        </Button>
                        <Button variant="ghost" size="icon"
                          onClick={() => { if (globalThis.confirm(`Delete "${c.fullName}"?`)) del.mutate({ id: c.id }); }}>
                          <Trash2 size={14} className="text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && customers.length === 0 && <Empty message="No customers found" />}
        </CardContent>
      </Card>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Customer" className="max-w-lg">
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(form); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {field("fullName", "Full Name *", "c-name", true)}
            {field("phone", "Phone *", "c-phone", true)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field("email", "Email", "c-email")}
            {field("nid", "NID", "c-nid")}
          </div>
          {field("address", "Address", "c-addr")}
          {field("notes", "Notes", "c-notes")}
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1" disabled={create.isPending}>{create.isPending ? "Adding…" : "Add Customer"}</Button>
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
