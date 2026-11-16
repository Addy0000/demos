import type { Metadata } from "next";
import { PoStatus, ApprovalTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { approvalLimit, canApproveValue, ROLE_LABELS } from "@/lib/rbac";
import { OrderApprovalQueue } from "./order-approval-queue";

export const metadata: Metadata = { title: "Order approvals" };
export const dynamic = "force-dynamic";

export default async function OrderApprovalsPage() {
  const user = await requirePermission("po:approve");

  const pending = await prisma.purchaseOrder.findMany({
    where: { status: PoStatus.PENDING_APPROVAL },
    include: {
      vendor: { select: { id: true, name: true, rating: true, status: true } },
      raisedBy: { select: { id: true, name: true } },
      lines: {
        include: { material: { select: { id: true, name: true, code: true, currentPricePerKg: true } } },
        orderBy: { lineNo: "asc" },
      },
    },
    orderBy: { orderedOn: "asc" },
  });

  const limit = approvalLimit(user.role);

  return (
    <OrderApprovalQueue
      roleLabel={ROLE_LABELS[user.role]}
      limit={limit === null || !Number.isFinite(limit) ? null : limit}
      currentUserId={user.id}
      rows={pending.map((po) => {
        const value = Number(po.totalValue);

        // Lines priced above the current approved rate are the thing an approver
        // actually needs to see — a PO can be within limit and still be a bad buy.
        const overRate = po.lines.filter((l) => {
          const approved = l.material.currentPricePerKg ? Number(l.material.currentPricePerKg) : null;
          return approved !== null && Number(l.ratePerKg) > approved + 0.005;
        }).length;

        return {
          id: po.id,
          code: po.code,
          value,
          tier: po.approvalTier ?? ApprovalTier.HEAD,
          vendorId: po.vendor.id,
          vendorName: po.vendor.name,
          vendorRating: Number(po.vendor.rating),
          vendorStatus: po.vendor.status,
          orderedOn: po.orderedOn.toISOString(),
          expectedOn: po.expectedOn?.toISOString() ?? null,
          raisedById: po.raisedBy?.id ?? null,
          raisedBy: po.raisedBy?.name ?? "—",
          lineCount: po.lines.length,
          firstMaterial: po.lines[0]?.material.name ?? "—",
          overRate,
          canApprove: canApproveValue(user.role, value) && po.raisedBy?.id !== user.id,
          blockedReason:
            po.raisedBy?.id === user.id
              ? "You raised this order"
              : !canApproveValue(user.role, value)
                ? "Above your limit — Management"
                : null,
        };
      })}
    />
  );
}
