import { useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Wifi, Network } from "lucide-react";
import { Card, CardContent, Button, Input, Modal, Badge, Empty } from "../components/ui/index";

const EMPTY = { name: "", type: "pppoe" as const, downloadMbps: 10, uploadMbps: 5, priceBdt: 0, validityDays: 30, mikrotikProfileName: "default", description: "", sortOrder: 0 };

export default function Packages() {
  const { data, refetch, isLoading } = trpc.package.listAll.useQuery();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const create = trpc.package.create.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(EMPTY); toast.success("Package created"); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.package.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Package deleted"); },
  });

  function n(key: keyof typeof form, label: string, id: string, type = "text") {
    return (
      <div>
        <label htmlFor={id} className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
        <Input id={id} type={type} value={(form as any)[key]}
          onChange={(e) => setForm({ ...form, [key]: type === "number" ? +e.target.value : e.target.value })} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Packages</h1>
          <p className="text-muted-foreground text-sm">Internet service plans</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}><Plus size={14} /> New Package</Button>
      </div>

      {isLoading && <div className="text-muted-foreground text-sm py-8 text-center">Loading…</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((pkg) => (
          <Card key={pkg.id} className={pkg.isActive ? "" : "opacity-60"}>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-base">{pkg.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={pkg.type === "pppoe" ? "info" : "success"}>
                      {pkg.type === "pppoe" ? <Network size={11} className="inline mr-1" /> : <Wifi size={11} className="inline mr-1" />}
                      {pkg.type}
                    </Badge>
                    {!pkg.isActive && <Badge variant="destructive">Inactive</Badge>}
                  </div>
                </div>
                <p className="text-2xl font-bold text-primary">৳{pkg.priceBdt.toLocaleString()}</p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "Download", value: `${pkg.downloadMbps}M` },
                  { label: "Upload", value: `${pkg.uploadMbps}M` },
                  { label: "Validity", value: `${pkg.validityDays}d` },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-secondary/50 rounded-lg p-2">
                    <p className="text-xs font-bold">{value}</p>
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>

              {pkg.description && <p className="text-xs text-muted-foreground">{pkg.description}</p>}

              <div className="flex gap-2 pt-1 border-t border-border">
                <p className="text-xs text-muted-foreground flex-1 my-auto">Profile: {pkg.mikrotikProfileName ?? "default"}</p>
                <Button variant="ghost" size="icon">
                  <Pencil size={13} />
                </Button>
                <Button variant="ghost" size="icon"
                  onClick={() => { if (globalThis.confirm(`Delete "${pkg.name}"?`)) del.mutate({ id: pkg.id }); }}>
                  <Trash2 size={13} className="text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && !data?.length && (
          <div className="col-span-3">
            <Card><CardContent className="py-16 text-center"><Empty message="No packages created yet" /></CardContent></Card>
          </div>
        )}
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Create Package" className="max-w-lg">
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(form as any); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {n("name", "Package Name *", "pk-name")}
            <div>
              <label htmlFor="pk-type" className="block text-xs font-medium text-muted-foreground mb-1.5">Type</label>
              <select id="pk-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none focus:ring-1 focus:ring-ring">
                <option value="pppoe">PPPoE</option>
                <option value="hotspot">Hotspot</option>
                <option value="static">Static</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {n("downloadMbps", "Download (Mbps)", "pk-dl", "number")}
            {n("uploadMbps", "Upload (Mbps)", "pk-ul", "number")}
            {n("priceBdt", "Price (BDT)", "pk-price", "number")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {n("validityDays", "Validity (days)", "pk-validity", "number")}
            {n("mikrotikProfileName", "MikroTik Profile", "pk-profile")}
          </div>
          {n("description", "Description", "pk-desc")}
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create Package"}</Button>
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
