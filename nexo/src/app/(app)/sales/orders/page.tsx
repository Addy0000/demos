import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { SalesOrdersGrid } from "./sales-orders-grid";

export const metadata: Metadata = { title: "Sales orders" };
export const dynamic = "force-dynamic";

export default async function SalesOrdersPage() {
  const user = await requirePermission("so:read");

  const rows = await prisma.salesOrder.findMany({
    include: {
      customer: { select: { id: true, name: true, creditLimit: true, outstandingAmt: true } },
      quotation: { select: { id: true, code: true } },
      raisedBy: { select: { name: true } },
      lines: {
        select: {
          quantityKg: true, allocatedKg: true, dispatchedKg: true, ratePerKg: true,
          project: { select: { name: true } },
        },
      },
      _count: { select: { challans: true, invoices: true, returns: true } },
    },
    orderBy: { orderedOn: "desc" },
  });

  return (
    <SalesOrdersGrid
      canApprove={can(user.role, "so:approve")}
      canWrite={can(user.role, "so:write")}
      rows={rows.map((o) => {
        const ordered = o.lines.reduce((a, l) => a + Number(l.quantityKg), 0);
        const allocated = o.lines.reduce((a, l) => a + Number(l.allocatedKg), 0);
        const dispatched = o.lines.reduce((a, l) => a + Number(l.dispatchedKg), 0);
        return {
          id: o.id,
          code: o.code,
          status: o.status,
          customerId: o.customer.id,
          customerName: o.customer.name,
          customerPoNo: o.customerPoNo ?? "—",
          quotationId: o.quotation?.id ?? null,
          quotationCode: o.quotation?.code ?? null,
          orderedOn: o.orderedOn.toISOString(),
          promisedOn: o.promisedOn?.toISOString() ?? null,
          lineCount: o.lines.length,
          firstProject: o.lines[0]?.project.name ?? "—",
          orderedKg: ordered,
          allocatedKg: allocated,
          dispatchedKg: dispatched,
          progress: ordered > 0 ? (dispatched / ordered) * 100 : 0,
          totalValue: Number(o.totalValue),
          challanCount: o._count.challans,
          invoiceCount: o._count.invoices,
          returnCount: o._count.returns,
          raisedBy: o.raisedBy?.name ?? "—",
        };
      })}
    />
  );
}
