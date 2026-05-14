import { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@isp-nexus/api/router";
import type { PackageType } from "@isp-nexus/shared";
import { formatPackageDurationShort } from "@isp-nexus/shared";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Wifi, Network } from "lucide-react";
import { Card, CardContent, Button, Input, Modal, Badge, Empty, Dropdown } from "../components/ui/index";

type ListedPackage = inferRouterOutputs<AppRouter>["package"]["listAll"][number];

type PackageForm = {
  name: string;
  type: PackageType;
  downloadMbps: number;
  uploadMbps: number;
  priceBdt: number;
  durationValue: number;
  durationUnit: "hour" | "day";
  mikrotikProfileName: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
};

const EMPTY: PackageForm = {
  name: "", type: "pppoe", downloadMbps: 10, uploadMbps: 5, priceBdt: 0, durationValue: 30, durationUnit: "day",
  mikrotikProfileName: "default", description: "", sortOrder: 0, isActive: true,
};

function pkgToForm(pkg: ListedPackage): PackageForm {
  return {
    name: pkg.name,
    type: pkg.type,
    downloadMbps: pkg.downloadMbps,
    uploadMbps: pkg.uploadMbps,
    priceBdt: pkg.priceBdt,
    durationValue: pkg.durationValue ?? pkg.validityDays,
    durationUnit: pkg.durationUnit === "hour" ? "hour" : "day",
    mikrotikProfileName: pkg.mikrotikProfileName ?? "default",
    description: pkg.description ?? "",
    sortOrder: pkg.sortOrder ?? 0,
    isActive: pkg.isActive,
  };
}

function deviceLimit(features: unknown) {
  const items = Array.isArray(features) ? features.map(String) : [];
  const feature = items.find((item) => /^devices:/i.test(item) || /\bdevices?\b/i.test(item));
  const match = feature?.match(/(\d+)/);
  return Math.max(1, Number(match?.[1] ?? 1));
}

export default function Packages() {
  const { data, refetch, isLoading } = trpc.package.listAll.useQuery();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);

  const create = trpc.package.create.useMutation({
    onSuccess: () => { refetch(); closeModal(); toast.success("Package created"); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.package.update.useMutation({
    onSuccess: () => { refetch(); closeModal(); toast.success("Package updated"); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.package.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Package deleted"); },
  });

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setForm(EMPTY);
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setShowModal(true);
  }

  function openEdit(pkg: ListedPackage) {
    setEditingId(pkg.id);
    setForm(pkgToForm(pkg));
    setShowModal(true);
  }

  function n(key: keyof PackageForm, label: string, id: string, type = "text") {
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
        <Button size="sm" onClick={openCreate}><Plus size={14} /> New Package</Button>
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

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                {[
                  { label: "Speed", value: `${pkg.downloadMbps}M/${pkg.uploadMbps}M` },
                  { label: "Devices", value: `${deviceLimit(pkg.features)}` },
                  { label: "Duration", value: formatPackageDurationShort(pkg) },
                  { label: "Profile", value: pkg.mikrotikProfileName ?? "default" },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg border border-border bg-muted/60 p-2">
                    <p className="text-xs font-bold truncate">{value}</p>
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>

              {pkg.description && <p className="text-xs text-muted-foreground">{pkg.description}</p>}

              <div className="flex gap-2 pt-1 border-t border-border">
                <p className="text-xs text-muted-foreground flex-1 my-auto">Profile: {pkg.mikrotikProfileName ?? "default"}</p>
                <Button variant="ghost" size="icon" onClick={() => openEdit(pkg)} aria-label="Edit package">
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

      <Modal open={showModal} onClose={closeModal} title={editingId ? "Edit Package" : "Create Package"} size="lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (editingId) {
              update.mutate({ id: editingId, ...form });
            } else {
              create.mutate(form);
            }
          }}
          className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {n("name", "Package Name *", "pk-name")}
            <div>
              <label htmlFor="pk-type" className="block text-xs font-medium text-muted-foreground mb-1.5">Type</label>
              <Dropdown
                title="Type"
                value={form.type}
                onChange={(value) => setForm({ ...form, type: value as "pppoe" | "hotspot" | "static" })}
                className="w-full"
                options={[
                  { value: "pppoe", label: "PPPoE" },
                  { value: "hotspot", label: "Hotspot" },
                  { value: "static", label: "Static" },
                ]}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {n("downloadMbps", "Download (Mbps)", "pk-dl", "number")}
            {n("uploadMbps", "Upload (Mbps)", "pk-ul", "number")}
            {n("priceBdt", "Price (BDT)", "pk-price", "number")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {n("durationValue", "Duration value", "pk-dur-val", "number")}
            <div>
              <label htmlFor="pk-dur-unit" className="block text-xs font-medium text-muted-foreground mb-1.5">Duration unit</label>
              <Dropdown
                title="Unit"
                value={form.durationUnit}
                onChange={(value) => setForm({ ...form, durationUnit: value as "hour" | "day" })}
                className="w-full"
                options={[
                  { value: "hour", label: "Hours" },
                  { value: "day", label: "Days" },
                ]}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-2">Examples: 1h, 3h, 6h, 12h, 24h, 3d, 7d, 30d</p>
          {n("mikrotikProfileName", "MikroTik Profile", "pk-profile")}
          {n("description", "Description", "pk-desc")}
          {n("sortOrder", "Sort order", "pk-sort", "number")}
          <div className="flex items-center gap-2">
            <input
              id="pk-active"
              type="checkbox"
              className="rounded border-border"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            <label htmlFor="pk-active" className="text-sm text-muted-foreground">Package is active (visible on portal)</label>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" className="flex-1" disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending ? "Saving…" : editingId ? "Save changes" : "Create Package"}
            </Button>
            <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
