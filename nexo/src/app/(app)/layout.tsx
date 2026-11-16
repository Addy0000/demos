import {
  Role, PriceStatus, GrnStatus, PoStatus, ApprovalTier, RequisitionStatus, InquiryStatus, VrnStatus,
  SalesInquiryStatus, CostSheetStatus, SalesOrderStatus, SalesInvoiceStatus, SalesReturnStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { navForRole, navTargets } from "@/lib/nav";
import { getTenant } from "@/lib/tenant-server";
import { ROLE_LABELS, can, approvalLimit } from "@/lib/rbac";
import { ShellClient } from "@/components/shell/shell-client";
import type { BadgeCounts } from "@/components/shell/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  const tenant = await getTenant();
  const isVendor = user.role === Role.VENDOR;
  const services = tenant.kind === "services";

  // Rail badges. Vendors get their own counts, scoped to their vendorId.
  const vendorFilter = isVendor ? { vendorId: user.vendorId ?? "__unassigned__" } : {};

  // The purchase badge counts what THIS role can actually sign, so a Purchase Head
  // is not nagged by orders that escalated past them to Management.
  const tierFilter = can(user.role, "po:approve")
    ? approvalLimit(user.role) === Number.POSITIVE_INFINITY
      ? {}
      : { approvalTier: ApprovalTier.HEAD }
    : {};

  const [
    pendingPrices, pendingGrn, poApproval, lowStock,
    pendingReq, openInquiries, heldRejections,
    openSalesInquiries, pendingCostSheets, soApproval, overdueInvoices, returnsPendingQc,
    vendorRecord,
    pendingLeave, overdueBilling, activeEngagements,
  ] = await Promise.all([
    prisma.materialPrice.count({ where: { status: PriceStatus.PENDING_APPROVAL, ...vendorFilter } }),
    isVendor ? 0 : prisma.goodsReceipt.count({ where: { status: GrnStatus.PENDING_QC } }),
    prisma.purchaseOrder.count({
      where: { status: PoStatus.PENDING_APPROVAL, ...vendorFilter, ...tierFilter },
    }),
    isVendor ? 0 : lowStockCount(),
    isVendor ? 0 : prisma.purchaseRequisition.count({ where: { status: RequisitionStatus.PENDING_APPROVAL } }),
    // For a vendor this is "inquiries you have not answered"; for staff it is
    // "inquiries still out". Same badge, and in both cases it is the open work.
    isVendor
      ? prisma.purchaseInquiry.count({
          where: {
            status: { in: [InquiryStatus.SENT, InquiryStatus.QUOTES_IN] },
            vendors: { some: { vendorId: user.vendorId ?? "__unassigned__" } },
            quotations: { none: { vendorId: user.vendorId ?? "__unassigned__" } },
          },
        })
      : prisma.purchaseInquiry.count({ where: { status: { in: [InquiryStatus.SENT, InquiryStatus.QUOTES_IN] } } }),
    isVendor
      ? 0
      : prisma.vendorRejectionNote.count({
          where: { status: { in: [VrnStatus.DRAFT, VrnStatus.PENDING_APPROVAL, VrnStatus.APPROVED] } },
        }),
    isVendor ? 0 : prisma.salesInquiry.count({ where: { status: { in: [SalesInquiryStatus.OPEN, SalesInquiryStatus.QUOTED] } } }),
    isVendor ? 0 : prisma.costSheet.count({ where: { status: CostSheetStatus.PENDING_APPROVAL } }),
    isVendor ? 0 : prisma.salesOrder.count({ where: { status: SalesOrderStatus.PENDING_APPROVAL } }),
    isVendor
      ? 0
      : prisma.salesInvoice.count({
          where: { status: { in: [SalesInvoiceStatus.OVERDUE, SalesInvoiceStatus.PART_PAID] } },
        }),
    isVendor ? 0 : prisma.salesReturn.count({ where: { status: SalesReturnStatus.PENDING_QC } }),
    user.vendorId
      ? prisma.vendor.findUnique({ where: { id: user.vendorId }, select: { name: true } })
      : null,
    services ? prisma.leaveRequest.count({ where: { status: "PENDING" } }) : 0,
    services ? prisma.serviceInvoice.count({ where: { status: { in: ["OVERDUE", "PART_PAID"] } } }) : 0,
    services ? prisma.engagement.count({ where: { status: "ACTIVE" } }) : 0,
  ]);

  const badges: BadgeCounts = {
    pendingPrices, pendingGrn, poApproval, lowStock,
    pendingReq, openInquiries, heldRejections,
    openSalesInquiries, pendingCostSheets, soApproval, overdueInvoices, returnsPendingQc,
    pendingLeave, overdueBilling, activeEngagements,
  };

  return (
    <ShellClient
      tenant={tenant.key}
      groups={navForRole(user.role, tenant.key)}
      navTargets={navTargets(user.role, tenant.key)}
      badges={badges}
      user={{
        name: user.name,
        email: user.email,
        roleLabel: ROLE_LABELS[user.role],
        jobTitle: user.jobTitle,
        vendorName: vendorRecord?.name ?? null,
      }}
    >
      {children}
    </ShellClient>
  );
}

/** Materials whose available stock has fallen under their reorder level. */
async function lowStockCount(): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM (
      SELECT m.id
      FROM "RawMaterial" m
      LEFT JOIN "InventoryBatch" b
        ON b."materialId" = m.id AND b.status = 'AVAILABLE'
      WHERE m."isActive" = true
      GROUP BY m.id, m."reorderLevelKg"
      HAVING COALESCE(SUM(b."availableQtyKg"), 0) < m."reorderLevelKg"
    ) t
  `;
  return Number(rows[0]?.count ?? 0);
}
