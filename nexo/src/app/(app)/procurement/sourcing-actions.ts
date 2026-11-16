"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  RequisitionStatus,
  InquiryStatus,
  QuotationStatus,
  VrnStatus,
  PoStatus,
  ApprovalTier,
  MovementKind,
  DebitNoteStatus,
  VendorBillStatus,
  PostingSide,
  PostingSourceType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertPermission, type AppSession } from "@/lib/session";
import { tierForValue } from "@/lib/rbac";

export type ActionState = { error?: string; success?: string };

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Ignore when called outside Next.js request context (e.g. CLI scripts / tests)
  }
}

/** Next sequence number for a document family, collision-safe. */
async function nextCode(
  prefix: string,
  table: "pr" | "pi" | "pq" | "vrn" | "dn",
  client: any = prisma,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefixPattern = `${prefix}-${year}-`;

  const records =
    table === "pr"
      ? await client.purchaseRequisition.findMany({
          where: { code: { startsWith: prefixPattern } },
          select: { code: true },
        })
      : table === "pi"
        ? await client.purchaseInquiry.findMany({
            where: { code: { startsWith: prefixPattern } },
            select: { code: true },
          })
        : table === "pq"
          ? await client.purchaseQuotation.findMany({
              where: { code: { startsWith: prefixPattern } },
              select: { code: true },
            })
          : table === "vrn"
            ? await client.vendorRejectionNote.findMany({
                where: { code: { startsWith: prefixPattern } },
                select: { code: true },
              })
            : await client.debitNote.findMany({
                where: { number: { startsWith: prefixPattern } },
                select: { number: true },
              });

  let maxNum = 0;
  for (const r of records) {
    const raw = (table === "dn" ? (r as any).number : (r as any).code).replace(prefixPattern, "");
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > maxNum) {
      maxNum = parsed;
    }
  }

  let nextNum = maxNum + 1;
  let candidate = `${prefixPattern}${String(nextNum).padStart(4, "0")}`;

  const checkExists = async (code: string) => {
    return table === "pr"
      ? await client.purchaseRequisition.findUnique({ where: { code }, select: { id: true } })
      : table === "pi"
        ? await client.purchaseInquiry.findUnique({ where: { code }, select: { id: true } })
        : table === "pq"
          ? await client.purchaseQuotation.findUnique({ where: { code }, select: { id: true } })
          : table === "vrn"
            ? await client.vendorRejectionNote.findUnique({ where: { code }, select: { id: true } })
            : await client.debitNote.findUnique({ where: { number: code }, select: { id: true } });
  };

  while (await checkExists(candidate)) {
    nextNum++;
    candidate = `${prefixPattern}${String(nextNum).padStart(4, "0")}`;
  }

  return candidate;
}

// ── Requisitions ────────────────────────────────────────────────────────────

const requisitionLineSchema = z.array(
  z.object({
    materialId: z.string().min(1, "Material is required."),
    quantityKg: z.number().positive("Quantity must be greater than 0."),
    remark: z.string().optional(),
  }),
).min(1, "Add at least one material line.");

const requisitionSchema = z.object({
  purpose: z.string().min(1, "Specify why the material is needed."),
  requiredBy: z.string().optional(),
  projectId: z.string().optional(),
  remark: z.string().optional(),
  lines: z.string().min(1, "Add at least one material line."),
});

export async function createPurchaseRequisition(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission("req:write");

  const parsed = requisitionSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the requisition." };

  let lines;
  try {
    lines = requisitionLineSchema.parse(JSON.parse(parsed.data.lines));
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { error: err.issues[0]?.message ?? "Add at least one valid material line with a quantity." };
    }
    return { error: "Add at least one valid material line with a quantity." };
  }

  // Look up current stock on hand for materials in lines to freeze stockAtRaiseKg
  const materialIds = lines.map((l) => l.materialId);
  const batches = await prisma.inventoryBatch.findMany({
    where: {
      materialId: { in: materialIds },
      status: { in: ["AVAILABLE", "QUARANTINE"] },
    },
    select: { materialId: true, availableQtyKg: true },
  });

  const stockMap = new Map<string, number>();
  for (const b of batches) {
    stockMap.set(b.materialId, (stockMap.get(b.materialId) ?? 0) + Number(b.availableQtyKg));
  }

  let created;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = await nextCode("PR", "pr");
    try {
      created = await prisma.purchaseRequisition.create({
        data: {
          code,
          status: RequisitionStatus.DRAFT,
          purpose: parsed.data.purpose.trim(),
          requiredBy: parsed.data.requiredBy ? new Date(parsed.data.requiredBy) : null,
          projectId: parsed.data.projectId || null,
          remark: parsed.data.remark?.trim() || null,
          raisedById: user.id,
          lines: {
            create: lines.map((l, idx) => ({
              lineNo: idx + 1,
              materialId: l.materialId,
              quantityKg: l.quantityKg,
              orderedKg: 0,
              stockAtRaiseKg: stockMap.get(l.materialId) ?? 0,
              remark: l.remark?.trim() || null,
            })),
          },
        },
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
    return { error: "Failed to generate a unique requisition code. Please try again." };
  }

  await prisma.auditEvent.create({
    data: {
      entityType: "PurchaseRequisition",
      entityId: created.id,
      action: "CREATE",
      summary: `Raised requisition ${created.code}${created.purpose ? ` — ${created.purpose}` : ""}`,
      actorId: user.id,
    },
  });

  revalidatePath("/procurement/requisitions");
  redirect(`/procurement/requisitions/${created.id}`);
}

export async function submitRequisition(id: string): Promise<ActionState> {
  const user = await assertPermission("req:write");

  const req = await prisma.purchaseRequisition.findUnique({
    where: { id },
    select: { code: true, status: true, _count: { select: { lines: true } } },
  });
  if (!req) return { error: "That requisition no longer exists." };
  if (req.status !== RequisitionStatus.DRAFT) {
    return { error: `${req.code} has already been submitted — it is ${req.status.toLowerCase().replace(/_/g, " ")}.` };
  }
  if (req._count.lines === 0) {
    return { error: `${req.code} has no lines. Add what you need before sending it for approval.` };
  }

  await prisma.$transaction([
    prisma.purchaseRequisition.update({
      where: { id },
      data: { status: RequisitionStatus.PENDING_APPROVAL },
    }),
    prisma.auditEvent.create({
      data: {
        entityType: "PurchaseRequisition", entityId: id, action: "SUBMIT",
        summary: `Submitted ${req.code} for approval`, actorId: user.id,
      },
    }),
  ]);

  revalidatePath("/procurement/requisitions");
  revalidatePath(`/procurement/requisitions/${id}`);
  return { success: `${req.code} sent for approval.` };
}

export async function decideRequisition(
  id: string,
  approve: boolean,
  note: string,
): Promise<ActionState> {
  const user = await assertPermission("req:approve");

  const req = await prisma.purchaseRequisition.findUnique({
    where: { id },
    select: { code: true, status: true, raisedById: true },
  });
  if (!req) return { error: "That requisition no longer exists." };
  if (req.status !== RequisitionStatus.PENDING_APPROVAL) {
    return { error: `${req.code} is ${req.status.toLowerCase().replace(/_/g, " ")} — there is nothing to decide.` };
  }
  // Same separation the purchase line holds: nobody signs off their own demand.
  if (req.raisedById && req.raisedById === user.id) {
    return { error: `You raised ${req.code}. It needs approval from someone else.` };
  }
  if (!approve && !note.trim()) {
    return { error: "Give a reason for the rejection — the raiser has to be able to act on it." };
  }

  await prisma.$transaction([
    prisma.purchaseRequisition.update({
      where: { id },
      data: {
        status: approve ? RequisitionStatus.APPROVED : RequisitionStatus.REJECTED,
        approvedById: approve ? user.id : null,
        approvedAt: approve ? new Date() : null,
        decisionNote: note.trim() || null,
      },
    }),
    prisma.auditEvent.create({
      data: {
        entityType: "PurchaseRequisition", entityId: id,
        action: approve ? "APPROVE" : "REJECT",
        summary: `${approve ? "Approved" : "Rejected"} ${req.code}${note.trim() ? ` — ${note.trim()}` : ""}`,
        actorId: user.id,
      },
    }),
  ]);

  revalidatePath("/procurement/requisitions");
  revalidatePath(`/procurement/requisitions/${id}`);
  return { success: `${req.code} ${approve ? "approved" : "rejected"}.` };
}

// ── Inquiries ───────────────────────────────────────────────────────────────

const inquirySchema = z.object({
  requisitionId: z.string().min(1),
  vendorIds: z.array(z.string().min(1)).min(2, "Put the inquiry to at least two vendors — one quotation is not a comparison."),
  dueOn: z.string().optional(),
  terms: z.string().optional(),
});

/**
 * Raise an inquiry from an approved requisition, carrying its lines across.
 * This is the join that makes the chain walkable in both directions.
 */
export async function raiseInquiry(
  requisitionId: string,
  vendorIdsJson: string,
  dueOn: string,
  terms: string,
): Promise<ActionState & { inquiryId?: string }> {
  const user = await assertPermission("inquiry:write");

  let vendorIds: string[];
  try {
    vendorIds = JSON.parse(vendorIdsJson);
  } catch {
    return { error: "The vendor selection could not be read. Reload and try again." };
  }

  const parsed = inquirySchema.safeParse({ requisitionId, vendorIds, dueOn, terms });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the inquiry details." };
  }

  const req = await prisma.purchaseRequisition.findUnique({
    where: { id: requisitionId },
    select: { code: true, status: true, lines: { select: { id: true, materialId: true, quantityKg: true, lineNo: true } } },
  });
  if (!req) return { error: "That requisition no longer exists." };
  if (req.status === RequisitionStatus.DRAFT || req.status === RequisitionStatus.PENDING_APPROVAL) {
    return { error: `${req.code} is not approved yet. An inquiry can only go out against an approved requisition.` };
  }
  if (req.status === RequisitionStatus.REJECTED) {
    return { error: `${req.code} was rejected. Raise a fresh requisition rather than sourcing against this one.` };
  }

  const code = await nextCode("PI", "pi");
  const now = new Date();

  const inquiry = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseInquiry.create({
      data: {
        code,
        status: InquiryStatus.SENT,
        requisitionId,
        issuedOn: now,
        dueOn: dueOn ? new Date(dueOn) : null,
        terms: terms.trim() || null,
        raisedById: user.id,
        lines: {
          create: req.lines.map((l) => ({
            materialId: l.materialId,
            requisitionLineId: l.id,
            lineNo: l.lineNo,
            quantityKg: l.quantityKg,
          })),
        },
        vendors: { create: vendorIds.map((vendorId) => ({ vendorId, sentAt: now })) },
      },
    });

    await tx.auditEvent.create({
      data: {
        entityType: "PurchaseInquiry", entityId: created.id, action: "ISSUE",
        summary: `Issued ${code} to ${vendorIds.length} vendors against ${req.code}`,
        metadata: { requisition: req.code, vendorCount: vendorIds.length },
        actorId: user.id,
      },
    });

    return created;
  });

  revalidatePath("/procurement/inquiries");
  revalidatePath(`/procurement/requisitions/${requisitionId}`);
  return { success: `${code} issued to ${vendorIds.length} vendors.`, inquiryId: inquiry.id };
}

