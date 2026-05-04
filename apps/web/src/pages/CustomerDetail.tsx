import { useParams, useNavigate } from "react-router";
import { trpc } from "../lib/trpc";
import { ArrowLeft, Phone, Mail, MapPin, CreditCard, Server } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from "../components/ui/index";

function statusVariant(s: string): "success" | "warning" | "destructive" | "default" {
  if (s === "active") return "success";
  if (s === "suspended") return "warning";
  if (s === "cancelled" || s === "expired") return "destructive";
  return "default";
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = trpc.customer.get.useQuery({ id: id ?? "" }, { enabled: !!id });

  if (isLoading) return <div className="py-20 text-center text-muted-foreground text-sm">Loading customer…</div>;
  if (!data) return <div className="py-20 text-center text-muted-foreground text-sm">Customer not found</div>;

  const { subscriptions, ...customer } = data;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/customers")}>
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{customer.fullName}</h1>
          <p className="text-muted-foreground text-sm">{customer.customerCode}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Customer info */}
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
          </CardContent>
        </Card>

        {/* Subscriptions */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server size={16} /> Subscriptions ({subscriptions?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {subscriptions?.length ? (
              <div className="space-y-3">
                {subscriptions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border">
                    <div>
                      <p className="font-mono text-sm font-semibold">{s.username}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.ipAddress ?? "Dynamic IP"}
                        {s.expiresAt ? ` · Expires ${new Date(s.expiresAt).toLocaleDateString()}` : ""}
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

      <div className="text-xs text-muted-foreground">
        Customer since: {new Date(customer.createdAt).toLocaleString()}
      </div>
    </div>
  );
}
