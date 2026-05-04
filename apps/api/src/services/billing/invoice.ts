import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Invoice, Customer, Order } from "@isp-nexus/db";

export function generateInvoicePdf(invoice: Invoice, customer: Customer, order: Order): Buffer {
  const doc = new jsPDF();

  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("ISP NEXUS", 20, 20);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Invoice", 20, 30);
  doc.text(`Invoice #: ${invoice.invoiceNumber}`, 20, 38);
  doc.text(`Date: ${new Date(invoice.issuedAt).toLocaleDateString()}`, 20, 46);

  doc.setFont("helvetica", "bold");
  doc.text("Bill To:", 20, 60);
  doc.setFont("helvetica", "normal");
  doc.text(customer.fullName, 20, 68);
  doc.text(customer.phone, 20, 76);
  if (customer.address) doc.text(customer.address, 20, 84);

  autoTable(doc, {
    startY: 100,
    head: [["Description", "Method", "Amount (BDT)"]],
    body: [[
      `Internet Service - ${new Date(invoice.issuedAt).toLocaleDateString()}`,
      order.paymentMethod ?? "N/A",
      invoice.totalBdt.toLocaleString(),
    ]],
    foot: [["", "Total", invoice.totalBdt.toLocaleString()]],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [30, 30, 80] },
  });

  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text("Thank you for your business.", 20, (doc as any).lastAutoTable.finalY + 20);

  return Buffer.from(doc.output("arraybuffer"));
}