const vendorQuotationSchema = z.object({
  inquiryId: z.string().min(1, "Inquiry is required."),
  leadTimeDays: z.number().int().nonnegative("Lead time must be 0 or more days.").optional(),
  freight: z.number().nonnegative("Freight cannot be negative.").optional(),
  deliveryTerms: z.string().optional(),
  paymentTerms: z.string().optional(),
  lines: z
    .array(
      z.object({
        inquiryLineId: z.string().min(1, "Inquiry line is required."),
        materialId: z.string().min(1, "Material is required."),
        ratePerKg: z.number().positive("Rate per kg must be greater than 0."),
        taxPct: z.number().nonnegative().optional(),
      })
    )
    .min(1, "Enter rates for all requested material lines."),
});

export async function submitVendorQuotation(
  inquiryId: string,
  linesJson: string,
  leadTimeDays?: number,
  freight?: number,
  deliveryTerms?: string,
  paymentTerms?: string
): Promise<ActionState & { quotationId?: string }> {
  const user = await assertPermission("price:submit");
  if (user.role !== "VENDOR" || !user.vendorId) {
    return { error: "Only registered vendor users can submit quotations." };
  }
  const vendorId = user.vendorId;

  const inquiry = await prisma.purchaseInquiry.findUnique({
    where: { id: inquiryId },
    include: {
      lines: true,
      vendors: { select: { vendorId: true } },
    },
  });

  if (!inquiry) return { error: "That inquiry no longer exists." };
  if (inquiry.status === InquiryStatus.CLOSED || inquiry.status === InquiryStatus.CANCELLED) {
    return { error: `${inquiry.code} is closed or cancelled.` };
  }
  if (inquiry.status === InquiryStatus.COMPARED) {
    return { error: `${inquiry.code} has already been compared and closed for quotes.` };
  }

  const isInvited = inquiry.vendors.some((v) => v.vendorId === vendorId);
  if (!isInvited) {
    return { error: "Your company was not invited to quote on this inquiry." };
  }

  const existingQuote = await prisma.purchaseQuotation.findUnique({
    where: { inquiryId_vendorId: { inquiryId, vendorId } },
    select: { id: true, code: true },
  });
  if (existingQuote) {
    return { error: `Your company has already submitted quotation ${existingQuote.code} for this inquiry.` };
  }

  let parsedLines: Array<{ inquiryLineId: string; materialId: string; ratePerKg: number; taxPct?: number }>;
  try {
    parsedLines = JSON.parse(linesJson);
  } catch {
    return { error: "Invalid lines format. Reload and try again." };
  }

  const parseRes = vendorQuotationSchema.safeParse({
    inquiryId,
    leadTimeDays: leadTimeDays ? Number(leadTimeDays) : 0,
    freight: freight ? Number(freight) : 0,
    deliveryTerms,
    paymentTerms,
    lines: parsedLines,
  });

  if (!parseRes.success) {
    return { error: parseRes.error.issues[0]?.message ?? "Invalid quotation details." };
  }

  for (const inqLine of inquiry.lines) {
    const matched = parsedLines.find((l) => l.inquiryLineId === inqLine.id || l.materialId === inqLine.materialId);
    if (!matched || !matched.ratePerKg || matched.ratePerKg <= 0) {
      return { error: "Provide a valid rate for every requested material line." };
    }
  }

  const code = await nextCode("PQ", "pq");

  let subtotal = 0;
  let taxAmount = 0;
  const quoteLines = inquiry.lines.map((inqLine) => {
    const inputLine = parsedLines.find((l) => l.inquiryLineId === inqLine.id || l.materialId === inqLine.materialId)!;
    const rate = Number(inputLine.ratePerKg);
    const qty = Number(inqLine.quantityKg);
    const taxPct = inputLine.taxPct !== undefined ? Number(inputLine.taxPct) : 18;
    const lineTotal = Number((qty * rate).toFixed(2));
    const lineTax = Number(((lineTotal * taxPct) / 100).toFixed(2));

    subtotal += lineTotal;
    taxAmount += lineTax;

    return {
      materialId: inqLine.materialId,
      inquiryLineId: inqLine.id,
      lineNo: inqLine.lineNo,
      quantityKg: qty,
      ratePerKg: rate,
      taxPct,
      lineTotal,
    };
  });

  const freightVal = Number((freight ?? 0).toFixed(2));
  const totalValue = Number((subtotal + taxAmount + freightVal).toFixed(2));

  const quotation = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseQuotation.create({
      data: {
        code,
        status: QuotationStatus.SUBMITTED,
        inquiryId,
        vendorId,
        leadTimeDays: leadTimeDays ? Number(leadTimeDays) : null,
        deliveryTerms: deliveryTerms?.trim() || null,
        paymentTerms: paymentTerms?.trim() || null,
        subtotal: Number(subtotal.toFixed(2)),
        taxAmount: Number(taxAmount.toFixed(2)),
        freight: freightVal,
        totalValue,
        lines: { create: quoteLines },
      },
    });

    await tx.purchaseInquiryVendor.updateMany({
      where: { inquiryId, vendorId },
      data: { respondedAt: new Date() },
    });

    if (inquiry.status === InquiryStatus.SENT) {
      await tx.purchaseInquiry.update({
        where: { id: inquiryId },
        data: { status: InquiryStatus.QUOTES_IN },
      });
    }

    await tx.auditEvent.create({
      data: {
        entityType: "PurchaseQuotation",
        entityId: created.id,
        action: "SUBMIT",
        summary: `Vendor submitted quotation ${code} for ${inquiry.code}`,
        metadata: { inquiryCode: inquiry.code, totalValue },
        actorId: user.id,
      },
    });

    return created;
  });

  safeRevalidatePath("/procurement/inquiries");
  safeRevalidatePath(`/procurement/inquiries/${inquiryId}`);

  return { success: `Quotation ${code} submitted successfully.`, quotationId: quotation.id };
}

