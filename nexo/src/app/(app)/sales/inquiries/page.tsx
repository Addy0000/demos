import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { SalesInquiriesGrid } from "./sales-inquiries-grid";

export const metadata: Metadata = { title: "Sales inquiries" };
export const dynamic = "force-dynamic";

export default async function SalesInquiriesPage() {
  await requirePermission("sales:read");

  const rows = await prisma.salesInquiry.findMany({
    include: {
      customer: { select: { id: true, name: true, industry: true } },
      project: { select: { id: true, name: true } },
      owner: { select: { name: true } },
      lines: { select: { description: true, quantityKg: true, targetRate: true } },
      quotations: { select: { id: true, code: true, status: true, totalValue: true } },
    },
    orderBy: { receivedOn: "desc" },
  });

  return (
    <SalesInquiriesGrid
      rows={rows.map((i) => {
        const qty = i.lines.reduce((a, l) => a + Number(l.quantityKg), 0);
        const target = i.lines.find((l) => l.targetRate);
        const quoted = i.quotations[0];
        return {
          id: i.id,
          code: i.code,
          status: i.status,
          customerId: i.customer.id,
          customerName: i.customer.name,
          industry: i.customer.industry,
          projectId: i.project?.id ?? null,
          projectName: i.project?.name ?? null,
          receivedOn: i.receivedOn.toISOString(),
          requiredBy: i.requiredBy?.toISOString() ?? null,
          source: i.source ?? "—",
          description: i.lines[0]?.description ?? "—",
          lineCount: i.lines.length,
          quantityKg: qty,
          targetRate: target ? Number(target.targetRate) : null,
          quotationId: quoted?.id ?? null,
          quotationCode: quoted?.code ?? null,
          quotedValue: quoted ? Number(quoted.totalValue) : null,
          lostReason: i.lostReason ?? null,
          owner: i.owner?.name ?? "—",
        };
      })}
    />
  );
}
