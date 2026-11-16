import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { FlowMap } from "@/components/flow/flow-map";

export const metadata: Metadata = { title: "Sales process flow" };
export const dynamic = "force-dynamic";

/**
 * The sales chain with live numbers on it. Counts are open work — what is sitting
 * at each stage now — because the question is where the pipeline is stuck.
 */
export default async function SalesFlowPage() {
  const user = await requireAnyPermission(["sales:read", "so:read", "invoice:read"]);

  const [
    siOpen, siQuoted,
    csPending, csApproved,
    sqOut, sqNegotiating,
    soPending, soConfirmed,
    linesToAllocate, allocationsActive,
    dcPacked, dcDispatched,
    pklDraft, pklFinal,
    invOpen, invOverdue,
    srnPendingQc, srnClosed,
    receivable,
  ] = await Promise.all([
    prisma.salesInquiry.count({ where: { status: "OPEN" } }),
    prisma.salesInquiry.count({ where: { status: "QUOTED" } }),
    prisma.costSheet.count({ where: { status: "PENDING_APPROVAL" } }),
    prisma.costSheet.count({ where: { status: "APPROVED" } }),
    prisma.salesQuotation.count({ where: { status: "SENT" } }),
    prisma.salesQuotation.count({ where: { status: "UNDER_NEGOTIATION" } }),
    prisma.salesOrder.count({ where: { status: "PENDING_APPROVAL" } }),
    prisma.salesOrder.count({ where: { status: "CONFIRMED" } }),
    // Confirmed order lines still short of stock — the queue Stores works from.
    prisma.salesOrderLine.count({
      where: { salesOrder: { status: "CONFIRMED" } },
    }),
    prisma.stockAllocation.count({ where: { isActive: true } }),
    prisma.deliveryChallan.count({ where: { status: "PACKED" } }),
    prisma.deliveryChallan.count({ where: { status: { in: ["DISPATCHED", "DELIVERED"] } } }),
    prisma.packingList.count({ where: { status: "DRAFT" } }),
    prisma.packingList.count({ where: { status: "FINAL" } }),
    prisma.salesInvoice.count({ where: { status: { in: ["RAISED", "PART_PAID"] } } }),
    prisma.salesInvoice.count({ where: { status: "OVERDUE" } }),
    prisma.salesReturn.count({ where: { status: "PENDING_QC" } }),
    prisma.salesReturn.count({ where: { status: { in: ["RESTOCKED", "PARTIALLY_RESTOCKED", "SCRAPPED", "CLOSED"] } } }),
    prisma.salesInvoice.findMany({
      where: { status: { in: ["RAISED", "PART_PAID", "OVERDUE"] } },
      select: { totalValue: true, paidAmount: true },
    }),
  ]);

  const outstanding = receivable.reduce((a, i) => a + (Number(i.totalValue) - Number(i.paidAmount)), 0);

  return (
    <FlowMap
      chain="sales"
      title="Sales process flow"
      intro="A customer requirement enters at the top and leaves as an invoice — or comes back as a return. The cost sheet is the join to the rate base: it prices the formulation against today's approved material rates, then freezes so the quotation can be defended weeks later."
      forkAfter="invoice"
      forkNote="Most orders end at the invoice. What comes back is inspected before it counts as stock again."
      footnote={{
        value: outstanding,
        stageKey: "invoice",
        text: "is invoiced and still unpaid across open and overdue invoices.",
      }}
      canSee={{
        sinquiry: can(user.role, "sales:read"),
        costsheet: can(user.role, "costsheet:read"),
        squotation: can(user.role, "squote:read"),
        sorder: can(user.role, "so:read"),
        allocation: can(user.role, "so:read"),
        dispatch: can(user.role, "dispatch:read"),
        packinglist: can(user.role, "dispatch:read"),
        invoice: can(user.role, "invoice:read"),
        sreturn: can(user.role, "sreturn:read"),
      }}
      counts={{
        sinquiry: { primary: siOpen, primaryLabel: "open, not quoted", secondary: siQuoted, secondaryLabel: "quoted, undecided" },
        costsheet: { primary: csPending, primaryLabel: "awaiting Finance", secondary: csApproved, secondaryLabel: "approved" },
        squotation: { primary: sqOut, primaryLabel: "out with customers", secondary: sqNegotiating, secondaryLabel: "under negotiation" },
        sorder: { primary: soPending, primaryLabel: "awaiting confirmation", secondary: soConfirmed, secondaryLabel: "confirmed, not despatched" },
        allocation: { primary: linesToAllocate, primaryLabel: "lines to allocate", secondary: allocationsActive, secondaryLabel: "batches reserved" },
        dispatch: { primary: dcPacked, primaryLabel: "packed, not gone", secondary: dcDispatched, secondaryLabel: "despatched" },
        packinglist: { primary: pklDraft, primaryLabel: "draft, packing", secondary: pklFinal, secondaryLabel: "finalized" },
        invoice: { primary: invOverdue, primaryLabel: "overdue", secondary: invOpen, secondaryLabel: "raised, within terms" },
        sreturn: { primary: srnPendingQc, primaryLabel: "awaiting inspection", secondary: srnClosed, secondaryLabel: "settled" },
      }}
    />
  );
}