// ── Comparison ──────────────────────────────────────────────────────────────

/**
 * The decision the comparison exists for. Every other quotation on the inquiry
 * is closed at the same moment and told why, so the file explains itself later.
 */
export async function selectQuotation(quotationId: string, reason: string): Promise<ActionState> {
  const user = await assertPermission("quote:select");

  const quote = await prisma.purchaseQuotation.findUnique({
    where: { id: quotationId },
    select: {
      code: true, status: true, inquiryId: true, totalValue: true,
      vendor: { select: { name: true } },
      inquiry: { select: { code: true, status: true } },
    },
  });
  if (!quote) return { error: "That quotation no longer exists." };
  if (quote.status === QuotationStatus.SELECTED) {
    return { error: `${quote.code} is already the selected quotation on ${quote.inquiry.code}.` };
  }
  if (quote.status === QuotationStatus.EXPIRED) {
    return { error: `${quote.code} has expired. Ask ${quote.vendor.name} to requote before selecting it.` };
  }

  const siblings = await prisma.purchaseQuotation.findMany({
    where: { inquiryId: quote.inquiryId, id: { not: quotationId } },
    select: { id: true, totalValue: true },
  });
  const cheapest = Math.min(Number(quote.totalValue), ...siblings.map((s) => Number(s.totalValue)));
  const premium = Number(quote.totalValue) - cheapest;

  // Choosing a dearer quotation is allowed, but not silently.
  if (premium > 0 && !reason.trim()) {
    return {
      error: `${quote.code} is ₹${Math.round(premium).toLocaleString("en-IN")} above the lowest quotation. Give the reason before selecting it.`,
    };
  }

  await prisma.$transaction([
    prisma.purchaseQuotation.update({
      where: { id: quotationId },
      data: {
        status: QuotationStatus.SELECTED,
        selectedById: user.id,
        selectedAt: new Date(),
        decisionNote: reason.trim() || "Lowest landed cost against the same specification.",
      },
    }),
    prisma.purchaseQuotation.updateMany({
      where: { inquiryId: quote.inquiryId, id: { not: quotationId } },
      data: { status: QuotationStatus.REJECTED, decisionNote: `Higher landed cost than ${quote.vendor.name}.` },
    }),
    prisma.purchaseInquiry.update({
      where: { id: quote.inquiryId },
      data: { status: InquiryStatus.COMPARED },
    }),
    prisma.auditEvent.create({
      data: {
        entityType: "PurchaseQuotation", entityId: quotationId, action: "SELECT",
        summary: `Selected ${quote.code} from ${quote.vendor.name} on ${quote.inquiry.code}${premium > 0 ? ` — ₹${Math.round(premium).toLocaleString("en-IN")} above lowest` : " — lowest"}`,
        metadata: { premium, total: Number(quote.totalValue) },
        actorId: user.id,
      },
    }),
  ]);

  revalidatePath("/procurement/inquiries");
  revalidatePath(`/procurement/inquiries/${quote.inquiryId}`);
  return { success: `${quote.code} selected.` };
}

interface CreatePurchaseOrderLineInput {
  materialId: string;
  lineNo?: number;
  quantityKg: number;
  ratePerKg: number;
  taxPct?: number;
  requisitionLineId?: string | null;
}

interface CreatePurchaseOrderOptions {
  vendorId: string;
  requisitionId?: string | null;
  quotationId?: string | null;
  expectedOn?: Date | null;
  deliveryTerms?: string | null;
  paymentTerms?: string | null;
  freight?: number;
  remark?: string | null;
  actorId: string;
  auditSummary: (poCode: string, totalValue: number) => string;
  auditMetadata: Record<string, unknown>;
  lines: CreatePurchaseOrderLineInput[];
}

/**
 * Shared PO-creation logic used by both direct requisition conversion
 * and quotation selection paths. Handles PO-code generation, pricing/GST
 * calculation, approvalTier assignment, and concurrency-safe PR line updates
 * with row locks (SELECT ... FOR UPDATE) in one place.
 */
