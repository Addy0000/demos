import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { InvoicesGrid } from "./invoices-grid";
import { isInvoiceOverdue, getInvoiceOverdueInfo } from "@/lib/invoice-overdue";

export const metadata: Metadata = { title: "Sales invoices" };
export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  await requirePermission("invoice:read");

  const rows = await prisma.salesInvoice.findMany({
    include: {
      customer: { select: { id: true, name: true, creditDays: true } },
      salesOrder: { select: { id: true, code: true, customerPoNo: true } },
      challan: { select: { id: true, code: true } },
      raisedBy: { select: { name: true } },
    },
    orderBy: { invoiceDate: "desc" },
  });

  const now = new Date();

  return (
    <InvoicesGrid
      rows={rows.map((i) => {
        const isOverdue = isInvoiceOverdue(i, now);
        const { daysOverdue, balance } = getInvoiceOverdueInfo(i, now);
        const total = Number(i.totalValue);
        const paid = Number(i.paidAmount);
        return {
          id: i.id,
          code: i.code,
          status: isOverdue ? "OVERDUE" : i.status,
          customerId: i.customer.id,
          customerName: i.customer.name,
          orderId: i.salesOrder.id,
          orderCode: i.salesOrder.code,
          customerPoNo: i.salesOrder.customerPoNo ?? "—",
          challanId: i.challan?.id ?? null,
          challanCode: i.challan?.code ?? null,
          invoiceDate: i.invoiceDate.toISOString(),
          dueOn: i.dueOn?.toISOString() ?? null,
          total,
          paid,
          due: balance,
          // Positive means past due. The number collections actually works from.
          daysOverdue,
          raisedBy: i.raisedBy?.name ?? "—",
        };
      })}
    />
  );
}
