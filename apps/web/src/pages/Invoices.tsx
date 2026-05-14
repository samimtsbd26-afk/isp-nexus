import { useState } from "react";
import { trpcDeserializeResultData, trpcEncodeQueryInput } from "../lib/trpc-http";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Download, RefreshCw } from "lucide-react";
import { Card, CardContent, Button, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Empty } from "../components/ui/index";

export default function Invoices() {
  const { data, refetch, isLoading } = trpc.invoice.list.useQuery();
  const [downloading, setDownloading] = useState<string | null>(null);

  async function downloadPdf(id: string) {
    setDownloading(id);
    try {
      const input = trpcEncodeQueryInput({ id });
      const response = await fetch(`/api/trpc/invoice.generatePdf?input=${input}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("isp_access_token")}` },
      });
      const result = await response.json();
      const pdf =
        result?.result?.data !== undefined ? trpcDeserializeResultData<{ base64: string; filename: string }>(result.result.data) : null;
      if (!response.ok || !pdf?.base64) { toast.error("Failed to generate PDF"); return; }
      const blob = new Blob([Uint8Array.from(atob(pdf.base64), (c) => c.codePointAt(0) ?? 0)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = pdf.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("PDF download failed"); }
    setDownloading(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Invoices</h1>
          <p className="text-muted-foreground text-sm">{data?.length ?? 0} invoices</p>
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
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead className="w-20">PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-sm font-medium">{inv.invoiceNumber}</TableCell>
                    <TableCell>৳{inv.amountBdt.toLocaleString()}</TableCell>
                    <TableCell className="font-semibold">৳{inv.totalBdt.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(inv.issuedAt).toLocaleDateString("en-BD")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={inv.paidAt ? "success" : "warning"}>
                        {inv.paidAt ? "Paid" : "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" title="Download PDF"
                        disabled={downloading === inv.id}
                        onClick={() => downloadPdf(inv.id)}>
                        <Download size={14} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && !data?.length && <Empty message="No invoices yet — approve some orders first" />}
        </CardContent>
      </Card>
    </div>
  );
}