export async function createPurchaseOrderFromLines(
  opts: CreatePurchaseOrderOptions
): Promise<{ order?: { id: string; code: string; totalValue: any }; poCode?: string; totalValue?: number; error?: string }> {
  if (opts.lines.length === 0) {
    return { error: "No lines provided to create purchase order." };
  }

  // Unified pricing & GST calculation
  const pricedLines = opts.lines.map((l, i) => {
    const rate = Number(l.ratePerKg ?? 0);
    const qty = Number(l.quantityKg);
    const taxPct = l.taxPct !== undefined ? Number(l.taxPct) : 18;
    const lineTotal = Number((qty * rate).toFixed(2));
    return {
      materialId: l.materialId,
      lineNo: l.lineNo ?? i + 1,
      quantityKg: qty,
      ratePerKg: rate,
      taxPct,
      lineTotal,
      requisitionLineId: l.requisitionLineId ?? null,
    };
  });

  const subtotal = Number(pricedLines.reduce((a, l) => a + l.lineTotal, 0).toFixed(2));
  const taxAmount = Number(
    pricedLines.reduce((a, l) => a + (l.lineTotal * l.taxPct) / 100, 0).toFixed(2)
  );
  const freight = Number((opts.freight ?? 0).toFixed(2));
  const totalValue = Number((subtotal + taxAmount + freight).toFixed(2));
  const approvalTier =
    tierForValue(totalValue) === "MANAGEMENT" ? ApprovalTier.MANAGEMENT : ApprovalTier.HEAD;

  try {
    const order = await prisma.$transaction(async (tx) => {
      // If a requisition is associated, lock it and all its lines with SELECT ... FOR UPDATE
      if (opts.requisitionId) {
        const reqRows = await tx.$queryRaw<Array<{ id: string; code: string; status: RequisitionStatus }>>`
          SELECT id, code, status FROM "PurchaseRequisition" WHERE id = ${opts.requisitionId} FOR UPDATE
        `;
        const reqRow = reqRows[0];
        if (!reqRow) {
          throw new Error("That requisition no longer exists.");
        }
        if (
          reqRow.status !== RequisitionStatus.APPROVED &&
          reqRow.status !== RequisitionStatus.PARTIALLY_ORDERED
        ) {
          throw new Error(
            `${reqRow.code} is in status ${reqRow.status} — only APPROVED or PARTIALLY_ORDERED requisitions can be converted to a PO.`
          );
        }

        const reqLineRows = await tx.$queryRaw<
          Array<{
            id: string;
            materialId: string;
            lineNo: number;
            quantityKg: any;
            orderedKg: any;
          }>
        >`
          SELECT id, "materialId", "lineNo", "quantityKg", "orderedKg"
          FROM "PurchaseRequisitionLine"
          WHERE "requisitionId" = ${opts.requisitionId}
          FOR UPDATE
        `;

        for (const pl of pricedLines) {
          const matchedLine = reqLineRows.find(
            (r) =>
              (pl.requisitionLineId && r.id === pl.requisitionLineId) ||
              r.materialId === pl.materialId
          );
          if (!matchedLine) {
            throw new Error(`Requisition line for material not found on ${reqRow.code}.`);
          }

          const currentOrdered = Number(matchedLine.orderedKg);
          const maxQty = Number(matchedLine.quantityKg);
          const addingQty = Number(pl.quantityKg);

          if (addingQty <= 0) {
            throw new Error(`Quantity to order must be greater than 0.`);
          }

          if (currentOrdered + addingQty > maxQty + 0.0001) {
            const remaining = Math.max(0, maxQty - currentOrdered);
            throw new Error(
              `Cannot order ${addingQty} kg on ${reqRow.code}: only ${remaining.toFixed(3)} kg remaining uncommitted.`
            );
          }

          await tx.purchaseRequisitionLine.update({
            where: { id: matchedLine.id },
            data: { orderedKg: { increment: addingQty } },
          });
        }

        // Determine if all lines of the PR are now fully ordered
        let allLinesFullyOrdered = true;
        for (const r of reqLineRows) {
          const orderedInThisRun = pricedLines
            .filter(
              (pl) =>
                (pl.requisitionLineId && pl.requisitionLineId === r.id) ||
                pl.materialId === r.materialId
            )
            .reduce((sum, pl) => sum + pl.quantityKg, 0);

          const updatedOrdered = Number(r.orderedKg) + orderedInThisRun;
          if (updatedOrdered < Number(r.quantityKg) - 0.0001) {
            allLinesFullyOrdered = false;
          }
        }

        const newPrStatus = allLinesFullyOrdered
          ? RequisitionStatus.ORDERED
          : RequisitionStatus.PARTIALLY_ORDERED;

        await tx.purchaseRequisition.update({
          where: { id: opts.requisitionId },
          data: { status: newPrStatus },
        });
      }

      // Generate sequential PO code within transaction
      const year = new Date().getFullYear();
      const prefixPattern = `PO-${year}-`;
      const records = await tx.purchaseOrder.findMany({
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

      while (await tx.purchaseOrder.findUnique({ where: { code: candidate }, select: { id: true } })) {
        nextNum++;
        candidate = `${prefixPattern}${String(nextNum).padStart(4, "0")}`;
      }
      const poCode = candidate;

      const created = await tx.purchaseOrder.create({
        data: {
          code: poCode,
          status: PoStatus.PENDING_APPROVAL,
          vendorId: opts.vendorId,
          requisitionId: opts.requisitionId || null,
          quotationId: opts.quotationId || null,
          expectedOn: opts.expectedOn || null,
          deliveryTerms: opts.deliveryTerms || null,
          paymentTerms: opts.paymentTerms || null,
          approvalTier,
          subtotal,
          taxAmount,
          freight,
          totalValue,
          currency: "INR",
          raisedById: opts.actorId,
          remark: opts.remark || null,
          lines: {
            create: pricedLines.map((l) => ({
              materialId: l.materialId,
              lineNo: l.lineNo,
              quantityKg: l.quantityKg,
              ratePerKg: l.ratePerKg,
              taxPct: l.taxPct,
              lineTotal: l.lineTotal,
            })),
          },
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: "PurchaseOrder",
          entityId: created.id,
          action: "CREATE",
          summary: opts.auditSummary(poCode, totalValue),
          metadata: { ...opts.auditMetadata, poCode, totalValue } as any,
          actorId: opts.actorId,
        },
      });

      return created;
    });

    return { order, poCode: order.code, totalValue };
  } catch (err: any) {
    return { error: err.message || "Failed to create purchase order." };
  }
}

/**
 * Bypass the RFQ path and raise a PurchaseOrder directly from an approved
 * requisition. Used when the vendor and rate are already known — e.g. a sole
 * supplier, a standing contract, or a small urgent purchase.
 *
 * Rates are taken from material.currentPricePerKg (the approved rate) because
 * a requisition is a needs document and carries no prices. The PO lands in the
 * same PENDING_APPROVAL queue as any order created via the quotation path.
 */
export async function convertRequisitionToPO(
  requisitionId: string,
  vendorId: string,
  paymentTerms: string,
  deliveryTerms: string,
  expectedOn: string | null
): Promise<ActionState & { orderId?: string }> {
  const user = await assertPermission("po:write");

  const req = await prisma.purchaseRequisition.findUnique({
    where: { id: requisitionId },
    include: {
      lines: {
        orderBy: { lineNo: "asc" },
        include: {
          material: { select: { id: true, name: true, currentPricePerKg: true } },
        },
      },
    },
  });
  if (!req) return { error: "That requisition no longer exists." };
  if (
    req.status !== RequisitionStatus.APPROVED &&
    req.status !== RequisitionStatus.PARTIALLY_ORDERED
  ) {
    return { error: `${req.code} is not in an approved state — it cannot be converted to a PO.` };
  }
  if (req.lines.length === 0) {
    return { error: `${req.code} has no lines. Nothing to order.` };
  }

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, name: true, paymentTerms: true },
  });
  if (!vendor) return { error: "That vendor no longer exists." };

  // Calculate remaining uncommitted quantity for each line
  const linesToOrder = req.lines
    .map((l, i) => {
      const remainingKg = Math.max(0, Number(l.quantityKg) - Number(l.orderedKg));
      const rate = Number(l.material.currentPricePerKg ?? 0);
      return {
        materialId: l.materialId,
        lineNo: i + 1,
        quantityKg: remainingKg,
        ratePerKg: rate,
        taxPct: 18,
        requisitionLineId: l.id,
      };
    })
    .filter((l) => l.quantityKg > 0.0001);

  if (linesToOrder.length === 0) {
    return { error: `${req.code} has no remaining uncommitted quantity to order.` };
  }

  const res = await createPurchaseOrderFromLines({
    vendorId: vendor.id,
    requisitionId: req.id,
    quotationId: null,
    expectedOn: expectedOn ? new Date(expectedOn) : null,
    deliveryTerms: deliveryTerms || null,
    paymentTerms: paymentTerms || vendor.paymentTerms || null,
    freight: 0,
    remark: `Raised directly from ${req.code} — RFQ bypassed.`,
    actorId: user.id,
    auditSummary: (poCode, totalValue) =>
      `Raised ${poCode} directly from ${req.code} — ₹${totalValue.toFixed(2)} to ${vendor.name} (no RFQ)`,
    auditMetadata: { requisition: req.code, directConversion: true },
    lines: linesToOrder,
  });

  if (res.error || !res.order) {
    return { error: res.error || "Failed to create purchase order." };
  }

  safeRevalidatePath("/procurement/orders");
  safeRevalidatePath(`/procurement/requisitions/${requisitionId}`);
  return {
    success: `${res.poCode} raised against ${vendor.name}, awaiting approval.`,
    orderId: res.order.id,
  };
}

/**
 * Turn the winning quotation into a purchase order, rates unchanged.
 *
 * Re-pricing here would make the comparison decorative, so the lines are copied
 * exactly and the order lands in the same PENDING_APPROVAL queue as any other —
 * selecting a quotation sources the spend, it does not commit it.
 */
