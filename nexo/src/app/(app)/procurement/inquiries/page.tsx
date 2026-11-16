import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can, isVendor } from "@/lib/rbac";
import { InquiriesGrid } from "./inquiries-grid";

export const metadata: Metadata = { title: "Purchase inquiries" };
export const dynamic = "force-dynamic";

export default async function InquiriesPage() {
  const user = await requirePermission("inquiry:read");

  // A vendor sees the inquiries it was actually invited to and nothing else.
  // The permission alone is not the control — this filter is.
  const where = isVendor(user.role)
    ? { vendors: { some: { vendorId: user.vendorId ?? "__unassigned_vendor__" } } }
    : {};

  const rows = await prisma.purchaseInquiry.findMany({
    where,
    include: {
      requisition: { select: { id: true, code: true } },
      raisedBy: { select: { name: true } },
      lines: { select: { quantityKg: true, material: { select: { name: true } } } },
      vendors: { select: { vendorId: true, respondedAt: true } },
      quotations: { select: { id: true, status: true, totalValue: true, vendorId: true } },
    },
    orderBy: { issuedOn: "desc" },
  });

  return (
    <InquiriesGrid
      isVendorView={isVendor(user.role)}
      canWrite={can(user.role, "inquiry:write")}
      rows={rows.map((q) => {
        const totals = q.quotations.map((x) => Number(x.totalValue)).filter((n) => n > 0);
        const selected = q.quotations.find((x) => x.status === "SELECTED");
        return {
          id: q.id,
          code: q.code,
          status: q.status,
          requisitionId: q.requisition?.id ?? null,
          requisitionCode: q.requisition?.code ?? null,
          issuedOn: q.issuedOn.toISOString(),
          dueOn: q.dueOn?.toISOString() ?? null,
          lineCount: q.lines.length,
          firstMaterial: q.lines[0]?.material.name ?? "—",
          quantityKg: q.lines.reduce((a, l) => a + Number(l.quantityKg), 0),
          invited: q.vendors.length,
          responded: q.vendors.filter((v) => v.respondedAt).length,
          quoteCount: q.quotations.length,
          lowest: totals.length ? Math.min(...totals) : 0,
          highest: totals.length ? Math.max(...totals) : 0,
          selectedValue: selected ? Number(selected.totalValue) : 0,
          raisedBy: q.raisedBy?.name ?? "—",
        };
      })}
    />
  );
}
