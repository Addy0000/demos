"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  SalesOrderStatus,
  SalesQuotationStatus,
  SalesInquiryStatus,
  CostSheetStatus,
  ChallanStatus,
  SalesInvoiceStatus,
  SalesReturnStatus,
  QcResult,
  BatchStatus,
  MovementKind,
  PostingSide,
  PostingSourceType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/session";

export type ActionState = { error?: string; success?: string };

async function nextSeq(
  prefix: string,
  model: "salesOrder" | "deliveryChallan" | "salesInvoice" | "salesReturn" | "salesInquiry" | "costSheet" | "salesQuotation",
): Promise<string> {
  const year = new Date().getFullYear();
  const prefixPattern = `${prefix}-${year}-`;

  const records = await (prisma[model] as any).findMany({
    where: { code: { startsWith: prefixPattern } },
    select: { code: true },
  });

  let maxNum = 0;
  for (const r of records) {
    const raw = r.code.replace(prefixPattern, "");
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > maxNum) {
      maxNum = parsed;
    }
  }

  let nextNum = maxNum + 1;
  let candidate = `${prefixPattern}${String(nextNum).padStart(4, "0")}`;

  // Collision guard against non-standard or pre-existing codes
  while (await (prisma[model] as any).findUnique({ where: { code: candidate } })) {
    nextNum++;
    candidate = `${prefixPattern}${String(nextNum).padStart(4, "0")}`;
  }

  return candidate;
}

// ── Inquiry ─────────────────────────────────────────────────────────────────

const salesInquiryFormSchema = z.object({
  customerId: z.string().min(1, "Select a customer"),
  projectId: z.string().optional(),
  requiredBy: z.string().optional(),
  source: z.string().optional(),
  remark: z.string().optional(),
  lines: z.string().min(1, "Add at least one line item"),
});

const salesInquiryLineSchema = z.array(
  z.object({
    description: z.string().min(1, "Requirement description is required"),
    quantityKg: z.coerce.number().positive("Quantity must be greater than 0"),
    targetRate: z.coerce.number().min(0).optional().nullable(),
  }),
).min(1, "Add at least one line item");

import {
  createSalesInquiryCore,
  createCostSheetCore,
  decideCostSheetCore,
  createSalesQuotationCore,
  acceptQuotationCore,
  rejectQuotationCore,
  confirmSalesOrderCore,
  allocateStockCore,
  releaseAllocationCore,
  dispatchOrderCore,
  raiseInvoiceCore,
  inspectSalesReturnCore,
  createSalesReturnCore,
  cancelSalesOrderCore,
  createPackingListCore,
  savePackingPackagesCore,
  finalizePackingListCore,
  type PackingPackageInput,
} from "./sales-core";


export async function createSalesInquiry(_prev: ActionState, form: FormData): Promise<ActionState & { inquiryId?: string }> {
  const user = await assertPermission("sales:write");
  return createSalesInquiryCore(user.id, form);
}

export async function createCostSheet(_prev: ActionState, form: FormData): Promise<ActionState & { costSheetId?: string }> {
  const user = await assertPermission("costsheet:write");
  return createCostSheetCore(user.id, form);
}

export async function decideCostSheet(id: string, approve: boolean, note: string): Promise<ActionState> {
  const user = await assertPermission("costsheet:approve");
  return decideCostSheetCore(user.id, id, approve, note);
}

export async function createSalesQuotation(_prev: ActionState, form: FormData): Promise<ActionState & { quotationId?: string }> {
  const user = await assertPermission("squote:write");
  return createSalesQuotationCore(user.id, form);
}

export async function acceptQuotation(quotationId: string): Promise<ActionState & { orderId?: string }> {
  const user = await assertPermission("so:write");
  return acceptQuotationCore(user.id, quotationId);
}

export async function rejectQuotation(quotationId: string, reason: string): Promise<ActionState> {
  const user = await assertPermission("squote:write");
  return rejectQuotationCore(user.id, quotationId, reason);
}

// ── Direct Sales Order creation ──────────────────────────────────────────────

const salesOrderFormSchema = z.object({
  customerId: z.string().min(1, "Select a customer"),
  customerPoNo: z.string().optional(),
  customerPoDate: z.string().optional(),
  promisedOn: z.string().optional(),
  paymentTerms: z.string().optional(),
  deliveryTerms: z.string().optional(),
  remark: z.string().optional(),
  lines: z.string().min(1, "Add at least one line item"),
});

const salesOrderLineItemSchema = z.array(
  z.object({
    projectId: z.string().min(1, "Select a compound for each line"),
    quantityKg: z.coerce.number().positive("Quantity must be greater than 0"),
    ratePerKg: z.coerce.number().min(0, "Rate cannot be negative"),
    taxPct: z.coerce.number().min(0).default(18),
  }),
).min(1, "Add at least one line item");

/**
 * Build a direct Sales Order (no inquiry or quotation required).
 * Directly creates a Sales Order for a customer with compound line items,
 * defaulting to PENDING_APPROVAL for credit check and confirmation.
 */
