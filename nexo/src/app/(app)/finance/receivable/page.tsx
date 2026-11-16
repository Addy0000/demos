import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ReceivableGrid } from "./receivable-grid";

export const metadata: Metadata = { title: "Accounts receivable" };
export const dynamic = "force-dynamic";

export default async function ReceivablePage() {
  await requirePermission("payment:receive");

  const invoices = await prisma.salesInvoice.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { id: true, name: true, code: true } },
      salesOrder: { select: { id: true, code: true } },
      challan: { select: { id: true, code: true } },
    },
  });

  const formatted = invoices.map((inv) => ({
    id: inv.id,
    code: inv.code,
    status: inv.status,
    customerId: inv.customerId,
    customer: inv.customer,
    salesOrderId: inv.salesOrderId,
    salesOrder: inv.salesOrder,
    challanId: inv.challanId,
    challan: inv.challan,
    invoiceDate: inv.invoiceDate.toISOString(),
    dueOn: inv.dueOn ? inv.dueOn.toISOString() : null,
    subtotal: Number(inv.subtotal),
    taxAmount: Number(inv.taxAmount),
    totalValue: Number(inv.totalValue),
    paidAmount: Number(inv.paidAmount),
    creditedAmount: Number(inv.creditedAmount),
    remainingAmount: Math.max(0, Number(inv.totalValue) - Number(inv.paidAmount) - Number(inv.creditedAmount)),
    remark: inv.remark,
  }));

  return <ReceivableGrid initialInvoices={formatted} />;
}
