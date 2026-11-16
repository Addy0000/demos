import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { FlowMap } from "@/components/flow/flow-map";

export const metadata: Metadata = { title: "Process flow" };
export const dynamic = "force-dynamic";

/**
 * The procurement chain with live numbers on it.
 *
 * Each count is what is *sitting* at that stage — work in hand, not work done —
 * because the question this page answers is where the chain is blocked.
 */
export default async function FlowPage() {
  const user = await requireAnyPermission(["req:read", "po:read", "grn:read"]);

  const [
    reqDraft, reqPending, reqApprovedUnsourced,
    inquiriesOpen, quotesIn, comparedUnordered,
    poPending, poApproved, poPartial,
    grnPendingQc, grnPosted,
    batchesQuarantine, batchesAvailable,
    vrnHeld, vrnDispatched,
    rejectedValue,
  ] = await Promise.all([
    prisma.purchaseRequisition.count({ where: { status: "DRAFT" } }),
    prisma.purchaseRequisition.count({ where: { status: "PENDING_APPROVAL" } }),
    prisma.purchaseRequisition.count({ where: { status: "APPROVED", inquiries: { none: {} } } }),
    prisma.purchaseInquiry.count({ where: { status: { in: ["SENT", "QUOTES_IN"] } } }),
    prisma.purchaseQuotation.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
    prisma.purchaseQuotation.count({ where: { status: "SELECTED", orders: { none: {} } } }),
    prisma.purchaseOrder.count({ where: { status: "PENDING_APPROVAL" } }),
    prisma.purchaseOrder.count({ where: { status: "APPROVED" } }),
    prisma.purchaseOrder.count({ where: { status: "PARTIALLY_RECEIVED" } }),
    prisma.goodsReceipt.count({ where: { status: "PENDING_QC" } }),
    prisma.goodsReceipt.count({ where: { status: "POSTED" } }),
    prisma.inventoryBatch.count({ where: { status: "QUARANTINE" } }),
    prisma.inventoryBatch.count({ where: { status: "AVAILABLE" } }),
    prisma.vendorRejectionNote.count({ where: { status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] } } }),
    prisma.vendorRejectionNote.count({ where: { status: "DISPATCHED" } }),
    prisma.vendorRejectionNoteLine.findMany({
      where: { note: { status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] } } },
      select: { quantityKg: true, ratePerKg: true },
    }),
  ]);

  const heldValue = rejectedValue.reduce((a, l) => a + Number(l.quantityKg) * Number(l.ratePerKg), 0);

  return (
    <FlowMap
      chain="procurement"
      title="Procurement process flow"
      intro="Demand enters at the top and either becomes stock or goes back to the vendor. Every stage is a document that has to be signed before the next one can exist — the counts are what is sitting there now, not what has passed through."
      forkAfter="qc"
      forkNote="Inspection splits the consignment — accepted quantity becomes stock, the rest stays ours to send back."
      footnote={{
        value: heldValue,
        stageKey: "rejection",
        text: "of rejected material is still in the Rejection warehouse — the vendor's, but on our floor.",
      }}
      canSee={{
        requisition: can(user.role, "req:read"),
        inquiry: can(user.role, "inquiry:read"),
        quotation: can(user.role, "quote:read"),
        comparison: can(user.role, "quote:read"),
        order: can(user.role, "po:read"),
        receipt: can(user.role, "grn:read"),
        qc: can(user.role, "grn:read"),
        store: can(user.role, "inventory:read"),
        rejection: can(user.role, "vrn:read"),
      }}
      counts={{
        requisition: { primary: reqPending, primaryLabel: "awaiting approval", secondary: reqApprovedUnsourced, secondaryLabel: "approved, unsourced", tertiary: reqDraft, tertiaryLabel: "draft" },
        inquiry: { primary: inquiriesOpen, primaryLabel: "out with vendors" },
        quotation: { primary: quotesIn, primaryLabel: "quotations in hand" },
        comparison: { primary: comparedUnordered, primaryLabel: "selected, not ordered" },
        order: { primary: poPending, primaryLabel: "awaiting approval", secondary: poApproved, secondaryLabel: "approved, not received", tertiary: poPartial, tertiaryLabel: "part received" },
        receipt: { primary: grnPendingQc, primaryLabel: "awaiting inspection", secondary: grnPosted, secondaryLabel: "posted" },
        qc: { primary: grnPendingQc, primaryLabel: "on the bench" },
        store: { primary: batchesAvailable, primaryLabel: "batches available", secondary: batchesQuarantine, secondaryLabel: "in quarantine" },
        rejection: { primary: vrnHeld, primaryLabel: "held for return", secondary: vrnDispatched, secondaryLabel: "despatched" },
      }}
    />
  );
}
