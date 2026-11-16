import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { DispatchGrid } from "./dispatch-grid";

export const metadata: Metadata = { title: "Despatch" };
export const dynamic = "force-dynamic";

export default async function DispatchPage() {
  const user = await requirePermission("dispatch:read");

  const rows = await prisma.deliveryChallan.findMany({
    include: {
      customer: { select: { id: true, name: true, city: true } },
      salesOrder: { select: { id: true, code: true, customerPoNo: true } },
      raisedBy: { select: { name: true } },
      invoices: { select: { id: true, code: true, status: true } },
      lines: {
        select: {
          quantityKg: true, ratePerKg: true,
          batch: { select: { batchNo: true } },
          salesOrderLine: { select: { project: { select: { name: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <DispatchGrid
      canInvoice={can(user.role, "invoice:write")}
      rows={rows.map((c) => ({
        id: c.id,
        code: c.code,
        status: c.status,
        customerId: c.customer.id,
        customerName: c.customer.name,
        city: c.customer.city ?? "—",
        orderId: c.salesOrder.id,
        orderCode: c.salesOrder.code,
        customerPoNo: c.salesOrder.customerPoNo ?? "—",
        dispatchedOn: c.dispatchedOn?.toISOString() ?? null,
        deliveredOn: c.deliveredOn?.toISOString() ?? null,
        vehicleNo: c.vehicleNo ?? "—",
        lrNo: c.lrNo ?? "—",
        packageCnt: c.packageCnt,
        lineCount: c.lines.length,
        firstProject: c.lines[0]?.salesOrderLine.project.name ?? "—",
        batches: c.lines.map((l) => l.batch?.batchNo).filter(Boolean).join(", ") || "—",
        quantityKg: c.lines.reduce((a, l) => a + Number(l.quantityKg), 0),
        value: c.lines.reduce((a, l) => a + Number(l.quantityKg) * Number(l.ratePerKg), 0),
        invoiceId: c.invoices[0]?.id ?? null,
        invoiceCode: c.invoices[0]?.code ?? null,
        raisedBy: c.raisedBy?.name ?? "—",
      }))}
    />
  );
}