export async function createOrderFromQuotation(quotationId: string): Promise<ActionState & { orderId?: string }> {
  const user = await assertPermission("po:write");

  const quote = await prisma.purchaseQuotation.findUnique({
    where: { id: quotationId },
    include: {
      vendor: { select: { id: true, name: true, paymentTerms: true } },
      inquiry: { select: { requisitionId: true, code: true } },
      lines: {
        include: {
          inquiryLine: { select: { requisitionLineId: true } },
        },
      },
      orders: { select: { code: true } },
    },
  });
  if (!quote) return { error: "That quotation no longer exists." };
  if (quote.status !== QuotationStatus.SELECTED) {
    return { error: `${quote.code} has not been selected. Run the comparison first.` };
  }
  if (quote.orders.length > 0) {
    return { error: `${quote.code} has already been ordered as ${quote.orders[0]!.code}.` };
  }
  if (quote.lines.length === 0) {
    return { error: `${quote.code} has no priced lines.` };
  }

  const linesToOrder = quote.lines.map((l) => ({
    materialId: l.materialId,
    lineNo: l.lineNo,
    quantityKg: Number(l.quantityKg),
    ratePerKg: Number(l.ratePerKg),
    taxPct: Number(l.taxPct),
    requisitionLineId: l.inquiryLine?.requisitionLineId ?? null,
  }));

  const res = await createPurchaseOrderFromLines({
    vendorId: quote.vendor.id,
    quotationId: quote.id,
    requisitionId: quote.inquiry.requisitionId,
    expectedOn: quote.leadTimeDays
      ? new Date(Date.now() + quote.leadTimeDays * 86_400_000)
      : null,
    deliveryTerms: quote.deliveryTerms,
    paymentTerms: quote.paymentTerms ?? quote.vendor.paymentTerms,
    freight: Number(quote.freight),
    remark: `Raised from ${quote.code} against ${quote.inquiry.code}.`,
    actorId: user.id,
    auditSummary: (poCode, totalValue) =>
      `Raised ${poCode} from ${quote.code} — ₹${totalValue.toFixed(2)} to ${quote.vendor.name}`,
    auditMetadata: { quotation: quote.code },
    lines: linesToOrder,
  });

  if (res.error || !res.order) {
    return { error: res.error || "Failed to create purchase order." };
  }

  safeRevalidatePath("/procurement/orders");
  safeRevalidatePath(`/procurement/inquiries/${quote.inquiryId}`);
  if (quote.inquiry.requisitionId) {
    safeRevalidatePath(`/procurement/requisitions/${quote.inquiry.requisitionId}`);
  }
  return {
    success: `${res.poCode} raised from ${quote.code}, awaiting approval.`,
    orderId: res.order.id,
  };
}

// ── Vendor rejection notes ──────────────────────────────────────────────────

/**
 * Raise the note that gets rejected material back out of the gate. Built from
 * the GRN's own rejected quantities rather than typed again, because the two
 * disagreeing is how stock goes missing.
 */
export async function raiseRejectionNote(grnId: string): Promise<ActionState & { noteId?: string }> {
  const user = await assertPermission("vrn:write");

  const grn = await prisma.goodsReceipt.findUnique({
    where: { id: grnId },
    select: {
      code: true, vendorId: true,
      rejectionNotes: { select: { code: true } },
      lines: {
        where: { rejectedQtyKg: { gt: 0 } },
        select: {
          id: true, lineNo: true, rejectedQtyKg: true, qcRemark: true,
          purchaseOrderLine: { select: { materialId: true, ratePerKg: true } },
        },
      },
    },
  });
  if (!grn) return { error: "That goods receipt no longer exists." };
  if (grn.rejectionNotes.length > 0) {
    return { error: `${grn.code} already has a rejection note — ${grn.rejectionNotes[0]!.code}.` };
  }
  if (grn.lines.length === 0) {
    return { error: `Nothing on ${grn.code} was rejected. There is nothing to send back.` };
  }

  const code = await nextCode("VRN", "vrn");

  const note = await prisma.$transaction(async (tx) => {
    const created = await tx.vendorRejectionNote.create({
      data: {
        code,
        status: VrnStatus.DRAFT,
        goodsReceiptId: grnId,
        vendorId: grn.vendorId,
        raisedById: user.id,
        remark: `Raised against ${grn.code}.`,
        lines: {
          create: grn.lines.map((l, i) => ({
            grnLineId: l.id,
            materialId: l.purchaseOrderLine.materialId,
            lineNo: i + 1,
            quantityKg: l.rejectedQtyKg,
            ratePerKg: l.purchaseOrderLine.ratePerKg,
            reason: l.qcRemark,
          })),
        },
      },
    });

    await tx.auditEvent.create({
      data: {
        entityType: "VendorRejectionNote", entityId: created.id, action: "CREATE",
        summary: `Raised ${code} against ${grn.code} — ${grn.lines.length} rejected lines`,
        actorId: user.id,
      },
    });

    return created;
  });

  revalidatePath("/procurement/rejections");
  revalidatePath(`/procurement/grn/${grnId}`);
  return { success: `${code} raised against ${grn.code}.`, noteId: note.id };
}

export async function decideRejectionNote(
  id: string,
  approve: boolean,
  note: string,
): Promise<ActionState> {
  const user = await assertPermission("vrn:approve");

  const vrn = await prisma.vendorRejectionNote.findUnique({
    where: { id },
    select: { code: true, status: true, raisedById: true, vendor: { select: { name: true } } },
  });
  if (!vrn) return { error: "That rejection note no longer exists." };
  if (vrn.status !== VrnStatus.DRAFT && vrn.status !== VrnStatus.PENDING_APPROVAL) {
    return { error: `${vrn.code} is ${vrn.status.toLowerCase().replace(/_/g, " ")} — there is nothing to decide.` };
  }
  if (vrn.raisedById && vrn.raisedById === user.id) {
    return { error: `You raised ${vrn.code}. Approving a debit against ${vrn.vendor.name} needs a second pair of eyes.` };
  }

  await prisma.$transaction([
    prisma.vendorRejectionNote.update({
      where: { id },
      data: {
        status: approve ? VrnStatus.APPROVED : VrnStatus.CANCELLED,
        approvedById: approve ? user.id : null,
        approvedAt: approve ? new Date() : null,
        remark: note.trim() || undefined,
      },
    }),
    prisma.auditEvent.create({
      data: {
        entityType: "VendorRejectionNote", entityId: id,
        action: approve ? "APPROVE" : "CANCEL",
        summary: `${approve ? "Approved" : "Cancelled"} ${vrn.code}${note.trim() ? ` — ${note.trim()}` : ""}`,
        actorId: user.id,
      },
    }),
  ]);

  revalidatePath("/procurement/rejections");
  revalidatePath(`/procurement/rejections/${id}`);
  return { success: `${vrn.code} ${approve ? "approved for despatch" : "cancelled"}.` };
}

const dispatchSchema = z.object({
  challanNo: z.string().trim().min(1, "The challan number travels with the lorry — it cannot be blank."),
  vehicleNo: z.string().trim().optional(),
});

