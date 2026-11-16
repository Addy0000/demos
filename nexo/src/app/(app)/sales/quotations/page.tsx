import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { QuotationsGrid } from "./quotations-grid";

export const metadata: Metadata = { title: "Sales quotations" };
export const dynamic = "force-dynamic";

export default async function QuotationsPage() {
  const user = await requirePermission("squote:read");

  const rows = await prisma.salesQuotation.findMany({
    include: {
      customer: { select: { id: true, name: true } },
      inquiry: { select: { id: true, code: true } },
      costSheet: { select: { id: true, code: true, status: true, marginPct: true, sellingRatePerKg: true } },
      owner: { select: { name: true } },
      lines: { select: { quantityKg: true, ratePerKg: true, costPerKg: true, project: { select: { name: true } } } },
      orders: { select: { id: true, code: true } },
    },
    orderBy: { issuedOn: "desc" },
  });

  const canSeeMargin = can(user.role, "costsheet:read");

  return (
    <QuotationsGrid
      canSeeMargin={canSeeMargin}
      canOrder={can(user.role, "so:write")}
      rows={rows.map((q) => {
        const qty = q.lines.reduce((a, l) => a + Number(l.quantityKg), 0);
        const revenue = q.lines.reduce((a, l) => a + Number(l.quantityKg) * Number(l.ratePerKg), 0);
        const cost = q.lines.reduce((a, l) => a + Number(l.quantityKg) * Number(l.costPerKg ?? 0), 0);
        // Realised margin on what was actually quoted, not what the sheet said.
        const realised = revenue > 0 && cost > 0 ? ((revenue - cost) / revenue) * 100 : null;
        return {
          id: q.id,
          code: q.code,
          status: q.status,
          customerId: q.customer.id,
          customerName: q.customer.name,
          inquiryId: q.inquiry?.id ?? null,
          inquiryCode: q.inquiry?.code ?? null,
          costSheetId: q.costSheet?.id ?? null,
          costSheetCode: q.costSheet?.code ?? null,
          costSheetApproved: q.costSheet?.status === "APPROVED",
          sheetMargin: q.costSheet ? Number(q.costSheet.marginPct) : null,
          realisedMargin: realised,
          issuedOn: q.issuedOn.toISOString(),
          validUntil: q.validUntil?.toISOString() ?? null,
          lineCount: q.lines.length,
          firstProject: q.lines[0]?.project.name ?? "—",
          quantityKg: qty,
          totalValue: Number(q.totalValue),
          orderId: q.orders[0]?.id ?? null,
          orderCode: q.orders[0]?.code ?? null,
          owner: q.owner?.name ?? "—",
        };
      })}
    />
  );
}