export async function createSalesOrder(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission("so:write");

  const parsed = salesOrderFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the order details." };
  }

  let rawLines;
  try {
    rawLines = salesOrderLineItemSchema.parse(JSON.parse(parsed.data.lines));
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { error: err.issues[0]?.message ?? "Add at least one valid line item." };
    }
    return { error: "Add at least one valid line item." };
  }

  const customer = await prisma.customer.findUnique({
    where: { id: parsed.data.customerId },
    select: { id: true, name: true },
  });
  if (!customer) return { error: "Selected customer does not exist." };

  const subtotal = rawLines.reduce((acc, l) => acc + l.quantityKg * l.ratePerKg, 0);
  const tax = rawLines.reduce((acc, l) => acc + (l.quantityKg * l.ratePerKg * (l.taxPct ?? 18)) / 100, 0);
  const total = Number((subtotal + tax).toFixed(2));

  let created;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = await nextSeq("SO", "salesOrder");
    try {
      created = await prisma.$transaction(async (tx) => {
        return tx.salesOrder.create({
          data: {
            code,
            status: SalesOrderStatus.PENDING_APPROVAL,
            customerId: customer.id,
            customerPoNo: parsed.data.customerPoNo?.trim() || null,
            customerPoDate: parsed.data.customerPoDate ? new Date(parsed.data.customerPoDate) : null,
            promisedOn: parsed.data.promisedOn ? new Date(parsed.data.promisedOn) : null,
            paymentTerms: parsed.data.paymentTerms?.trim() || null,
            deliveryTerms: parsed.data.deliveryTerms?.trim() || null,
            subtotal: Number(subtotal.toFixed(2)),
            taxAmount: Number(tax.toFixed(2)),
            totalValue: total,
            raisedById: user.id,
            remark: parsed.data.remark?.trim() || "Raised directly.",
            lines: {
              create: rawLines.map((l, idx) => {
                const lineTotal = Number((l.quantityKg * l.ratePerKg).toFixed(2));
                return {
                  lineNo: idx + 1,
                  projectId: l.projectId,
                  quantityKg: l.quantityKg,
                  ratePerKg: l.ratePerKg,
                  taxPct: l.taxPct ?? 18,
                  lineTotal,
                };
              }),
            },
          },
        });
      });
      break;
    } catch (err: any) {
      if (err?.code === "P2002" && attempt < 2) {
        continue;
      }
      throw err;
    }
  }

  if (!created) {
    return { error: "Failed to generate a unique sales order code. Please try again." };
  }

  await prisma.auditEvent.create({
    data: {
      entityType: "SalesOrder",
      entityId: created.id,
      action: "CREATE",
      summary: `Raised direct sales order ${created.code} — ₹${total.toFixed(2)} for ${customer.name}`,
      metadata: { value: total, direct: true },
      actorId: user.id,
    },
  });

  revalidatePath("/sales/orders");
  redirect(`/sales/orders/${created.id}`);
}

/**
 * Confirmation is the credit gate.
 *
 * Discovering at despatch that a customer is over their limit is how a business
 * ends up shipping goods it will not be paid for, so the check happens here — at
 * the moment the commitment is made — and it names the numbers rather than just
 * refusing.
 */
export async function confirmSalesOrder(id: string, override: string): Promise<ActionState> {
  const user = await assertPermission("so:approve");
  return confirmSalesOrderCore(user.id, id, override);
}

export async function cancelSalesOrder(orderId: string, reason: string): Promise<ActionState> {
  const user = await assertPermission("so:write");
  return cancelSalesOrderCore(user.id, orderId, reason);
}

// ── Allocation ──────────────────────────────────────────────────────────────

export async function allocateStock(
  salesOrderLineId: string,
  picksJson: string,
): Promise<ActionState> {
  const user = await assertPermission("allocate:write");
  return allocateStockCore(user.id, salesOrderLineId, picksJson);
}

export async function releaseAllocation(allocationId: string): Promise<ActionState> {
  const user = await assertPermission("allocate:write");
  return releaseAllocationCore(user.id, allocationId);
}

// ── Despatch ────────────────────────────────────────────────────────────────

export async function dispatchOrder(
  salesOrderId: string,
  vehicleNo: string,
  driverName: string,
): Promise<ActionState & { challanId?: string }> {
  const user = await assertPermission("dispatch:write");
  return dispatchOrderCore(user.id, salesOrderId, vehicleNo, driverName);
}

// ── Invoice ─────────────────────────────────────────────────────────────────

export async function raiseInvoice(challanId: string): Promise<ActionState & { invoiceId?: string }> {
  const user = await assertPermission("invoice:write");
  return raiseInvoiceCore(user.id, challanId);
}

// ── Sales return QC ─────────────────────────────────────────────────────────

export async function inspectSalesReturn(
  returnId: string,
  linesJson: string,
  remark: string,
): Promise<ActionState> {
  const user = await assertPermission("sreturn:qc");
  return inspectSalesReturnCore(user.id, returnId, linesJson, remark);
}

// ── Create Sales Return ──────────────────────────────────────────────────────

export async function createSalesReturn(_prev: ActionState, form: FormData): Promise<ActionState & { returnId?: string }> {
  const user = await assertPermission("sreturn:write");
  return createSalesReturnCore(user.id, form);
}

// ── Packing List ────────────────────────────────────────────────────────────

export async function createPackingList(
  challanId: string,
): Promise<ActionState & { packingListId?: string }> {
  const user = await assertPermission("dispatch:write");
  return createPackingListCore(user.id, challanId);
}

export async function savePackingPackages(
  packingListId: string,
  packages: PackingPackageInput[],
): Promise<ActionState> {
  const user = await assertPermission("dispatch:write");
  return savePackingPackagesCore(user.id, packingListId, packages);
}

export async function finalizePackingList(
  packingListId: string,
): Promise<ActionState> {
  const user = await assertPermission("dispatch:write");
  return finalizePackingListCore(user.id, packingListId);
}