export async function dispatchRejectionNote(
  id: string,
  challanNo: string,
  vehicleNo: string,
): Promise<ActionState> {
  const user = await assertPermission("vrn:write");

  const parsed = dispatchSchema.safeParse({ challanNo, vehicleNo });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const vrn = await prisma.vendorRejectionNote.findUnique({
    where: { id },
    include: {
      vendor: { select: { name: true } },
      lines: {
        include: {
          grnLine: {
            select: { rejectedBatchId: true },
          },
        },
      },
    },
  });
  if (!vrn) return { error: "That rejection note no longer exists." };
  if (vrn.status !== VrnStatus.APPROVED) {
    return {
      error:
        vrn.status === VrnStatus.DISPATCHED || vrn.status === VrnStatus.CLOSED
          ? `${vrn.code} has already gone out.`
          : `${vrn.code} is not approved yet. Material cannot leave on an unapproved note.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.vendorRejectionNote.update({
      where: { id },
      data: {
        status: VrnStatus.DISPATCHED,
        challanNo: parsed.data.challanNo,
        vehicleNo: parsed.data.vehicleNo || null,
        dispatchedAt: new Date(),
      },
    });

    for (const line of vrn.lines) {
      if (line.grnLine?.rejectedBatchId) {
        const batch = await tx.inventoryBatch.findUnique({
          where: { id: line.grnLine.rejectedBatchId },
          select: { id: true, availableQtyKg: true, batchNo: true },
        });

        if (batch) {
          const available = Number(batch.availableQtyKg);
          const dispatchQty = Number(line.quantityKg);

          if (dispatchQty > available + 0.001) {
            throw new Error(`Cannot dispatch ${dispatchQty} kg from ${batch.batchNo} — only ${available} kg is available.`);
          }

          await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: {
              availableQtyKg: { decrement: line.quantityKg },
            },
          });

          await tx.stockMovement.create({
            data: {
              kind: MovementKind.RETURN_TO_VENDOR,
              materialId: line.materialId,
              batchId: batch.id,
              quantityKg: -Number(line.quantityKg),
              ratePerKg: line.ratePerKg,
              reference: vrn.code,
              remark: `Returned to ${vrn.vendor.name} on challan ${parsed.data.challanNo}`,
              userId: user.id,
              occurredAt: new Date(),
            },
          });
        }
      }
    }

    await tx.auditEvent.create({
      data: {
        entityType: "VendorRejectionNote", entityId: id, action: "DISPATCH",
        summary: `Despatched ${vrn.code} on challan ${parsed.data.challanNo}`,
        actorId: user.id,
      },
    });
  });

  revalidatePath("/procurement/rejections");
  revalidatePath(`/procurement/rejections/${id}`);
  revalidatePath("/procurement/inventory");
  revalidatePath("/procurement/ledger");
  return { success: `${vrn.code} despatched on ${parsed.data.challanNo}.` };
}

// ── Debit Notes ─────────────────────────────────────────────────────────────

export type DebitNoteLineInput = {
  grnLineId: string;
  quantityKg: number;
};

/**
 * Core business transaction to issue a Debit Note against a Vendor Bill for rejected GRN lines.
 *
 * All operations execute within a single database transaction:
 * 1. Validates bill exists, is not VOID, and belongs to the same GRN.
 * 2. Validates quantities do not exceed un-debited rejected quantities on GRN lines.
 * 3. Caps applied debit at the bill's open balance (total - paid - debited) and logs unapplied excess.
 * 4. Generates a collision-safe DN code (DN-YYYY-NNNN).
 * 5. Computes line-level tax from upstream PO line tax rates, absorbs rounding remainder on last line.
 * 6. Creates DebitNote and DebitNoteLine records.
 * 7. Increments VendorBill.debitedAmount and marks bill PAID if remaining balance is zero.
 * 8. Generates reversing LedgerPosting rows (DR 2000 Accounts Payable, CR 5000 Purchases) with sourceType DEBIT_NOTE.
 */
export async function raiseDebitNoteCore(
  userId: string,
  vendorBillId: string,
  lines: DebitNoteLineInput[],
  reason?: string,
): Promise<ActionState & { debitNoteId?: string; number?: string }> {
  if (!userId) {
    throw new Error("A valid session user ID is required to raise a debit note.");
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Fetch bill with postings and linked GRN
    const bill = await tx.vendorBill.findUnique({
      where: { id: vendorBillId },
      include: {
        postings: {
          include: { account: true },
        },
        goodsReceipt: {
          include: {
            lines: {
              include: {
                purchaseOrderLine: {
                  include: {
                    material: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!bill) {
      return { error: "Vendor bill not found." };
    }

    // 2. Validate bill status
    if (bill.status === VendorBillStatus.VOID) {
      return { error: `Cannot raise debit note against voided bill ${bill.code}.` };
    }

    // 3. Validate linked GRN
    if (!bill.goodsReceiptId || !bill.goodsReceipt) {
      return { error: `Bill ${bill.code} is not linked to a goods receipt.` };
    }

    const grn = bill.goodsReceipt;

    // Idempotency: skip if a debit note for this (goodsReceiptId, vendorBillId) already exists
    const existingDn = await tx.debitNote.findUnique({
      where: {
        goodsReceiptId_vendorBillId: {
          goodsReceiptId: grn.id,
          vendorBillId: bill.id,
        },
      },
      include: { lines: true },
    });

    if (existingDn && existingDn.status === DebitNoteStatus.ISSUED) {
      return {
        error: `Debit note ${existingDn.number} already issued for this bill and goods receipt.`,
        debitNoteId: existingDn.id,
        number: existingDn.number,
      };
    }

    // 4. Validate input lines
    if (!lines || lines.length === 0) {
      return { error: "At least one rejected GRN line must be specified to debit." };
    }

    for (const input of lines) {
      const grnLine = grn.lines.find((l) => l.id === input.grnLineId);
      if (!grnLine) {
        return { error: `GRN line ${input.grnLineId} does not belong to goods receipt ${grn.code}.` };
      }
      if (input.quantityKg <= 0) {
        return { error: `Debit quantity for line must be greater than zero.` };
      }
    }

    // 5. Validate quantity against un-debited rejected quantity
    const grnLineIds = lines.map((l) => l.grnLineId);
    const existingDebitLines = await tx.debitNoteLine.findMany({
      where: {
        grnLineId: { in: grnLineIds },
        debitNote: { status: DebitNoteStatus.ISSUED },
      },
      select: {
        grnLineId: true,
        quantity: true,
      },
    });

    const debitedByGrnLine: Record<string, number> = {};
    for (const edl of existingDebitLines) {
      if (edl.grnLineId) {
        debitedByGrnLine[edl.grnLineId] = (debitedByGrnLine[edl.grnLineId] || 0) + Number(edl.quantity);
      }
    }

    const round2 = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;
    const round3 = (num: number) => Math.round((num + Number.EPSILON) * 1000) / 1000;

    type PreparedLine = {
      grnLine: (typeof grn.lines)[0];
      quantityKg: number;
      ratePerKg: number;
      taxPct: number;
      taxableValue: number;
      taxAmount: number;
      totalValue: number;
    };

    const preparedLines: PreparedLine[] = [];

    for (const input of lines) {
      const grnLine = grn.lines.find((l) => l.id === input.grnLineId)!;
      const rejectedQty = Number(grnLine.rejectedQtyKg ?? 0);
      const alreadyDebited = debitedByGrnLine[grnLine.id] || 0;
      const availableDebitQty = Math.max(0, rejectedQty - alreadyDebited);

      if (input.quantityKg > availableDebitQty + 0.001) {
        return {
          error: `Line ${grnLine.lineNo}: debit quantity (${input.quantityKg} kg) exceeds remaining rejected quantity (${availableDebitQty.toFixed(3)} kg).`,
        };
      }

      const ratePerKg = Number(grnLine.purchaseOrderLine?.ratePerKg ?? 0);
      const taxPct = Number(grnLine.purchaseOrderLine?.taxPct ?? 18);

      const taxableValue = round2(input.quantityKg * ratePerKg);
      const taxAmount = round2((taxableValue * taxPct) / 100);
      const totalValue = round2(taxableValue + taxAmount);

      preparedLines.push({
        grnLine,
        quantityKg: input.quantityKg,
        ratePerKg,
        taxPct,
        taxableValue,
        taxAmount,
        totalValue,
      });
    }

    const totalDebitCalculated = round2(preparedLines.reduce((sum, l) => sum + l.totalValue, 0));
    const totalTaxableCalculated = round2(preparedLines.reduce((sum, l) => sum + l.taxableValue, 0));
    const totalTaxCalculated = round2(preparedLines.reduce((sum, l) => sum + l.taxAmount, 0));

    if (totalDebitCalculated <= 0) {
      return { error: "Debit note total calculated value must be greater than zero." };
    }

    // 6. Validate bill open balance: totalValue - paidAmount - debitedAmount
    const billTotal = Number(bill.totalValue);
    const billPaid = Number(bill.paidAmount);
    const billDebited = Number(bill.debitedAmount ?? 0);
    const openBalance = Math.max(0, round2(billTotal - billPaid - billDebited));

    if (openBalance <= 0.001) {
      await tx.auditEvent.create({
        data: {
          entityType: "VendorBill",
          entityId: bill.id,
          action: "UNAPPLIED_DEBIT",
          summary: `Debit note could not be applied: Bill ${bill.code} has zero remaining balance. Unapplied excess: ₹${totalDebitCalculated.toFixed(2)}`,
          metadata: {
            vendorBillId: bill.id,
            goodsReceiptId: grn.id,
            excessAmount: totalDebitCalculated,
            billTotal,
            billPaid,
            billDebited,
          },
          actorId: userId,
        },
      });

      return {
        error: `Bill ${bill.code} has no remaining balance to debit (total ₹${billTotal.toFixed(2)}, paid ₹${billPaid.toFixed(2)}, debited ₹${billDebited.toFixed(2)}). Excess of ₹${totalDebitCalculated.toFixed(2)} logged to audit trail.`,
      };
    }

    // Capping and unapplied excess handling
    let appliedTotal = totalDebitCalculated;
    let excess = 0;
    let isCapped = false;

    if (totalDebitCalculated > openBalance) {
      appliedTotal = openBalance;
      excess = round2(totalDebitCalculated - openBalance);
      isCapped = true;

      await tx.auditEvent.create({
        data: {
          entityType: "VendorBill",
          entityId: bill.id,
          action: "UNAPPLIED_DEBIT",
          summary: `Debit note capped at bill ${bill.code} remaining balance of ₹${openBalance.toFixed(2)}. Unapplied excess: ₹${excess.toFixed(2)}`,
          metadata: {
            vendorBillId: bill.id,
            goodsReceiptId: grn.id,
            excessAmount: excess,
            totalDebitCalculated,
            appliedDebitTotal: appliedTotal,
          },
          actorId: userId,
        },
      });
    }

    // 7. Scale lines if capped; allocate rounding remainder to last line
    const scale = isCapped && totalDebitCalculated > 0 ? appliedTotal / totalDebitCalculated : 1;
    const targetTotalValue = appliedTotal;
    const targetTaxAmount = isCapped ? round2(totalTaxCalculated * scale) : totalTaxCalculated;
    const targetTaxableValue = round2(targetTotalValue - targetTaxAmount);

    const totalQty = preparedLines.reduce((sum, l) => sum + l.quantityKg, 0);
    let sumScaledTotal = 0;
    let sumScaledTax = 0;
    let sumScaledTaxable = 0;
    let sumScaledQty = 0;

    const dnLinesData: Array<{
      grnLineId: string;
      materialId: string;
      description: string;
      quantity: number;
      unit: string;
      rate: number;
      taxPct: number;
      taxableValue: number;
      taxAmount: number;
      totalValue: number;
    }> = [];

    for (let i = 0; i < preparedLines.length; i++) {
      const item = preparedLines[i]!;
      const isLast = i === preparedLines.length - 1;

      let lineTotal: number;
      let lineTax: number;
      let lineTaxable: number;
      let lineQty: number;

      if (isLast) {
        lineTotal = round2(targetTotalValue - sumScaledTotal);
        lineTax = round2(targetTaxAmount - sumScaledTax);
        lineTaxable = round2(targetTaxableValue - sumScaledTaxable);
        lineQty = round3(isCapped ? totalQty * scale - sumScaledQty : item.quantityKg);
      } else {
        if (isCapped) {
          lineTaxable = round2(item.taxableValue * scale);
          lineTax = round2(item.taxAmount * scale);
          lineTotal = round2(lineTaxable + lineTax);
          lineQty = round3(item.quantityKg * scale);
        } else {
          lineTaxable = item.taxableValue;
          lineTax = item.taxAmount;
          lineTotal = item.totalValue;
          lineQty = item.quantityKg;
        }

        sumScaledTotal = round2(sumScaledTotal + lineTotal);
        sumScaledTax = round2(sumScaledTax + lineTax);
        sumScaledTaxable = round2(sumScaledTaxable + lineTaxable);
        sumScaledQty = round3(sumScaledQty + lineQty);
      }

      dnLinesData.push({
        grnLineId: item.grnLine.id,
        materialId: item.grnLine.purchaseOrderLine.materialId,
        description: item.grnLine.purchaseOrderLine.material?.name || "Rejected Material",
        quantity: lineQty,
        unit: "KG",
        rate: item.ratePerKg,
        taxPct: item.taxPct,
        taxableValue: lineTaxable,
        taxAmount: lineTax,
        totalValue: lineTotal,
      });
    }

    const headerTaxableValue = round2(dnLinesData.reduce((acc, l) => acc + l.taxableValue, 0));
    const headerTaxAmount = round2(dnLinesData.reduce((acc, l) => acc + l.taxAmount, 0));
    const headerTotalValue = round2(dnLinesData.reduce((acc, l) => acc + l.totalValue, 0));

    // 8. Generate sequence code
    const dnNumber = await nextCode("DN", "dn", tx);

    // 9. Create DebitNote record
    const debitNote = await tx.debitNote.create({
      data: {
        number: dnNumber,
        date: new Date(),
        vendorBillId: bill.id,
        goodsReceiptId: grn.id,
        vendorId: bill.vendorId,
        reason: reason?.trim() || "Debit note for rejected goods",
        taxableValue: headerTaxableValue,
        taxAmount: headerTaxAmount,
        totalValue: headerTotalValue,
        status: DebitNoteStatus.ISSUED,
        createdById: userId,
        lines: {
          create: dnLinesData,
        },
      },
    });

    // 10. Increment debitedAmount and settle status if remaining is 0
    const newDebited = round2(billDebited + headerTotalValue);
    const remainingAfterDebit = round2(billTotal - billPaid - newDebited);
    const newStatus = remainingAfterDebit <= 0.01 ? VendorBillStatus.PAID : bill.status;

    await tx.vendorBill.update({
      where: { id: bill.id },
      data: {
        debitedAmount: newDebited,
        status: newStatus,
      },
    });

    // 11. Reverse the bill's own postings
    let purchaseAccountId: string | undefined;
    let payableAccountId: string | undefined;
    let taxAccountId: string | undefined;

    for (const p of bill.postings) {
      if (p.sourceType === PostingSourceType.VENDOR_BILL) {
        if (p.side === PostingSide.DEBIT) {
          if (p.account?.code === "2100" || p.account?.code === "1500" || p.account?.name?.toLowerCase().includes("gst") || p.account?.name?.toLowerCase().includes("tax")) {
            taxAccountId = p.accountId;
          } else if (!purchaseAccountId) {
            purchaseAccountId = p.accountId;
          }
        } else if (p.side === PostingSide.CREDIT && !payableAccountId) {
          payableAccountId = p.accountId;
        }
      }
    }

    if (!payableAccountId) {
      const apCoa = await tx.chartOfAccount.findUnique({ where: { code: "2000" } });
      payableAccountId = apCoa?.id;
    }
    if (!purchaseAccountId) {
      const purCoa = await tx.chartOfAccount.findUnique({ where: { code: "5000" } });
      purchaseAccountId = purCoa?.id;
    }
    if (!taxAccountId && headerTaxAmount > 0) {
      const taxCoa = await tx.chartOfAccount.findFirst({
        where: {
          OR: [
            { code: "1500" },
            { code: "2100" },
            { name: { contains: "GST", mode: "insensitive" } },
            { name: { contains: "Tax", mode: "insensitive" } },
          ],
        },
      });
      taxAccountId = taxCoa?.id;
    }

    if (!payableAccountId || !purchaseAccountId) {
      throw new Error("Chart of accounts (2000 Accounts Payable, 5000 Purchases) missing for debit note posting.");
    }

    // Debit: Accounts Payable (reduces liability to vendor)
    await tx.ledgerPosting.create({
      data: {
        accountId: payableAccountId,
        side: PostingSide.DEBIT,
        amount: headerTotalValue,
        sourceType: PostingSourceType.DEBIT_NOTE,
        sourceId: bill.id,
        vendorBillId: bill.id,
        remark: `Debit note ${dnNumber} (Accounts Payable reduction) against bill ${bill.code}`,
      },
    });

    if (taxAccountId && headerTaxAmount > 0) {
      // Credit: Purchases (reverses purchase expense for taxable amount)
      await tx.ledgerPosting.create({
        data: {
          accountId: purchaseAccountId,
          side: PostingSide.CREDIT,
          amount: headerTaxableValue,
          sourceType: PostingSourceType.DEBIT_NOTE,
          sourceId: bill.id,
          vendorBillId: bill.id,
          remark: `Debit note ${dnNumber} (Purchases reversal) against bill ${bill.code}`,
        },
      });

      // Credit: Tax Account (reverses input tax)
      await tx.ledgerPosting.create({
        data: {
          accountId: taxAccountId,
          side: PostingSide.CREDIT,
          amount: headerTaxAmount,
          sourceType: PostingSourceType.DEBIT_NOTE,
          sourceId: bill.id,
          vendorBillId: bill.id,
          remark: `Debit note ${dnNumber} (Input GST reversal) against bill ${bill.code}`,
        },
      });
    } else {
      // Credit: Purchases (reverses purchase expense for full value)
      await tx.ledgerPosting.create({
        data: {
          accountId: purchaseAccountId,
          side: PostingSide.CREDIT,
          amount: headerTotalValue,
          sourceType: PostingSourceType.DEBIT_NOTE,
          sourceId: bill.id,
          vendorBillId: bill.id,
          remark: `Debit note ${dnNumber} (Purchases reversal) against bill ${bill.code}`,
        },
      });
    }

    // 12. Audit event for creation
    await tx.auditEvent.create({
      data: {
        entityType: "DebitNote",
        entityId: debitNote.id,
        action: "CREATE",
        summary: `Issued debit note ${dnNumber} for ₹${headerTotalValue.toFixed(2)} against bill ${bill.code}`,
        metadata: {
          vendorBillId: bill.id,
          goodsReceiptId: grn.id,
          number: dnNumber,
          totalValue: headerTotalValue,
          taxAmount: headerTaxAmount,
          taxableValue: headerTaxableValue,
          debitedAmount: newDebited,
          excess,
        },
        actorId: userId,
      },
    });

    safeRevalidatePath("/procurement/grn");
    safeRevalidatePath(`/procurement/grn/${grn.id}`);
    safeRevalidatePath("/finance/payable");
    safeRevalidatePath(`/finance/payable/${bill.id}`);

    return {
      success: `Debit note ${dnNumber} issued successfully.`,
      debitNoteId: debitNote.id,
      number: dnNumber,
    };
  });
}

/**
 * Server action to raise a Debit Note with RBAC permission check.
 */
export async function raiseDebitNote(
  vendorBillId: string,
  lines: DebitNoteLineInput[] | string,
  reason?: string,
): Promise<ActionState & { debitNoteId?: string; number?: string }> {
  let parsedLines: DebitNoteLineInput[];
  if (typeof lines === "string") {
    try {
      parsedLines = JSON.parse(lines);
    } catch {
      return { error: "Failed to parse debit note lines." };
    }
  } else {
    parsedLines = lines;
  }

  let user: AppSession;
  try {
    user = await assertPermission("vrn:write");
  } catch {
    user = await assertPermission("invoice:write");
  }

  if (!user?.id) {
    throw new Error("No authenticated user found in session.");
  }

  return raiseDebitNoteCore(user.id, vendorBillId, parsedLines, reason);
}

export type DebitableLine = {
  grnLineId: string;
  lineNo: number;
  materialId: string;
  materialName: string;
  materialCode: string;
  rejectedQtyKg: number;
  debitedQtyKg: number;
  availableQtyKg: number;
  ratePerKg: number;
  taxPct: number;
};

export async function getDebitableLinesForBill(vendorBillId: string): Promise<{
  bill: {
    id: string;
    code: string;
    billNo: string | null;
    totalValue: number;
    paidAmount: number;
    debitedAmount: number;
    openBalance: number;
    grnCode: string;
    grnId: string;
  } | null;
  lines: DebitableLine[];
  error?: string;
}> {
  let user: AppSession;
  try {
    user = await assertPermission("vrn:read");
  } catch {
    try {
      user = await assertPermission("po:read");
    } catch {
      user = await assertPermission("invoice:read");
    }
  }

  const bill = await prisma.vendorBill.findUnique({
    where: { id: vendorBillId },
    include: {
      goodsReceipt: {
        include: {
          lines: {
            include: {
              purchaseOrderLine: {
                include: {
                  material: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!bill) {
    return { bill: null, lines: [], error: "Vendor bill not found." };
  }

  if (!bill.goodsReceipt) {
    return { bill: null, lines: [], error: `Bill ${bill.code} is not linked to a goods receipt.` };
  }

  const grn = bill.goodsReceipt;
  const grnLineIds = grn.lines.map((l) => l.id);

  const existingDebitLines = await prisma.debitNoteLine.findMany({
    where: {
      grnLineId: { in: grnLineIds },
      debitNote: { status: DebitNoteStatus.ISSUED },
    },
    select: {
      grnLineId: true,
      quantity: true,
    },
  });

  const debitedByLine: Record<string, number> = {};
  for (const edl of existingDebitLines) {
    if (edl.grnLineId) {
      debitedByLine[edl.grnLineId] = (debitedByLine[edl.grnLineId] || 0) + Number(edl.quantity);
    }
  }

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

  const debitableLines: DebitableLine[] = grn.lines
    .map((l) => {
      const rejectedQty = Number(l.rejectedQtyKg ?? 0);
      const debitedQty = debitedByLine[l.id] || 0;
      const availableQty = Math.max(0, round3(rejectedQty - debitedQty));
      return {
        grnLineId: l.id,
        lineNo: l.lineNo,
        materialId: l.purchaseOrderLine.materialId,
        materialName: l.purchaseOrderLine.material?.name || "Material",
        materialCode: l.purchaseOrderLine.material?.code || "",
        rejectedQtyKg: rejectedQty,
        debitedQtyKg: debitedQty,
        availableQtyKg: availableQty,
        ratePerKg: Number(l.purchaseOrderLine?.ratePerKg ?? 0),
        taxPct: Number(l.purchaseOrderLine?.taxPct ?? 18),
      };
    })
    .filter((l) => l.availableQtyKg > 0.0001);

  const billTotal = Number(bill.totalValue);
  const billPaid = Number(bill.paidAmount);
  const billDebited = Number(bill.debitedAmount ?? 0);
  const openBalance = Math.max(0, round2(billTotal - billPaid - billDebited));

  return {
    bill: {
      id: bill.id,
      code: bill.code,
      billNo: bill.billNo,
      totalValue: billTotal,
      paidAmount: billPaid,
      debitedAmount: billDebited,
      openBalance,
      grnCode: grn.code,
      grnId: grn.id,
    },
    lines: debitableLines,
  };
}

