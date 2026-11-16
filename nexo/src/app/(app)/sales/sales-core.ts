import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  SalesInquiryStatus,
  CostSheetStatus,
  SalesQuotationStatus,
  SalesOrderStatus,
  ChallanStatus,
  SalesInvoiceStatus,
  SalesReturnStatus,
  ReturnResolution,
  QcResult,
  BatchStatus,
  MovementKind,
  PostingSide,
  PostingSourceType,
  PackingListStatus,
  CreditNoteStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ActionState = { error?: string; success?: string };

async function nextSeq(
  prefix: string,
  model: "salesOrder" | "deliveryChallan" | "salesInvoice" | "salesReturn" | "salesInquiry" | "costSheet" | "salesQuotation" | "packingList" | "creditNote",
  field: "code" | "number" = "code",
  client: any = prisma,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefixPattern = `${prefix}-${year}-`;

  const records = await (client[model] as any).findMany({
    where: { [field]: { startsWith: prefixPattern } },
    select: { [field]: true },
  });

  let maxNum = 0;
  for (const r of records) {
    const raw = (r[field] as string).replace(prefixPattern, "");
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > maxNum) {
      maxNum = parsed;
    }
  }

  let nextNum = maxNum + 1;
  let candidate = `${prefixPattern}${String(nextNum).padStart(4, "0")}`;

  while (await (client[model] as any).findUnique({ where: { [field]: candidate } })) {
    nextNum++;
    candidate = `${prefixPattern}${String(nextNum).padStart(4, "0")}`;
  }

  return candidate;
}

// ── Inquiry Core ──────────────────────────────────────────────────────────────

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

export async function createSalesInquiryCore(userId: string, form: FormData): Promise<ActionState & { inquiryId?: string }> {
  const parsed = salesInquiryFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check inquiry details." };
  }

  let rawLines;
  try {
    rawLines = salesInquiryLineSchema.parse(JSON.parse(parsed.data.lines));
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

  if (parsed.data.projectId) {
    const project = await prisma.project.findUnique({ where: { id: parsed.data.projectId } });
    if (!project) return { error: "Selected project does not exist." };
  }

  let created;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await nextSeq("INQ", "salesInquiry");
    try {
      created = await prisma.$transaction(async (tx) => {
        const inq = await tx.salesInquiry.create({
          data: {
            code,
            status: SalesInquiryStatus.OPEN,
            customerId: customer.id,
            projectId: parsed.data.projectId?.trim() || null,
            receivedOn: new Date(),
            requiredBy: parsed.data.requiredBy ? new Date(parsed.data.requiredBy) : null,
            source: parsed.data.source?.trim() || null,
            remark: parsed.data.remark?.trim() || null,
            ownerId: userId,
            lines: {
              create: rawLines.map((l, idx) => ({
                lineNo: idx + 1,
                description: l.description.trim(),
                quantityKg: l.quantityKg,
                targetRate: l.targetRate ?? null,
              })),
            },
          },
        });

        await tx.auditEvent.create({
          data: {
            entityType: "SalesInquiry",
            entityId: inq.id,
            action: "CREATE",
            summary: `Logged sales inquiry ${code} for ${customer.name}`,
            actorId: userId,
          },
        });

        return inq;
      });
      break;
    } catch (err: any) {
      const target = err?.meta?.target;
      const isCodeCollision =
        err?.code === "P2002" &&
        (Array.isArray(target)
          ? target.some((t: any) => typeof t === "string" && t.includes("code"))
          : typeof target === "string" && target.includes("code"));
      if (isCodeCollision && attempt < 4) {
        continue;
      }
      throw err;
    }
  }

  if (!created) {
    return { error: "Failed to generate a unique sales inquiry code. Please try again." };
  }

  revalidatePath("/sales/inquiries");
  redirect(`/sales/inquiries/${created.id}`);
}

// ── Cost Sheet Core ────────────────────────────────────────────────────────────

const costSheetFormSchema = z.object({
  formulationId: z.string().min(1, "Select a formulation"),
  conversionPerKg: z.coerce.number().min(0, "Conversion cost cannot be negative"),
  overheadPct: z.coerce.number().min(0, "Overhead % cannot be negative").default(0),
  marginPct: z.coerce.number().min(0, "Margin % cannot be negative"),
  remark: z.string().optional(),
});

export async function createCostSheetCore(userId: string, form: FormData): Promise<ActionState & { costSheetId?: string }> {
  const parsed = costSheetFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check cost sheet details." };
  }

  const formulation = await prisma.formulation.findUnique({
    where: { id: parsed.data.formulationId },
    include: {
      project: { select: { id: true, name: true } },
      lines: {
        include: {
          material: { select: { id: true, name: true, currentPricePerKg: true } },
        },
      },
    },
  });
  if (!formulation) return { error: "Selected formulation does not exist." };
  if (formulation.lines.length === 0) {
    return { error: "Formulation has no materials. Add formulation lines before building a cost sheet." };
  }

  const totalPhr = formulation.lines.reduce((sum, l) => sum + Number(l.phr), 0);
  if (totalPhr <= 0) return { error: "Formulation total PHR must be greater than 0." };

  let materialCostPerKg = 0;
  const sheetLinesData = formulation.lines.map((l, idx) => {
    const fractionKg = Number(l.phr) / totalPhr;
    const ratePerKg = Number(l.material.currentPricePerKg ?? 0);
    const costPerKg = fractionKg * ratePerKg;
    materialCostPerKg += costPerKg;
    return {
      lineNo: idx + 1,
      materialId: l.materialId,
      phr: l.phr,
      fractionKg: Number(fractionKg.toFixed(6)),
      ratePerKg,
      costPerKg: Number(costPerKg.toFixed(4)),
    };
  });

  const conversion = parsed.data.conversionPerKg;
  const overheadPct = parsed.data.overheadPct;
  const marginPct = parsed.data.marginPct;

  const overhead = (materialCostPerKg + conversion) * (overheadPct / 100);
  const totalCostBeforeMargin = materialCostPerKg + conversion + overhead;
  const sellingRatePerKg = Number((totalCostBeforeMargin * (1 + marginPct / 100)).toFixed(2));

  let created;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await nextSeq("CS", "costSheet");
    try {
      created = await prisma.$transaction(async (tx) => {
        const cs = await tx.costSheet.create({
          data: {
            code,
            status: CostSheetStatus.PENDING_APPROVAL,
            formulationId: formulation.id,
            materialCostPerKg: Number(materialCostPerKg.toFixed(4)),
            conversionPerKg: Number(conversion.toFixed(4)),
            overheadPct: Number(overheadPct.toFixed(2)),
            marginPct: Number(marginPct.toFixed(2)),
            sellingRatePerKg,
            preparedById: userId,
            remark: parsed.data.remark?.trim() || null,
            lines: { create: sheetLinesData },
          },
        });

        await tx.auditEvent.create({
          data: {
            entityType: "CostSheet",
            entityId: cs.id,
            action: "CREATE",
            summary: `Created cost sheet ${code} for ${formulation.project.name} at ₹${sellingRatePerKg.toFixed(2)}/kg (${marginPct}% margin)`,
            metadata: { sellingRatePerKg, marginPct },
            actorId: userId,
          },
        });

        return cs;
      });
      break;
    } catch (err: any) {
      const target = err?.meta?.target;
      const isCodeCollision =
        err?.code === "P2002" &&
        (Array.isArray(target)
          ? target.some((t: any) => typeof t === "string" && t.includes("code"))
          : typeof target === "string" && target.includes("code"));
      if (isCodeCollision && attempt < 4) {
        continue;
      }
      throw err;
    }
  }

  if (!created) {
    return { error: "Failed to generate a unique cost sheet code. Please try again." };
  }

  revalidatePath("/sales/cost-sheets");
  redirect(`/sales/cost-sheets/${created.id}`);
}

export async function decideCostSheetCore(userId: string, id: string, approve: boolean, note: string): Promise<ActionState> {
  const cs = await prisma.costSheet.findUnique({
    where: { id },
    select: {
      code: true, status: true, preparedById: true, marginPct: true,
      formulation: { select: { project: { select: { name: true } } } },
    },
  });
  if (!cs) return { error: "That cost sheet no longer exists." };
  if (cs.status !== CostSheetStatus.PENDING_APPROVAL && cs.status !== CostSheetStatus.DRAFT) {
    return { error: `${cs.code} is ${cs.status.toLowerCase().replace(/_/g, " ")} — there is nothing to decide.` };
  }
  if (cs.preparedById && cs.preparedById === userId) {
    return { error: `You prepared ${cs.code}. The margin needs a second signer.` };
  }
  if (!approve && !note.trim()) {
    return { error: "Say what needs changing — the preparer has to be able to rework it." };
  }

  await prisma.$transaction([
    prisma.costSheet.update({
      where: { id },
      data: {
        status: approve ? CostSheetStatus.APPROVED : CostSheetStatus.REJECTED,
        approvedById: approve ? userId : null,
        approvedAt: approve ? new Date() : null,
        decisionNote: note.trim() || null,
      },
    }),
    prisma.auditEvent.create({
      data: {
        entityType: "CostSheet", entityId: id,
        action: approve ? "APPROVE" : "REJECT",
        summary: `${approve ? "Approved" : "Rejected"} ${cs.code} for ${cs.formulation.project.name} at ${Number(cs.marginPct).toFixed(1)}% margin${note.trim() ? ` — ${note.trim()}` : ""}`,
        metadata: { marginPct: Number(cs.marginPct) },
        actorId: userId,
      },
    }),
  ]);

  revalidatePath("/sales/cost-sheets");
  revalidatePath(`/sales/cost-sheets/${id}`);
  return { success: `${cs.code} ${approve ? "approved" : "sent back"}.` };
}

// ── Sales Quotation Core ───────────────────────────────────────────────────────

const createQuotationFormSchema = z.object({
  customerId: z.string().min(1, "Select a customer"),
  inquiryId: z.string().optional(),
  costSheetId: z.string().optional(),
  validUntil: z.string().optional(),
  paymentTerms: z.string().optional(),
  deliveryTerms: z.string().optional(),
  leadTimeDays: z.coerce.number().min(0).optional(),
  remark: z.string().optional(),
  lines: z.string().min(1, "Add at least one line item"),
});

const quotationLineItemSchema = z.array(
  z.object({
    projectId: z.string().min(1, "Select a compound for each line"),
    quantityKg: z.coerce.number().positive("Quantity must be greater than 0"),
    ratePerKg: z.coerce.number().positive("Rate per kg must be greater than 0"),
    taxPct: z.coerce.number().min(0).default(18),
  }),
).min(1, "Add at least one line item");

export async function createSalesQuotationCore(userId: string, form: FormData): Promise<ActionState & { quotationId?: string }> {
  const parsed = createQuotationFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check quotation details." };
  }

  let rawLines;
  try {
    rawLines = quotationLineItemSchema.parse(JSON.parse(parsed.data.lines));
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

  if (parsed.data.inquiryId) {
    const inquiry = await prisma.salesInquiry.findUnique({
      where: { id: parsed.data.inquiryId },
      select: { code: true, status: true },
    });
    if (!inquiry) return { error: "Associated inquiry does not exist." };
    if (([SalesInquiryStatus.CLOSED, SalesInquiryStatus.LOST, SalesInquiryStatus.WON] as SalesInquiryStatus[]).includes(inquiry.status)) {
      return { error: `Inquiry ${inquiry.code} is ${inquiry.status.toLowerCase()} — quotations cannot be issued against it.` };
    }
  }

  let selectedCostSheet: { id: string; code: string; status: CostSheetStatus; sellingRatePerKg: any } | null = null;
  if (parsed.data.costSheetId) {
    selectedCostSheet = await prisma.costSheet.findUnique({
      where: { id: parsed.data.costSheetId },
      select: { id: true, code: true, status: true, sellingRatePerKg: true },
    });
    if (!selectedCostSheet) return { error: "Selected cost sheet does not exist." };
    if (selectedCostSheet.status !== CostSheetStatus.APPROVED) {
      return { error: `Cost sheet ${selectedCostSheet.code} is ${selectedCostSheet.status.toLowerCase().replace(/_/g, " ")}. Quotations require an approved cost sheet.` };
    }
  }

  for (const l of rawLines) {
    const project = await prisma.project.findUnique({
      where: { id: l.projectId },
      include: {
        formulation: {
          include: {
            costSheets: {
              where: { status: CostSheetStatus.APPROVED },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });
    if (!project) return { error: `Project for line item does not exist.` };

    const approvedCs = selectedCostSheet || project.formulation?.costSheets[0];
    if (approvedCs) {
      const floorRate = Number(approvedCs.sellingRatePerKg);
      if (l.ratePerKg < floorRate - 0.001) {
        return {
          error: `Quoted rate ₹${l.ratePerKg.toFixed(2)} for ${project.name} is below the approved floor rate ₹${floorRate.toFixed(2)} from cost sheet ${approvedCs.code}.`,
        };
      }
    }
  }

  const subtotal = rawLines.reduce((acc, l) => acc + l.quantityKg * l.ratePerKg, 0);
  const tax = rawLines.reduce((acc, l) => acc + (l.quantityKg * l.ratePerKg * (l.taxPct ?? 18)) / 100, 0);
  const total = Number((subtotal + tax).toFixed(2));

  let created;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await nextSeq("QTN", "salesQuotation");
    try {
      created = await prisma.$transaction(async (tx) => {
        const qtn = await tx.salesQuotation.create({
          data: {
            code,
            status: SalesQuotationStatus.SENT,
            customerId: customer.id,
            inquiryId: parsed.data.inquiryId || null,
            costSheetId: selectedCostSheet?.id || null,
            issuedOn: new Date(),
            validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : null,
            paymentTerms: parsed.data.paymentTerms?.trim() || null,
            deliveryTerms: parsed.data.deliveryTerms?.trim() || null,
            leadTimeDays: parsed.data.leadTimeDays ?? null,
            subtotal: Number(subtotal.toFixed(2)),
            taxAmount: Number(tax.toFixed(2)),
            totalValue: total,
            ownerId: userId,
            remark: parsed.data.remark?.trim() || null,
            lines: {
              create: rawLines.map((l, idx) => ({
                lineNo: idx + 1,
                projectId: l.projectId,
                quantityKg: l.quantityKg,
                ratePerKg: l.ratePerKg,
                taxPct: l.taxPct ?? 18,
                lineTotal: Number((l.quantityKg * l.ratePerKg).toFixed(2)),
              })),
            },
          },
        });

        if (parsed.data.inquiryId) {
          await tx.salesInquiry.update({
            where: { id: parsed.data.inquiryId },
            data: { status: SalesInquiryStatus.QUOTED },
          });
        }

        await tx.auditEvent.create({
          data: {
            entityType: "SalesQuotation",
            entityId: qtn.id,
            action: "CREATE",
            summary: `Created sales quotation ${code} — ₹${total.toFixed(2)} for ${customer.name}`,
            metadata: { totalValue: total },
            actorId: userId,
          },
        });

        return qtn;
      });
      break;
    } catch (err: any) {
      const target = err?.meta?.target;
      const isCodeCollision =
        err?.code === "P2002" &&
        (Array.isArray(target)
          ? target.some((t: any) => typeof t === "string" && t.includes("code"))
          : typeof target === "string" && target.includes("code"));
      if (isCodeCollision && attempt < 4) {
        continue;
      }
      throw err;
    }
  }

  if (!created) {
    return { error: "Failed to generate a unique quotation code. Please try again." };
  }

  revalidatePath("/sales/quotations");
  if (parsed.data.inquiryId) revalidatePath(`/sales/inquiries/${parsed.data.inquiryId}`);
  redirect(`/sales/quotations/${created.id}`);
}

export async function acceptQuotationCore(userId: string, quotationId: string): Promise<ActionState & { orderId?: string }> {
  const q = await prisma.salesQuotation.findUnique({
    where: { id: quotationId },
    include: {
      customer: { select: { id: true, name: true, paymentTerms: true, creditDays: true } },
      costSheet: { select: { code: true, status: true } },
      lines: true,
      orders: { select: { code: true } },
      inquiry: { select: { id: true } },
    },
  });
  if (!q) return { error: "That quotation no longer exists." };
  if (q.orders.length > 0) {
    return { error: `${q.code} has already been ordered as ${q.orders[0]!.code}.` };
  }
  if (q.status === SalesQuotationStatus.REJECTED || q.status === SalesQuotationStatus.EXPIRED) {
    return { error: `${q.code} is ${q.status.toLowerCase()}. Reissue it before taking an order against it.` };
  }
  if (q.status === SalesQuotationStatus.ACCEPTED) {
    return { error: `${q.code} has already been accepted.` };
  }
  if (q.lines.length === 0) return { error: `${q.code} has no priced lines.` };
  if (q.costSheet && q.costSheet.status !== CostSheetStatus.APPROVED) {
    return {
      error: `${q.code} rests on cost sheet ${q.costSheet.code}, which Finance has not approved. Get the margin signed before taking the order.`,
    };
  }

  const subtotal = q.lines.reduce((a, l) => a + Number(l.lineTotal), 0);
  const tax = q.lines.reduce((a, l) => a + (Number(l.lineTotal) * Number(l.taxPct)) / 100, 0);
  const total = Number((subtotal + tax).toFixed(2));

  let order;
  let code: string = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    code = await nextSeq("SO", "salesOrder");
    try {
      order = await prisma.$transaction(async (tx) => {
        if (q.validUntil) {
          const dateStr = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(q.validUntil);
          const endOfDay = new Date(`${dateStr}T23:59:59.999+05:30`);
          if (new Date() > endOfDay) {
            throw new Error(`Quotation expired on ${dateStr}`);
          }
        }

        const updatedQuotation = await tx.salesQuotation.updateMany({
          where: {
            id: q.id,
            status: { in: [SalesQuotationStatus.DRAFT, SalesQuotationStatus.SENT, SalesQuotationStatus.UNDER_NEGOTIATION] },
          },
          data: { status: SalesQuotationStatus.ACCEPTED, decisionNote: "Accepted at quoted rate." },
        });
        if (updatedQuotation.count === 0) {
          throw new Error(`${q.code} has already been accepted, rejected, or expired.`);
        }

        const created = await tx.salesOrder.create({
          data: {
            code,
            status: SalesOrderStatus.PENDING_APPROVAL,
            quotationId: q.id,
            customerId: q.customer.id,
            promisedOn: q.leadTimeDays ? new Date(Date.now() + q.leadTimeDays * 86_400_000) : null,
            paymentTerms: q.paymentTerms ?? q.customer.paymentTerms,
            deliveryTerms: q.deliveryTerms,
            subtotal: Number(subtotal.toFixed(2)),
            taxAmount: Number(tax.toFixed(2)),
            totalValue: total,
            raisedById: userId,
            remark: `Raised from ${q.code}.`,
            lines: {
              create: q.lines.map((l) => ({
                projectId: l.projectId,
                lineNo: l.lineNo,
                quantityKg: l.quantityKg,
                ratePerKg: l.ratePerKg,
                taxPct: l.taxPct,
                lineTotal: l.lineTotal,
              })),
            },
          },
        });

        if (q.inquiry) {
          await tx.salesInquiry.update({ where: { id: q.inquiry.id }, data: { status: SalesInquiryStatus.WON } });
        }
        await tx.auditEvent.create({
          data: {
            entityType: "SalesOrder", entityId: created.id, action: "CREATE",
            summary: `Raised ${code} from ${q.code} — ₹${total.toFixed(2)} from ${q.customer.name}`,
            metadata: { quotation: q.code, value: total },
            actorId: userId,
          },
        });

        return created;
      });
      break;
    } catch (err: any) {
      const target = err?.meta?.target;
      const isCodeCollision =
        err?.code === "P2002" &&
        (Array.isArray(target)
          ? target.some((t: any) => typeof t === "string" && t.includes("code"))
          : typeof target === "string" && target.includes("code"));
      if (isCodeCollision && attempt < 4) {
        continue;
      }
      throw err;
    }
  }

  if (!order) {
    return { error: "Failed to generate a unique sales order code. Please try again." };
  }

  revalidatePath("/sales/orders");
  revalidatePath("/sales/quotations");
  return { success: `${code} raised from ${q.code}, awaiting confirmation.`, orderId: order.id };
}

export async function rejectQuotationCore(
  userId: string,
  quotationId: string,
  reason: string
): Promise<ActionState> {
  const trimmedReason = reason?.trim();
  if (!trimmedReason) {
    return { error: "Rejection reason is required." };
  }

  const q = await prisma.salesQuotation.findUnique({
    where: { id: quotationId },
    include: {
      inquiry: { select: { id: true, code: true, status: true } },
    },
  });

  if (!q) return { error: "That quotation no longer exists." };
  if (q.status !== SalesQuotationStatus.SENT) {
    if (q.status === SalesQuotationStatus.ACCEPTED) {
      return { error: `${q.code} has already been accepted.` };
    }
    if (q.status === SalesQuotationStatus.REJECTED) {
      return { error: `${q.code} is already rejected.` };
    }
    return { error: `${q.code} is in status ${q.status.toLowerCase()} — only SENT quotations can be rejected.` };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const updatedQuotation = await tx.salesQuotation.updateMany({
        where: {
          id: q.id,
          status: SalesQuotationStatus.SENT,
        },
        data: {
          status: SalesQuotationStatus.REJECTED,
          decisionNote: trimmedReason,
        },
      });

      if (updatedQuotation.count === 0) {
        throw new Error(`${q.code} is no longer in SENT status and cannot be rejected.`);
      }

      let inquiryMovedToLost = false;
      if (q.inquiry) {
        const otherQuotations = await tx.salesQuotation.findMany({
          where: {
            inquiryId: q.inquiry.id,
            id: { not: q.id },
            status: { in: [SalesQuotationStatus.DRAFT, SalesQuotationStatus.SENT, SalesQuotationStatus.ACCEPTED] },
          },
          select: { id: true, validUntil: true },
        });

        const now = new Date();
        const liveCount = otherQuotations.filter((oq) => {
          if (!oq.validUntil) return true;
          const dateStr = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(oq.validUntil);
          const endOfDay = new Date(`${dateStr}T23:59:59.999+05:30`);
          return now <= endOfDay;
        }).length;

        if (liveCount === 0 && q.inquiry.status === SalesInquiryStatus.QUOTED) {
          await tx.salesInquiry.update({
            where: { id: q.inquiry.id },
            data: {
              status: SalesInquiryStatus.LOST,
              lostReason: `Quotation ${q.code} rejected: ${trimmedReason}`,
            },
          });
          inquiryMovedToLost = true;
        }
      }

      await tx.auditEvent.create({
        data: {
          entityType: "SalesQuotation",
          entityId: q.id,
          action: "REJECT",
          summary: `Rejected quotation ${q.code}${q.inquiry?.code ? ` on inquiry ${q.inquiry.code}` : ""}: ${trimmedReason}${inquiryMovedToLost && q.inquiry?.code ? ` (Inquiry ${q.inquiry.code} moved to LOST)` : ""}`,
          metadata: {
            quotationCode: q.code,
            inquiryCode: q.inquiry?.code ?? null,
            reason: trimmedReason,
            inquiryMovedToLost,
          },
          actorId: userId,
        },
      });
    });
  } catch (err: any) {
    return { error: err.message || "Failed to reject quotation." };
  }

  revalidatePath("/sales/quotations");
  revalidatePath(`/sales/quotations/${quotationId}`);
  return { success: `${q.code} rejected.` };
}

// ── Confirm Sales Order Core ────────────────────────────────────────────────

export async function confirmSalesOrderCore(
  userId: string,
  id: string,
  override: string
): Promise<ActionState> {
  const soInitial = await prisma.salesOrder.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      status: true,
      totalValue: true,
      raisedById: true,
      customerId: true,
    },
  });

  if (!soInitial) return { error: "That sales order no longer exists." };
  if (soInitial.status !== SalesOrderStatus.PENDING_APPROVAL && soInitial.status !== SalesOrderStatus.DRAFT) {
    return { error: `${soInitial.code} is ${soInitial.status.toLowerCase().replace(/_/g, " ")} — it cannot be confirmed from here.` };
  }
  if (soInitial.raisedById && soInitial.raisedById === userId) {
    return { error: `You raised ${soInitial.code}. Confirming it commits stock and credit — it needs another signer.` };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Lock the customer row first with a raw query: SELECT id FROM "Customer" WHERE id = $1 FOR UPDATE
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${soInitial.customerId} FOR UPDATE`;

      const customer = await tx.customer.findUnique({
        where: { id: soInitial.customerId },
        select: { id: true, name: true, creditLimit: true, outstandingAmt: true },
      });
      if (!customer) {
        throw new Error("Customer record not found.");
      }

      const so = await tx.salesOrder.findUnique({
        where: { id },
        select: {
          id: true,
          code: true,
          status: true,
          totalValue: true,
          raisedById: true,
        },
      });
      if (!so) {
        throw new Error("That sales order no longer exists.");
      }
      if (so.status !== SalesOrderStatus.PENDING_APPROVAL && so.status !== SalesOrderStatus.DRAFT) {
        throw new Error(`${so.code} is ${so.status.toLowerCase().replace(/_/g, " ")} — it cannot be confirmed from here.`);
      }
      if (so.raisedById && so.raisedById === userId) {
        throw new Error(`You raised ${so.code}. Confirming it commits stock and credit — it needs another signer.`);
      }

      // 2. Compute exposure = customer.outstandingAmt + SUM(max(0, order.totalValue - SUM(RAISED invoices))) of the customer's OTHER sales orders with status in (CONFIRMED, PARTIALLY_DISPATCHED, DISPATCHED) + this order's totalValue.
      const otherOrders = await tx.salesOrder.findMany({
        where: {
          customerId: customer.id,
          id: { not: so.id },
          status: { in: [SalesOrderStatus.CONFIRMED, SalesOrderStatus.PARTIALLY_DISPATCHED, SalesOrderStatus.DISPATCHED] },
        },
        select: {
          totalValue: true,
          invoices: {
            where: { status: SalesInvoiceStatus.RAISED },
            select: { totalValue: true },
          },
        },
      });

      const outstanding = Number(customer.outstandingAmt);
      const openOrders = otherOrders.reduce((sum, o) => {
        const invoicedTotal = o.invoices.reduce((invSum, inv) => invSum + Number(inv.totalValue), 0);
        return sum + Math.max(0, Number(o.totalValue) - invoicedTotal);
      }, 0);
      const thisOrderValue = Number(so.totalValue);
      const exposure = outstanding + openOrders + thisOrderValue;
      const limit = Number(customer.creditLimit);
      const trimmedOverride = override?.trim() ?? "";
      const overLimit = limit > 0 && exposure > limit;

      // 3. Compare exposure to creditLimit. Keep the existing named-override-reason and 4-eyes behavior unchanged. Include the exposure breakdown (outstanding, open orders, this order) in the error message.
      if (overLimit && !trimmedOverride) {
        return {
          error:
            `${customer.name} would be at ₹${Math.round(exposure).toLocaleString("en-IN")} against a ` +
            `₹${Math.round(limit).toLocaleString("en-IN")} limit (₹${Math.round(outstanding).toLocaleString("en-IN")} outstanding, ` +
            `₹${Math.round(openOrders).toLocaleString("en-IN")} in open orders, ` +
            `₹${Math.round(thisOrderValue).toLocaleString("en-IN")} this order). ` +
            `Record a reason to confirm past the limit.`,
        };
      }

      // 4. Set CONFIRMED only after the check, in the same transaction.
      const updateResult = await tx.salesOrder.updateMany({
        where: {
          id: so.id,
          status: { in: [SalesOrderStatus.PENDING_APPROVAL, SalesOrderStatus.DRAFT] },
        },
        data: {
          status: SalesOrderStatus.CONFIRMED,
          approvedById: userId,
          approvedAt: new Date(),
          remark: overLimit ? `Confirmed over credit limit: ${trimmedOverride}` : undefined,
        },
      });

      if (updateResult.count === 0) {
        throw new Error(`${so.code} has already been confirmed or modified.`);
      }

      await tx.auditEvent.create({
        data: {
          entityType: "SalesOrder",
          entityId: so.id,
          action: "CONFIRM",
          summary:
            `Confirmed ${so.code} — ₹${thisOrderValue.toFixed(2)}` +
            (overLimit
              ? ` OVER LIMIT (exposure ₹${exposure.toFixed(2)} vs ₹${limit.toFixed(2)}) — ${trimmedOverride}`
              : ""),
          metadata: {
            value: thisOrderValue,
            exposure,
            limit,
            outstanding,
            openOrders,
            overLimit,
          },
          actorId: userId,
        },
      });

      return {
        success: overLimit
          ? `${so.code} confirmed over the credit limit — the reason is on the record.`
          : `${so.code} confirmed.`,
      };
    });

    revalidatePath("/sales/orders");
    revalidatePath(`/sales/orders/${id}`);
    return result;
  } catch (err: any) {
    return { error: err.message || "Failed to confirm sales order." };
  }
}

// ── Stock Allocation Core ───────────────────────────────────────────────────

const allocSchema = z.array(
  z.object({ batchId: z.string().min(1), quantityKg: z.coerce.number().positive() }),
);

export async function allocateStockCore(
  userId: string,
  salesOrderLineId: string,
  picksJson: string,
): Promise<ActionState> {
  let picks: { batchId: string; quantityKg: number }[];
  try {
    picks = allocSchema.parse(JSON.parse(picksJson));
  } catch {
    return { error: "The allocation could not be read. Re-enter the quantities and try again." };
  }
  if (picks.length === 0) return { error: "Nothing was selected to allocate." };

  const line = await prisma.salesOrderLine.findUnique({
    where: { id: salesOrderLineId },
    select: {
      id: true, quantityKg: true, allocatedKg: true, dispatchedKg: true, reopenedKg: true, salesOrderId: true,
      salesOrder: { select: { code: true, status: true } },
      project: { select: { name: true } },
    },
  });
  if (!line) return { error: "That order line no longer exists." };
  if (line.salesOrder.status === SalesOrderStatus.CANCELLED) {
    return { error: `${line.salesOrder.code} is cancelled. Nothing can be reserved against it.` };
  }

  // Updated open capacity formula: (quantityKg + reopenedKg) - allocatedKg
  const open = (Number(line.quantityKg) + Number(line.reopenedKg)) - Number(line.allocatedKg);
  const asked = picks.reduce((a, p) => a + p.quantityKg, 0);
  if (asked > open + 0.001) {
    return {
      error: `Only ${open.toFixed(3)} kg of this line is still unallocated — you tried to reserve ${asked.toFixed(3)} kg.`,
    };
  }

  const batches = await prisma.inventoryBatch.findMany({
    where: { id: { in: picks.map((p) => p.batchId) } },
    select: { id: true, batchNo: true, availableQtyKg: true, status: true },
  });

  for (const p of picks) {
    const b = batches.find((x) => x.id === p.batchId);
    if (!b) return { error: "One of the batches no longer exists. Reload and try again." };
    if (b.status !== BatchStatus.AVAILABLE) {
      return { error: `${b.batchNo} is ${b.status.toLowerCase()} — it cannot be reserved.` };
    }
    if (p.quantityKg > Number(b.availableQtyKg) + 0.001) {
      return { error: `${b.batchNo} has only ${Number(b.availableQtyKg).toFixed(3)} kg available.` };
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const p of picks) {
      await tx.stockAllocation.create({
        data: {
          salesOrderLineId,
          batchId: p.batchId,
          quantityKg: p.quantityKg,
          allocatedById: userId,
        },
      });
      await tx.inventoryBatch.update({
        where: { id: p.batchId },
        data: { availableQtyKg: { decrement: p.quantityKg } },
      });
    }
    await tx.salesOrderLine.update({
      where: { id: salesOrderLineId },
      data: { allocatedKg: { increment: asked } },
    });
    await tx.auditEvent.create({
      data: {
        entityType: "SalesOrderLine", entityId: salesOrderLineId, action: "ALLOCATE",
        summary: `Reserved ${asked.toFixed(3)} kg across ${picks.length} ${picks.length === 1 ? "batch" : "batches"} for ${line.salesOrder.code} (${line.project.name})`,
        metadata: { quantityKg: asked, batches: picks.length },
        actorId: userId,
      },
    });
  });

  revalidatePath(`/sales/orders/${line.salesOrderId}`);
  revalidatePath("/procurement/inventory");
  return { success: `${asked.toFixed(3)} kg reserved.` };
}

export async function releaseAllocationCore(userId: string, allocationId: string): Promise<ActionState> {
  const alloc = await prisma.stockAllocation.findUnique({
    where: { id: allocationId },
    select: {
      id: true, quantityKg: true, isActive: true, batchId: true,
      batch: { select: { batchNo: true } },
      salesOrderLine: { select: { id: true, salesOrderId: true, salesOrder: { select: { code: true } } } },
    },
  });
  if (!alloc) return { error: "That allocation no longer exists." };
  if (!alloc.isActive) return { error: "That allocation has already been released or despatched." };

  const qty = Number(alloc.quantityKg);

  await prisma.$transaction([
    prisma.stockAllocation.update({ where: { id: allocationId }, data: { isActive: false } }),
    prisma.inventoryBatch.update({ where: { id: alloc.batchId }, data: { availableQtyKg: { increment: qty } } }),
    prisma.salesOrderLine.update({
      where: { id: alloc.salesOrderLine.id },
      data: { allocatedKg: { decrement: qty } },
    }),
    prisma.auditEvent.create({
      data: {
        entityType: "SalesOrderLine", entityId: alloc.salesOrderLine.id, action: "RELEASE",
        summary: `Released ${qty.toFixed(3)} kg of ${alloc.batch.batchNo} from ${alloc.salesOrderLine.salesOrder.code}`,
        actorId: userId,
      },
    }),
  ]);

  revalidatePath(`/sales/orders/${alloc.salesOrderLine.salesOrderId}`);
  revalidatePath("/procurement/inventory");
  return { success: `${qty.toFixed(3)} kg of ${alloc.batch.batchNo} released back to stock.` };
}


// ── Dispatch Order Core ─────────────────────────────────────────────────────

export async function dispatchOrderCore(
  userId: string,
  salesOrderId: string,
  vehicleNo: string,
  driverName: string,
): Promise<ActionState & { challanId?: string }> {
  const order = await prisma.salesOrder.findUnique({
    where: { id: salesOrderId },
    select: {
      code: true, status: true, customerId: true,
      customer: { select: { name: true } },
      lines: {
        select: {
          id: true, lineNo: true, quantityKg: true, dispatchedKg: true, reopenedKg: true, ratePerKg: true,
          project: { select: { name: true } },
          allocations: {
            where: { isActive: true },
            select: { id: true, quantityKg: true, batchId: true, batch: { select: { batchNo: true, materialId: true } } },
          },
        },
      },
    },
  });
  if (!order) return { error: "That sales order no longer exists." };
  if (order.status === SalesOrderStatus.PENDING_APPROVAL || order.status === SalesOrderStatus.DRAFT) {
    return { error: `${order.code} is not confirmed yet. Nothing can go out against an unconfirmed order.` };
  }
  if (order.status === SalesOrderStatus.CANCELLED) {
    return { error: `${order.code} is cancelled.` };
  }

  const toSend = order.lines.filter((l) => l.allocations.length > 0);
  if (toSend.length === 0) {
    return { error: `Nothing is reserved against ${order.code}. Allocate stock before despatching.` };
  }

  const code = await nextSeq("DC", "deliveryChallan");
  const now = new Date();

  const challan = await prisma.$transaction(async (tx) => {
    const created = await tx.deliveryChallan.create({
      data: {
        code,
        status: ChallanStatus.DISPATCHED,
        salesOrderId,
        customerId: order.customerId,
        packedOn: now,
        dispatchedOn: now,
        vehicleNo: vehicleNo.trim() || null,
        driverName: driverName.trim() || null,
        raisedById: userId,
      },
    });

    let lineNo = 0;
    let totalKg = 0;

    for (const line of toSend) {
      for (const alloc of line.allocations) {
        lineNo++;
        const qty = Number(alloc.quantityKg);
        totalKg += qty;

        await tx.deliveryChallanLine.create({
          data: {
            challanId: created.id,
            salesOrderLineId: line.id,
            batchId: alloc.batchId,
            lineNo,
            quantityKg: qty,
            ratePerKg: line.ratePerKg,
          },
        });

        await tx.stockAllocation.update({ where: { id: alloc.id }, data: { isActive: false } });
        await tx.stockMovement.create({
          data: {
            kind: MovementKind.ISSUE_TO_PRODUCTION,
            materialId: alloc.batch.materialId,
            batchId: alloc.batchId,
            quantityKg: -qty,
            ratePerKg: line.ratePerKg,
            reference: code,
            remark: `Despatched to ${order.customer.name} against ${order.code}`,
            userId,
            occurredAt: now,
          },
        });

        const batch = await tx.inventoryBatch.findUnique({ where: { id: alloc.batchId }, select: { receivedQtyKg: true, availableQtyKg: true } });
        if (batch && Number(batch.availableQtyKg) <= 0.5) {
          await tx.inventoryBatch.update({ where: { id: alloc.batchId }, data: { status: BatchStatus.CONSUMED } });
        }
      }

      const lineSent = line.allocations.reduce((a, x) => a + Number(x.quantityKg), 0);
      await tx.salesOrderLine.update({
        where: { id: line.id },
        data: { dispatchedKg: { increment: lineSent } },
      });
    }

    await tx.deliveryChallan.update({
      where: { id: created.id },
      data: { packageCnt: Math.max(1, Math.round(totalKg / 25)), grossKg: Number((totalKg * 1.004).toFixed(3)) },
    });

    const after = await tx.salesOrderLine.findMany({
      where: { salesOrderId },
      select: { quantityKg: true, dispatchedKg: true, reopenedKg: true },
    });
    // Updated completion check: dispatchedKg >= (quantityKg + reopenedKg) - 0.001
    const complete = after.every((l) => Number(l.dispatchedKg) >= (Number(l.quantityKg) + Number(l.reopenedKg)) - 0.001);

    await tx.salesOrder.update({
      where: { id: salesOrderId },
      data: { status: complete ? SalesOrderStatus.DISPATCHED : SalesOrderStatus.PARTIALLY_DISPATCHED },
    });

    await tx.auditEvent.create({
      data: {
        entityType: "DeliveryChallan", entityId: created.id, action: "DISPATCH",
        summary: `Despatched ${code} against ${order.code} — ${totalKg.toFixed(3)} kg to ${order.customer.name}`,
        metadata: { quantityKg: totalKg, complete },
        actorId: userId,
      },
    });

    return created;
  });

  revalidatePath(`/sales/orders/${salesOrderId}`);
  revalidatePath("/sales/dispatch");
  revalidatePath("/procurement/inventory");
  return { success: `${code} despatched.`, challanId: challan.id };
}

// ── Raise Invoice Core ─────────────────────────────────────────────────────

export async function raiseInvoiceCore(userId: string, challanId: string): Promise<ActionState & { invoiceId?: string }> {
  const dc = await prisma.deliveryChallan.findUnique({
    where: { id: challanId },
    include: {
      customer: { select: { id: true, name: true, creditDays: true } },
      invoices: { select: { code: true } },
      salesOrder: {
        select: {
          id: true,
          code: true,
          returns: {
            select: {
              id: true,
              code: true,
              status: true,
              lines: { select: { quantityKg: true, restockedKg: true, scrappedKg: true, salesOrderLineId: true } },
            },
          },
          lines: { select: { id: true, quantityKg: true, dispatchedKg: true, reopenedKg: true } },
        },
      },
      lines: {
        select: {
          id: true,
          salesOrderLineId: true,
          quantityKg: true,
          ratePerKg: true,
          salesOrderLine: {
            select: {
              taxPct: true,
            },
          },
        },
      },
    },
  });
  if (!dc) return { error: "That challan no longer exists." };
  if (dc.invoices.length > 0) {
    return { error: `${dc.code} has already been invoiced as ${dc.invoices[0]!.code}.` };
  }
  if (dc.status === ChallanStatus.DRAFT || dc.status === ChallanStatus.CANCELLED) {
    return { error: `${dc.code} has not gone out. Despatch it before invoicing.` };
  }

  // Unsettled Return Guard (Condition 2):
  const pendingReturns = dc.salesOrder.returns.filter(
    (r) => r.status === SalesReturnStatus.DRAFT || r.status === SalesReturnStatus.PENDING_QC
  );
  if (pendingReturns.length > 0) {
    return {
      error: `Cannot invoice ${dc.code} while order ${dc.salesOrder.code} has a pending sales return (${pendingReturns[0]!.code}). Settle the return first.`,
    };
  }

  // Net Quantity Invoicing (Condition 2):
  // Calculate subtotal from net un-returned quantity for each line on this challan,
  // applying returns in FIFO order across the order's delivery challans.
  const orderChallans = await prisma.deliveryChallan.findMany({
    where: { salesOrderId: dc.salesOrderId, status: ChallanStatus.DISPATCHED },
    orderBy: { dispatchedOn: "asc" },
    include: { lines: { select: { salesOrderLineId: true, quantityKg: true } } },
  });

  const round2 = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

  let subtotalAcc = 0;
  let taxAcc = 0;
  for (const l of dc.lines) {
    if (l.salesOrderLine?.taxPct == null) {
      throw new Error(`taxPct is missing or null on challan line ${l.id} (SO line ${l.salesOrderLineId})`);
    }

    const lineReturns = dc.salesOrder.returns
      .filter((r) => r.status !== SalesReturnStatus.DRAFT && r.status !== SalesReturnStatus.PENDING_QC)
      .flatMap((r) => r.lines)
      .filter((rl) => rl.salesOrderLineId === l.salesOrderLineId);

    let unabsorbedReturn = lineReturns.reduce((acc, rl) => acc + (Number(rl.restockedKg) + Number(rl.scrappedKg)), 0);

    for (const priorDc of orderChallans) {
      if (priorDc.id === challanId) break;
      const priorLine = priorDc.lines.find((pl) => pl.salesOrderLineId === l.salesOrderLineId);
      if (priorLine) {
        const absorbed = Math.min(unabsorbedReturn, Number(priorLine.quantityKg));
        unabsorbedReturn -= absorbed;
      }
    }

    const currentChallanQty = Number(l.quantityKg);
    const returnForCurrentChallan = Math.min(unabsorbedReturn, currentChallanQty);
    const netQty = Math.max(0, currentChallanQty - returnForCurrentChallan);

    const netLineAmount = netQty * Number(l.ratePerKg);
    subtotalAcc += netLineAmount;

    const lineTax = round2((netLineAmount * Number(l.salesOrderLine.taxPct)) / 100);
    taxAcc += lineTax;
  }

  const subtotal = round2(subtotalAcc);
  const tax = round2(taxAcc);
  const total = round2(subtotal + tax);
  const invoiceDate = new Date();
  const dueOn = new Date(invoiceDate.getTime() + dc.customer.creditDays * 86_400_000);

  const code = await nextSeq("INV", "salesInvoice");

  const arAccount = await prisma.chartOfAccount.findUnique({ where: { code: "1100" } });
  const revenueAccount = await prisma.chartOfAccount.findUnique({ where: { code: "4000" } });
  const outputTaxAccount = await prisma.chartOfAccount.findUnique({ where: { code: "2100" } });

  if (!arAccount || !revenueAccount || !outputTaxAccount) {
    return {
      error:
        "Required financial accounts (Accounts Receivable 1100, Output GST Payable 2100, or Sales Revenue 4000) are missing. Please run the seed:fin script to initialize the Chart of Accounts.",
    };
  }

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.salesInvoice.create({
      data: {
        code,
        status: SalesInvoiceStatus.RAISED,
        salesOrderId: dc.salesOrderId,
        challanId,
        customerId: dc.customerId,
        invoiceDate,
        dueOn,
        subtotal,
        taxAmount: tax,
        totalValue: total,
        raisedById: userId,
      },
    });

    await tx.ledgerPosting.create({
      data: {
        accountId: arAccount.id,
        side: PostingSide.DEBIT,
        amount: total,
        sourceType: PostingSourceType.SALES_INVOICE,
        sourceId: created.id,
        remark: `Invoice ${code} raised for ${dc.customer.name}`,
      },
    });

    await tx.ledgerPosting.create({
      data: {
        accountId: revenueAccount.id,
        side: PostingSide.CREDIT,
        amount: subtotal,
        sourceType: PostingSourceType.SALES_INVOICE,
        sourceId: created.id,
        remark: `Revenue for invoice ${code}`,
      },
    });

    await tx.ledgerPosting.create({
      data: {
        accountId: outputTaxAccount.id,
        side: PostingSide.CREDIT,
        amount: tax,
        sourceType: PostingSourceType.SALES_INVOICE,
        sourceId: created.id,
        remark: `Output GST for invoice ${code}`,
      },
    });

    await tx.customer.update({
      where: { id: dc.customerId },
      data: { outstandingAmt: { increment: total } },
    });

    const lines = dc.salesOrder.lines;
    // Updated order completion check for INVOICED status: dispatchedKg >= (quantityKg + reopenedKg) - 0.001
    if (lines.every((l) => Number(l.dispatchedKg) >= (Number(l.quantityKg) + Number(l.reopenedKg)) - 0.001)) {
      await tx.salesOrder.update({
        where: { id: dc.salesOrderId },
        data: { status: SalesOrderStatus.INVOICED },
      });
    }

    await tx.auditEvent.create({
      data: {
        entityType: "SalesInvoice", entityId: created.id, action: "RAISE_INVOICE",
        summary: `Raised invoice ${code} for ${dc.customer.name} — ₹${total.toFixed(2)}`,
        metadata: { subtotal, taxAmount: tax, totalValue: total },
        actorId: userId,
      },
    });

    return created;
  });

  revalidatePath(`/sales/dispatch/${challanId}`);
  revalidatePath("/sales/invoices");
  revalidatePath(`/sales/orders/${dc.salesOrderId}`);
  return { success: `Invoice ${code} raised for ₹${total.toFixed(2)}.`, invoiceId: invoice.id };
}

// ── Sales Return Inspection & Decision Core ─────────────────────────────────────

const returnQcSchema = z.array(
  z.object({
    lineId: z.string(),
    restockedKg: z.coerce.number().min(0),
    scrappedKg: z.coerce.number().min(0),
    resendKg: z.coerce.number().min(0).default(0),
    qcResult: z.nativeEnum(QcResult),
    qcRemark: z.string().optional(),
  }),
);

export async function inspectSalesReturnCore(
  userId: string,
  returnId: string,
  linesJson: string,
  remark: string,
): Promise<ActionState> {
  let lines;
  try {
    lines = returnQcSchema.parse(JSON.parse(linesJson));
  } catch {
    return { error: "The inspection results could not be read. Re-enter and try again." };
  }

  const srn = await prisma.salesReturn.findUnique({
    where: { id: returnId },
    select: {
      id: true,
      code: true,
      reason: true,
      status: true,
      returnedOn: true,
      customerId: true,
      salesOrderId: true,
      resolution: true,
      customer: { select: { name: true } },
      salesOrder: {
        select: {
          id: true,
          code: true,
          status: true,
          customerId: true,
          paymentTerms: true,
          deliveryTerms: true,
          lines: { select: { id: true, lineNo: true, ratePerKg: true, taxPct: true, dispatchedKg: true, reopenedKg: true, quantityKg: true } },
          invoices: {
            where: { status: { in: [SalesInvoiceStatus.RAISED, SalesInvoiceStatus.PART_PAID, SalesInvoiceStatus.PAID, SalesInvoiceStatus.OVERDUE] } },
            select: { id: true, code: true, status: true, challanId: true },
          },
          challans: {
            where: { status: ChallanStatus.DISPATCHED },
            select: {
              id: true,
              lines: { select: { id: true, salesOrderLineId: true } },
              invoices: {
                where: { status: { in: [SalesInvoiceStatus.RAISED, SalesInvoiceStatus.PART_PAID, SalesInvoiceStatus.PAID, SalesInvoiceStatus.OVERDUE] } },
                select: { id: true, code: true, status: true },
              },
            },
          },
        },
      },
      lines: {
        select: {
          id: true,
          lineNo: true,
          quantityKg: true,
          salesOrderLineId: true,
          projectId: true,
          project: {
            select: {
              name: true,
              formulation: { select: { lines: { orderBy: { phr: "desc" }, take: 1, select: { materialId: true } } } },
            },
          },
        },
      },
    },
  });
  if (!srn) return { error: "That return no longer exists." };
  if (srn.status === SalesReturnStatus.RESTOCKED || srn.status === SalesReturnStatus.SCRAPPED || srn.status === SalesReturnStatus.PARTIALLY_RESTOCKED) {
    return { error: `${srn.code} has already been settled.` };
  }

  for (const input of lines) {
    const line = srn.lines.find((l) => l.id === input.lineId);
    if (!line) continue;
    if (input.restockedKg + input.scrappedKg > Number(line.quantityKg) + 0.001) {
      return {
        error: `Line ${line.lineNo}: restocked plus scrapped cannot exceed the ${Number(line.quantityKg).toFixed(3)} kg that came back.`,
      };
    }
    if (input.resendKg > input.restockedKg + input.scrappedKg + 0.001) {
      return {
        error: `Line ${line.lineNo}: resend quantity (${input.resendKg.toFixed(3)} kg) cannot exceed total returned quantity (${(input.restockedKg + input.scrappedKg).toFixed(3)} kg).`,
      };
    }
  }

  const store = await prisma.warehouse.findFirst({ where: { kind: "STORE", isActive: true }, orderBy: { code: "asc" }, select: { id: true } });
  const rejWh = await prisma.warehouse.findFirst({ where: { kind: "REJECTION", isActive: true }, select: { id: true } })
             || await prisma.warehouse.findFirst({ where: { kind: "STORE", isActive: true }, select: { id: true } });
  if (!store) return { error: "No active store warehouse is configured." };

  let totalRestocked = 0;
  let totalScrapped = 0;
  let totalResend = 0;

  const year = new Date().getFullYear();
  const prefixPattern = `B-${year}-`;

  let settled = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    totalRestocked = 0;
    totalScrapped = 0;
    totalResend = 0;
    try {
      await prisma.$transaction(async (tx) => {
        const lastYearBatch = await tx.inventoryBatch.findFirst({
          where: { batchNo: { startsWith: prefixPattern } },
          orderBy: { batchNo: "desc" },
          select: { batchNo: true },
        });
        const rawSuffix = lastYearBatch?.batchNo.slice(prefixPattern.length) ?? "0";
        let batchSeq = /^\d+$/.test(rawSuffix) ? parseInt(rawSuffix, 10) : 0;

        for (const input of lines) {
          const line = srn.lines.find((l) => l.id === input.lineId);
          if (!line) continue;

          await tx.salesReturnLine.update({
            where: { id: line.id },
            data: {
              restockedKg: input.restockedKg,
              scrappedKg: input.scrappedKg,
              resendKg: input.resendKg,
              qcResult: input.qcResult,
              qcRemark: input.qcRemark?.trim() || null,
            },
          });

          totalRestocked += input.restockedKg;
          totalScrapped += input.scrappedKg;
          totalResend += input.resendKg;

          const materialId = line.project.formulation?.lines[0]?.materialId;
          if (input.restockedKg > 0 && materialId) {
            batchSeq++;
            let candidate = `B-${year}-${String(batchSeq).padStart(5, "0")}`;
            while (await tx.inventoryBatch.findUnique({ where: { batchNo: candidate } })) {
              batchSeq++;
              candidate = `B-${year}-${String(batchSeq).padStart(5, "0")}`;
            }

            const batch = await tx.inventoryBatch.create({
              data: {
                batchNo: candidate,
                lotRef: `RET/${srn.code}`,
                materialId,
                status: BatchStatus.AVAILABLE,
                receivedQtyKg: input.restockedKg,
                availableQtyKg: input.restockedKg,
                ratePerKg: 0,
                warehouseId: store.id,
                receivedOn: new Date(),
              },
            });
            await tx.stockMovement.create({
              data: {
                kind: MovementKind.RETURN_TO_STORE,
                materialId,
                batchId: batch.id,
                quantityKg: input.restockedKg,
                reference: srn.code,
                remark: `Returned by ${srn.customer.name} against ${srn.salesOrder.code}, passed inspection`,
                userId,
              },
            });
          }

          if (input.scrappedKg > 0 && materialId && rejWh) {
            batchSeq++;
            let candidate = `B-${year}-${String(batchSeq).padStart(5, "0")}`;
            while (await tx.inventoryBatch.findUnique({ where: { batchNo: candidate } })) {
              batchSeq++;
              candidate = `B-${year}-${String(batchSeq).padStart(5, "0")}`;
            }

            const rejBatch = await tx.inventoryBatch.create({
              data: {
                batchNo: candidate,
                lotRef: `RET/${srn.code}/REJ`,
                materialId,
                status: BatchStatus.REJECTED,
                receivedQtyKg: input.scrappedKg,
                availableQtyKg: input.scrappedKg,
                ratePerKg: 0,
                warehouseId: rejWh.id,
                receivedOn: new Date(),
              },
            });

            await tx.stockMovement.create({
              data: {
                kind: MovementKind.SCRAP,
                materialId,
                batchId: rejBatch.id,
                quantityKg: -input.scrappedKg,
                reference: srn.code,
                remark: `Scrapped/rejected on inspection of ${srn.code} into ${rejWh.id}`,
                userId,
              },
            });
          }
        }

        const nextStatus =
          totalRestocked > 0 && totalScrapped > 0
            ? SalesReturnStatus.PARTIALLY_RESTOCKED
            : totalRestocked > 0
              ? SalesReturnStatus.RESTOCKED
              : SalesReturnStatus.SCRAPPED;

        await tx.salesReturn.update({
          where: { id: returnId },
          data: { status: nextStatus, inspectedById: userId, inspectedAt: new Date(), qcRemark: remark.trim() || null },
        });

        // Resolution decision logic with atomic guard
        if (totalResend === 0) {
          const updatedReturn = await tx.salesReturn.updateMany({
            where: { id: returnId, resolution: null },
            data: { resolution: ReturnResolution.NONE, resolutionNote: "No resend quantity requested." },
          });
          if (updatedReturn.count === 0) throw new Error(`${srn.code} resolution has already been decided.`);
        } else {
          const so = srn.salesOrder;
          const isOrderOpen =
            so &&
            so.status !== SalesOrderStatus.CANCELLED &&
            so.status !== SalesOrderStatus.INVOICED &&
            so.status !== SalesOrderStatus.CLOSED;

          if (isOrderOpen) {
            // YES -> REOPENED_ORDER
            const updatedReturn = await tx.salesReturn.updateMany({
              where: { id: returnId, resolution: null },
              data: {
                resolution: ReturnResolution.REOPENED_ORDER,
                resolutionNote: `Reopened order ${so.code} for ${totalResend.toFixed(3)} kg resend quantity`,
              },
            });
            if (updatedReturn.count === 0) throw new Error(`${srn.code} resolution has already been decided.`);

            for (const input of lines) {
              if (input.resendKg > 0) {
                const line = srn.lines.find((l) => l.id === input.lineId);
                if (line && line.salesOrderLineId) {
                  await tx.salesOrderLine.update({
                    where: { id: line.salesOrderLineId },
                    data: { reopenedKg: { increment: input.resendKg } },
                  });
                }
              }
            }

            const newSoStatus =
              so.lines.some((l) => Number(l.dispatchedKg) > 0)
                ? SalesOrderStatus.PARTIALLY_DISPATCHED
                : SalesOrderStatus.CONFIRMED;

            await tx.salesOrder.update({
              where: { id: so.id },
              data: { status: newSoStatus },
            });

            await tx.auditEvent.create({
              data: {
                entityType: "SalesOrder",
                entityId: so.id,
                action: "REOPEN",
                summary: `Reopened ${so.code} for resend quantity ${totalResend.toFixed(3)} kg from return ${srn.code}`,
                metadata: { resendKg: totalResend, returnCode: srn.code },
                actorId: userId,
              },
            });
          } else {
            // NO -> NEW_ORDER
            const code = await nextSeq("SO", "salesOrder");

            const newLinesData = [];
            let subtotal = 0;
            let taxAmount = 0;
            let lineNo = 0;

            for (const input of lines) {
              if (input.resendKg > 0) {
                lineNo++;
                const srnLine = srn.lines.find((l) => l.id === input.lineId);
                if (!srnLine) continue;
                const origLine = so?.lines.find((l) => l.id === srnLine.salesOrderLineId) || so?.lines[0];
                const ratePerKg = origLine ? Number(origLine.ratePerKg) : 0;
                const taxPct = origLine ? Number(origLine.taxPct) : 18;
                const lineTotal = Number((input.resendKg * ratePerKg).toFixed(2));
                const lineTax = Number(((lineTotal * taxPct) / 100).toFixed(2));

                subtotal += lineTotal;
                taxAmount += lineTax;

                newLinesData.push({
                  projectId: srnLine.projectId,
                  lineNo,
                  quantityKg: input.resendKg,
                  ratePerKg,
                  taxPct,
                  lineTotal,
                });
              }
            }

            const totalValue = Number((subtotal + taxAmount).toFixed(2));

            const newOrder = await tx.salesOrder.create({
              data: {
                code,
                status: SalesOrderStatus.PENDING_APPROVAL,
                customerId: srn.customerId,
                originalOrderId: so?.id || null,
                paymentTerms: so?.paymentTerms || null,
                deliveryTerms: so?.deliveryTerms || null,
                subtotal: Number(subtotal.toFixed(2)),
                taxAmount: Number(taxAmount.toFixed(2)),
                totalValue,
                raisedById: userId,
                remark: `Replacement sales order for return ${srn.code} (original ${so?.code ?? "SO"})`,
                lines: { create: newLinesData },
              },
            });

            const updatedReturn = await tx.salesReturn.updateMany({
              where: { id: returnId, resolution: null },
              data: {
                resolution: ReturnResolution.NEW_ORDER,
                resolutionNote: `Created replacement order ${newOrder.code} for resend quantity ${totalResend.toFixed(3)} kg`,
                resendOrderId: newOrder.id,
              },
            });
            if (updatedReturn.count === 0) throw new Error(`${srn.code} resolution has already been decided.`);

            await tx.auditEvent.create({
              data: {
                entityType: "SalesOrder",
                entityId: newOrder.id,
                action: "CREATE",
                summary: `Raised replacement order ${newOrder.code} from return ${srn.code}`,
                metadata: { returnCode: srn.code, originalOrderCode: so?.code },
                actorId: userId,
              },
            });
          }
        }

        // AR Reversal / Credit Note Posting (only if the returned order/challans already have a RAISED invoice)
        const hasRaisedInvoice =
          srn.salesOrder.invoices.length > 0 ||
          srn.salesOrder.challans.some((c) => c.invoices.length > 0);

        if (hasRaisedInvoice) {
          const round2 = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;
          let creditAmountAcc = 0;
          let creditTaxAcc = 0;

          for (const input of lines) {
            const line = srn.lines.find((l) => l.id === input.lineId);
            if (!line) continue;
            const returnedKg = input.restockedKg + input.scrappedKg;
            if (returnedKg <= 0) continue;

            const sol = srn.salesOrder.lines.find((l) => l.id === line.salesOrderLineId) || srn.salesOrder.lines[0];
            const ratePerKg = sol ? Number(sol.ratePerKg) : 0;
            const taxPct = sol && sol.taxPct != null ? Number(sol.taxPct) : 18;

            const lineAmount = round2(returnedKg * ratePerKg);
            const lineTax = round2((lineAmount * taxPct) / 100);

            creditAmountAcc += lineAmount;
            creditTaxAcc += lineTax;
          }

          const creditAmount = round2(creditAmountAcc);
          const creditTax = round2(creditTaxAcc);
          const creditTotal = round2(creditAmount + creditTax);

          if (creditTotal > 0) {
            const arAccount = await tx.chartOfAccount.findUnique({ where: { code: "1100" } });
            const revenueAccount = await tx.chartOfAccount.findUnique({ where: { code: "4000" } });
            const outputTaxAccount = await tx.chartOfAccount.findUnique({ where: { code: "2100" } });

            if (!arAccount || !revenueAccount || !outputTaxAccount) {
              throw new Error("Chart of accounts (1100, 4000, 2100) missing for credit posting.");
            }

            await tx.customer.update({
              where: { id: srn.customerId },
              data: { outstandingAmt: { decrement: creditTotal } },
            });

            // 1. Apply creditTotal across the order's RAISED / PART_PAID invoices oldest first
            const openInvoices = await tx.salesInvoice.findMany({
              where: {
                salesOrderId: srn.salesOrderId,
                status: { in: [SalesInvoiceStatus.RAISED, SalesInvoiceStatus.PART_PAID] },
              },
              orderBy: { createdAt: "asc" },
            });

            // Contributing return lines (restockedKg + scrappedKg > 0)
            const contributingLines: Array<{
              line: (typeof srn.lines)[0];
              returnedKg: number;
              ratePerKg: number;
              taxPct: number;
              lineAmount: number;
              lineTax: number;
              lineTotal: number;
            }> = [];

            for (const input of lines) {
              const line = srn.lines.find((l) => l.id === input.lineId);
              if (!line) continue;
              const returnedKg = input.restockedKg + input.scrappedKg;
              if (returnedKg <= 0) continue;

              const sol = srn.salesOrder.lines.find((l) => l.id === line.salesOrderLineId) || srn.salesOrder.lines[0];
              const ratePerKg = sol ? Number(sol.ratePerKg) : 0;
              const taxPct = sol && sol.taxPct != null ? Number(sol.taxPct) : 18;

              const lineAmount = round2(returnedKg * ratePerKg);
              const lineTax = round2((lineAmount * taxPct) / 100);
              const lineTotal = round2(lineAmount + lineTax);

              contributingLines.push({
                line,
                returnedKg,
                ratePerKg,
                taxPct,
                lineAmount,
                lineTax,
                lineTotal,
              });
            }

            let remainingCredit = creditTotal;
            const createdCreditNotes: Array<{ id: string; number: string }> = [];

            for (const inv of openInvoices) {
              if (remainingCredit <= 0.001) break;
              const totalVal = Number(inv.totalValue);
              const paidVal = Number(inv.paidAmount);
              const creditedVal = Number(inv.creditedAmount);
              const invoiceRemaining = Math.max(0, totalVal - paidVal - creditedVal);

              if (invoiceRemaining <= 0.001) continue;

              const applyAmount = round2(Math.min(remainingCredit, invoiceRemaining));
              if (applyAmount <= 0) continue;

              // Check if a (salesReturnId, salesInvoiceId) row exists (Idempotent: skip if it exists)
              const existingCn = await tx.creditNote.findUnique({
                where: {
                  salesReturnId_salesInvoiceId: {
                    salesReturnId: returnId,
                    salesInvoiceId: inv.id,
                  },
                },
              });

              if (existingCn) {
                createdCreditNotes.push({ id: existingCn.id, number: existingCn.number });
                remainingCredit = round2(remainingCredit - Number(existingCn.totalValue));
                continue;
              }

              // Split tax using the return's own per-line taxable and tax (from salesOrderLine.ratePerKg and taxPct),
              // scaled by (applied amount / total return credit). Rounding remainder goes on the last line.
              // Header taxableValue, taxAmount, and totalValue must equal the sum of the lines,
              // and header tax must equal the tax posted to account 2100 for that note.
              const scale = creditTotal > 0 ? applyAmount / creditTotal : 0;
              const targetTotalValue = applyAmount;
              const targetTaxAmount = round2(creditTax * scale);
              const targetTaxableValue = round2(targetTotalValue - targetTaxAmount);

              const cnNumber = await nextSeq("CN", "creditNote", "number", tx);

              const totalReturnedKg = contributingLines.reduce((sum, item) => sum + item.returnedKg, 0);
              let sumScaledTotal = 0;
              let sumScaledTax = 0;
              let sumScaledTaxable = 0;
              let sumScaledQty = 0;

              const cnLinesData: Array<{
                salesReturnLineId: string;
                description: string;
                quantity: number;
                unit: string;
                rate: number;
                taxableValue: number;
                taxAmount: number;
                totalValue: number;
              }> = [];

              const round3 = (num: number) => Math.round((num + Number.EPSILON) * 1000) / 1000;

              for (let i = 0; i < contributingLines.length; i++) {
                const item = contributingLines[i];
                const isLast = i === contributingLines.length - 1;

                let lineTotal: number;
                let lineTax: number;
                let lineTaxable: number;
                let lineQty: number;

                if (isLast) {
                  lineTotal = round2(targetTotalValue - sumScaledTotal);
                  lineTax = round2(targetTaxAmount - sumScaledTax);
                  lineTaxable = round2(targetTaxableValue - sumScaledTaxable);
                  lineQty = round3(totalReturnedKg * scale - sumScaledQty);
                } else {
                  lineTaxable = round2(item.lineAmount * scale);
                  lineTax = round2(item.lineTax * scale);
                  lineTotal = round2(lineTaxable + lineTax);
                  lineQty = round3(item.returnedKg * scale);

                  sumScaledTotal = round2(sumScaledTotal + lineTotal);
                  sumScaledTax = round2(sumScaledTax + lineTax);
                  sumScaledTaxable = round2(sumScaledTaxable + lineTaxable);
                  sumScaledQty = round3(sumScaledQty + lineQty);
                }

                cnLinesData.push({
                  salesReturnLineId: item.line.id,
                  description: item.line.project?.name || "Returned Material",
                  quantity: lineQty,
                  unit: "KG",
                  rate: item.ratePerKg,
                  taxableValue: lineTaxable,
                  taxAmount: lineTax,
                  totalValue: lineTotal,
                });
              }

              // Header taxableValue, taxAmount, and totalValue must equal the sum of the lines
              const cnTaxableValue = round2(cnLinesData.reduce((acc, l) => acc + l.taxableValue, 0));
              const cnTaxAmount = round2(cnLinesData.reduce((acc, l) => acc + l.taxAmount, 0));
              const cnTotalValue = round2(cnLinesData.reduce((acc, l) => acc + l.totalValue, 0));

              const cnRecord = await tx.creditNote.create({
                  data: {
                    number: cnNumber,
                    date: new Date(),
                    salesInvoiceId: inv.id,
                    salesReturnId: returnId,
                    customerId: srn.customerId,
                    reason: srn.reason || "Sales Return Credit",
                    taxableValue: cnTaxableValue,
                    taxAmount: cnTaxAmount,
                    totalValue: cnTotalValue,
                    status: CreditNoteStatus.ISSUED,
                    createdById: userId,
                    lines: {
                      create: cnLinesData,
                    },
                  },
                });

              createdCreditNotes.push({ id: cnRecord.id, number: cnRecord.number });

              const newCredited = round2(creditedVal + applyAmount);
              const newStatus =
                paidVal + newCredited >= totalVal - 0.01
                  ? SalesInvoiceStatus.PAID
                  : inv.status;

              await tx.salesInvoice.update({
                where: { id: inv.id },
                data: {
                  creditedAmount: newCredited,
                  status: newStatus,
                },
              });

              remainingCredit = round2(remainingCredit - applyAmount);
            }

            // Postings for return credits use source type CREDIT_NOTE and reference the credit note number
            const cnRef = createdCreditNotes.length > 0
              ? createdCreditNotes.map((c) => c.number).join(", ")
              : srn.code;

            if (creditAmount > 0) {
              await tx.ledgerPosting.create({
                data: {
                  accountId: revenueAccount.id,
                  side: PostingSide.DEBIT,
                  amount: creditAmount,
                  sourceType: PostingSourceType.CREDIT_NOTE,
                  sourceId: returnId,
                  remark: `Credit note ${cnRef} (Sales Revenue reversal) for return ${srn.code}`,
                },
              });
            }

            if (creditTax > 0) {
              await tx.ledgerPosting.create({
                data: {
                  accountId: outputTaxAccount.id,
                  side: PostingSide.DEBIT,
                  amount: creditTax,
                  sourceType: PostingSourceType.CREDIT_NOTE,
                  sourceId: returnId,
                  remark: `Credit note ${cnRef} (Output GST reversal) for return ${srn.code}`,
                },
              });
            }

            await tx.ledgerPosting.create({
              data: {
                accountId: arAccount.id,
                side: PostingSide.CREDIT,
                amount: creditTotal,
                sourceType: PostingSourceType.CREDIT_NOTE,
                sourceId: returnId,
                remark: `Credit note ${cnRef} (Accounts Receivable reduction) for return ${srn.code}`,
              },
            });

            const excessCredit = remainingCredit > 0.001 ? remainingCredit : 0;
            const excessNote = excessCredit > 0 ? ` (Excess unapplied: ₹${excessCredit.toFixed(2)})` : "";

            await tx.auditEvent.create({
              data: {
                entityType: "SalesReturn",
                entityId: returnId,
                action: "CREDIT",
                summary: `Credit note of ₹${creditTotal.toFixed(2)} (Amount: ₹${creditAmount.toFixed(2)}, Tax: ₹${creditTax.toFixed(2)}) for return ${srn.code}${excessNote}`,
                metadata: { creditAmount, creditTax, creditTotal, excessCredit },
                actorId: userId,
              },
            });
          }
        }

        await tx.auditEvent.create({
          data: {
            entityType: "SalesReturn",
            entityId: returnId,
            action: "INSPECT",
            summary: `Inspected ${srn.code} — ${totalRestocked.toFixed(3)} kg back to stock, ${totalScrapped.toFixed(3)} kg scrapped, ${totalResend.toFixed(3)} kg resend`,
            metadata: { totalRestocked, totalScrapped, totalResend },
            actorId: userId,
          },
        });
      });
      settled = true;
      break;
    } catch (err: any) {
      const target = err?.meta?.target;
      const isCodeCollision =
        err?.code === "P2002" &&
        (Array.isArray(target)
          ? target.some((t: any) => typeof t === "string" && (t.includes("code") || t.includes("batchNo")))
          : typeof target === "string" && (target.includes("code") || target.includes("batchNo")));
      if (isCodeCollision && attempt < 4) {
        continue;
      }
      throw err;
    }
  }

  if (!settled) {
    return { error: "Failed to settle return due to code collision. Please try again." };
  }

  revalidatePath("/sales/returns");
  revalidatePath(`/sales/returns/${returnId}`);
  revalidatePath("/procurement/inventory");
  return {
    success: `${srn.code} inspected — ${totalRestocked.toFixed(3)} kg back to stock, ${totalScrapped.toFixed(3)} kg scrapped.`,
  };
}

// ── Create Sales Return Core ────────────────────────────────────────────────────

const createReturnFormSchema = z.object({
  salesOrderId: z.string().min(1, "Select a sales order"),
  reason: z.string().optional(),
  customerDcNo: z.string().optional(),
  remark: z.string().optional(),
  lines: z.string().min(1, "Specify returned line items"),
});

const returnLineItemSchema = z.array(
  z.object({
    salesOrderLineId: z.string().optional(),
    projectId: z.string().min(1, "Select a compound"),
    quantityKg: z.coerce.number().positive("Quantity returned must be greater than 0"),
  }),
);

export async function createSalesReturnCore(userId: string, form: FormData): Promise<ActionState & { returnId?: string }> {
  const parsed = createReturnFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check return details." };
  }

  let rawLines;
  try {
    rawLines = returnLineItemSchema.parse(JSON.parse(parsed.data.lines));
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { error: err.issues[0]?.message ?? "Specify valid returned items." };
    }
    return { error: "Specify valid returned items." };
  }

  const so = await prisma.salesOrder.findUnique({
    where: { id: parsed.data.salesOrderId },
    include: { customer: { select: { id: true, name: true } }, lines: true },
  });
  if (!so) return { error: "Selected sales order does not exist." };
  if (so.status === SalesOrderStatus.CANCELLED) {
    return { error: `Sales order ${so.code} is cancelled. Returns cannot be created against cancelled orders.` };
  }

  let created;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await nextSeq("SRN", "salesReturn");
    try {
      created = await prisma.$transaction(async (tx) => {
        const srn = await tx.salesReturn.create({
          data: {
            code,
            status: SalesReturnStatus.PENDING_QC,
            salesOrderId: so.id,
            customerId: so.customerId,
            returnedOn: new Date(),
            reason: parsed.data.reason?.trim() || null,
            customerDcNo: parsed.data.customerDcNo?.trim() || null,
            remark: parsed.data.remark?.trim() || null,
            receivedById: userId,
            lines: {
              create: rawLines.map((l, idx) => {
                const matchedSol = so.lines.find((sol) => sol.id === l.salesOrderLineId) || so.lines.find((sol) => sol.projectId === l.projectId);
                return {
                  salesOrderLineId: matchedSol?.id || null,
                  projectId: l.projectId,
                  lineNo: idx + 1,
                  quantityKg: l.quantityKg,
                };
              }),
            },
          },
        });

        await tx.auditEvent.create({
          data: {
            entityType: "SalesReturn",
            entityId: srn.id,
            action: "CREATE",
            summary: `Logged sales return ${code} against ${so.code} for ${so.customer.name}`,
            actorId: userId,
          },
        });

        return srn;
      });
      break;
    } catch (err: any) {
      const target = err?.meta?.target;
      const isCodeCollision =
        err?.code === "P2002" &&
        (Array.isArray(target)
          ? target.some((t: any) => typeof t === "string" && t.includes("code"))
          : typeof target === "string" && target.includes("code"));
      if (isCodeCollision && attempt < 4) {
        continue;
      }
      throw err;
    }
  }

  if (!created) {
    return { error: "Failed to generate a unique sales return code. Please try again." };
  }

  revalidatePath("/sales/returns");
  redirect(`/sales/returns/${created.id}`);
}

export async function cancelSalesOrderCore(
  userId: string,
  orderId: string,
  reason: string,
): Promise<ActionState> {
  const trimmedReason = reason?.trim();
  if (!trimmedReason) {
    return { error: "Cancellation reason is required." };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const so = await tx.salesOrder.findUnique({
        where: { id: orderId },
        include: {
          challans: { select: { id: true, code: true } },
          lines: {
            include: {
              allocations: {
                where: { isActive: true },
                include: { batch: { select: { id: true, batchNo: true } } },
              },
            },
          },
        },
      });

      if (!so) {
        throw new Error("That sales order no longer exists.");
      }

      if (so.challans.length > 0) {
        throw new Error(`Cannot cancel ${so.code} because delivery challans already exist. Please use a sales return.`);
      }

      if (so.status !== SalesOrderStatus.PENDING_APPROVAL && so.status !== SalesOrderStatus.CONFIRMED) {
        throw new Error(`Cannot cancel ${so.code} with status ${so.status}. Please use a sales return.`);
      }

      // Release all active allocations
      for (const line of so.lines) {
        for (const alloc of line.allocations) {
          const qty = Number(alloc.quantityKg);
          await tx.stockAllocation.update({
            where: { id: alloc.id },
            data: { isActive: false },
          });
          await tx.inventoryBatch.update({
            where: { id: alloc.batchId },
            data: { availableQtyKg: { increment: qty } },
          });
          await tx.salesOrderLine.update({
            where: { id: line.id },
            data: { allocatedKg: { decrement: qty } },
          });
          await tx.auditEvent.create({
            data: {
              entityType: "StockAllocation",
              entityId: alloc.id,
              action: "RELEASE",
              summary: `Released ${qty.toFixed(3)} kg of ${alloc.batch.batchNo} on cancellation of ${so.code}`,
              actorId: userId,
            },
          });
        }
      }

      const newRemark = `${so.remark ? so.remark + " | " : ""}Cancelled: ${trimmedReason}`;

      await tx.salesOrder.update({
        where: { id: orderId },
        data: {
          status: SalesOrderStatus.CANCELLED,
          remark: newRemark,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: "SalesOrder",
          entityId: so.id,
          action: "CANCEL",
          summary: `Cancelled ${so.code} — ${trimmedReason}`,
          metadata: {
            orderId: so.id,
            code: so.code,
            reason: trimmedReason,
            cancelledAt: new Date().toISOString(),
          },
          actorId: userId,
        },
      });

      return so;
    });

    revalidatePath("/sales/orders");
    revalidatePath(`/sales/orders/${orderId}`);
    revalidatePath("/procurement/inventory");

    return { success: `${result.code} has been cancelled.` };
  } catch (err: any) {
    return { error: err.message };
  }
}

// ── Packing List Core ────────────────────────────────────────────────────────

export type PackingPackageInput = {
  packageNo: number;
  packageType?: string | null;
  grossKg: number | string;
  tareKg?: number | string | null;
  lines: {
    challanLineId: string;
    quantityKg: number | string;
  }[];
};

export async function createPackingListCore(
  userId: string,
  challanId: string,
): Promise<ActionState & { packingListId?: string }> {
  const challan = await prisma.deliveryChallan.findUnique({
    where: { id: challanId },
    include: {
      customer: { select: { name: true } },
      packingList: { select: { id: true, code: true } },
    },
  });
  if (!challan) {
    return { error: "Delivery challan does not exist." };
  }
  if (challan.status !== ChallanStatus.DISPATCHED) {
    return {
      error: `Delivery challan ${challan.code} is in status ${challan.status}. Packing lists can only be created for DISPATCHED challans.`,
    };
  }
  if (challan.packingList) {
    return {
      error: `Delivery challan ${challan.code} already has a packing list (${challan.packingList.code}).`,
    };
  }

  let created;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await nextSeq("PKL", "packingList");
    try {
      created = await prisma.$transaction(async (tx) => {
        const existing = await tx.packingList.findUnique({ where: { challanId } });
        if (existing) {
          const dupErr = new Error(`Delivery challan already has a packing list (${existing.code}).`);
          dupErr.name = "DuplicateChallanPackingListError";
          throw dupErr;
        }

        const pl = await tx.packingList.create({
          data: {
            code,
            status: PackingListStatus.DRAFT,
            challanId,
            createdById: userId,
          },
        });

        await tx.auditEvent.create({
          data: {
            entityType: "PackingList",
            entityId: pl.id,
            action: "CREATE",
            summary: `Created packing list ${code} for challan ${challan.code}`,
            actorId: userId,
          },
        });

        return pl;
      });
      break;
    } catch (err: any) {
      const target = err?.meta?.target;
      const isCodeCollision =
        err?.code === "P2002" &&
        (Array.isArray(target)
          ? target.some((t: any) => typeof t === "string" && t.includes("code"))
          : typeof target === "string" && target.includes("code"));
      if (isCodeCollision && attempt < 4) {
        continue;
      }
      if (err?.code === "P2002" && (Array.isArray(target) ? target.includes("challanId") : target === "challanId")) {
        return { error: `Delivery challan ${challan.code} already has a packing list.` };
      }
      if (err?.name === "DuplicateChallanPackingListError") {
        return { error: err.message };
      }
      throw err;
    }
  }

  if (!created) {
    return { error: "Failed to generate a unique packing list code. Please try again." };
  }

  try {
    revalidatePath("/sales/dispatch");
    revalidatePath(`/sales/dispatch/${challanId}`);
  } catch {}

  return { success: `Created packing list ${created.code}.`, packingListId: created.id };
}

export async function savePackingPackagesCore(
  userId: string,
  packingListId: string,
  packages: PackingPackageInput[],
): Promise<ActionState> {
  const pl = await prisma.packingList.findUnique({
    where: { id: packingListId },
    include: {
      challan: {
        include: {
          lines: true,
        },
      },
    },
  });

  if (!pl) {
    return { error: "Packing list does not exist." };
  }
  if (pl.status !== PackingListStatus.DRAFT) {
    return { error: `Packing list ${pl.code} is ${pl.status}. Only DRAFT packing lists can be modified.` };
  }

  if (!Array.isArray(packages) || packages.length === 0) {
    return { error: "At least one package is required." };
  }

  const seenPackageNos = new Set<number>();
  const challanLineMap = new Map(pl.challan.lines.map((l) => [l.id, l]));
  const packedQtyByLine = new Map<string, number>();

  for (const pkg of packages) {
    if (typeof pkg.packageNo !== "number" || !Number.isInteger(pkg.packageNo) || pkg.packageNo <= 0) {
      return { error: `Package number must be a positive integer, got ${pkg.packageNo}.` };
    }
    if (seenPackageNos.has(pkg.packageNo)) {
      return { error: `Duplicate package number ${pkg.packageNo}.` };
    }
    seenPackageNos.add(pkg.packageNo);

    const gross = Number(pkg.grossKg);
    if (isNaN(gross) || gross < 0) {
      return { error: `Gross weight must be non-negative for package ${pkg.packageNo}.` };
    }

    const tare = pkg.tareKg != null ? Number(pkg.tareKg) : 0;
    if (isNaN(tare) || tare < 0) {
      return { error: `Tare weight must be non-negative for package ${pkg.packageNo}.` };
    }

    if (!Array.isArray(pkg.lines) || pkg.lines.length === 0) {
      return { error: `Package ${pkg.packageNo} must contain at least one line.` };
    }

    for (const l of pkg.lines) {
      if (!challanLineMap.has(l.challanLineId)) {
        return {
          error: `Line ${l.challanLineId} in package ${pkg.packageNo} does not belong to delivery challan ${pl.challan.code}.`,
        };
      }
      const qty = Number(l.quantityKg);
      if (isNaN(qty) || qty <= 0) {
        return { error: `Line quantity must be greater than 0 in package ${pkg.packageNo}.` };
      }
      const current = packedQtyByLine.get(l.challanLineId) || 0;
      packedQtyByLine.set(l.challanLineId, current + qty);
    }
  }

  // Per challan line, SUM of packed kg must not exceed the challan line's quantityKg (tolerance 0.001)
  for (const [lineId, totalPacked] of packedQtyByLine.entries()) {
    const challanLine = challanLineMap.get(lineId)!;
    const maxQty = Number(challanLine.quantityKg);
    if (totalPacked - maxQty > 0.001) {
      return {
        error: `Challan line ${challanLine.lineNo} exceeds maximum quantity: ${totalPacked.toFixed(3)} kg packed vs ${maxQty.toFixed(3)} kg on challan.`,
      };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const currentPl = await tx.packingList.findUnique({
        where: { id: packingListId },
        select: { id: true, status: true, code: true },
      });
      if (!currentPl || currentPl.status !== PackingListStatus.DRAFT) {
        throw new Error(`Packing list is no longer in DRAFT status.`);
      }

      await tx.packingPackageLine.deleteMany({
        where: { package: { packingListId } },
      });
      await tx.packingPackage.deleteMany({
        where: { packingListId },
      });

      for (const pkg of packages) {
        await tx.packingPackage.create({
          data: {
            packingListId,
            packageNo: pkg.packageNo,
            packageType: pkg.packageType?.trim() || null,
            grossKg: Number(pkg.grossKg),
            tareKg: pkg.tareKg != null ? Number(pkg.tareKg) : 0,
            lines: {
              create: pkg.lines.map((l) => ({
                challanLineId: l.challanLineId,
                quantityKg: Number(l.quantityKg),
              })),
            },
          },
        });
      }
    });
  } catch (err: any) {
    return { error: err.message || "Failed to save packing packages." };
  }

  try {
    revalidatePath(`/sales/dispatch/${pl.challanId}`);
  } catch {}

  return { success: `Packing packages for ${pl.code} saved.` };
}

export async function finalizePackingListCore(
  userId: string,
  packingListId: string,
): Promise<ActionState> {
  const pl = await prisma.packingList.findUnique({
    where: { id: packingListId },
    include: {
      challan: {
        include: {
          lines: true,
        },
      },
      packages: {
        include: {
          lines: true,
        },
      },
    },
  });

  if (!pl) {
    return { error: "Packing list does not exist." };
  }
  if (pl.status !== PackingListStatus.DRAFT) {
    return {
      error: `Packing list ${pl.code} is in status ${pl.status}. Only DRAFT packing lists can be finalized.`,
    };
  }

  const packedQtyByLine = new Map<string, number>();
  for (const pkg of pl.packages) {
    for (const l of pkg.lines) {
      const current = packedQtyByLine.get(l.challanLineId) || 0;
      packedQtyByLine.set(l.challanLineId, current + Number(l.quantityKg));
    }
  }

  const shortfalls: { lineNo: number; challanQty: number; packedQty: number; shortfallKg: number }[] = [];
  for (const cl of pl.challan.lines) {
    const challanQty = Number(cl.quantityKg);
    const packedQty = packedQtyByLine.get(cl.id) || 0;
    const diff = challanQty - packedQty;
    if (Math.abs(diff) > 0.001) {
      shortfalls.push({
        lineNo: cl.lineNo,
        challanQty,
        packedQty,
        shortfallKg: diff,
      });
    }
  }

  if (shortfalls.length > 0) {
    const details = shortfalls
      .map(
        (s) =>
          `Line ${s.lineNo} (expected ${s.challanQty.toFixed(3)} kg, packed ${s.packedQty.toFixed(3)} kg, shortfall ${s.shortfallKg.toFixed(3)} kg)`,
      )
      .join(", ");
    return {
      error: `Cannot finalize packing list ${pl.code}: all challan lines must be fully packed. Shortfalls: ${details}`,
    };
  }

  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const res = await tx.packingList.updateMany({
        where: {
          id: packingListId,
          status: PackingListStatus.DRAFT,
        },
        data: {
          status: PackingListStatus.FINAL,
          finalizedById: userId,
          finalizedAt: now,
        },
      });

      if (res.count === 0) {
        throw new Error(`Packing list ${pl.code} is no longer in DRAFT status.`);
      }

      await tx.auditEvent.create({
        data: {
          entityType: "PackingList",
          entityId: pl.id,
          action: "FINALIZE",
          summary: `Finalized packing list ${pl.code} for challan ${pl.challan.code}`,
          actorId: userId,
        },
      });
    });
  } catch (err: any) {
    return { error: err.message || "Failed to finalize packing list." };
  }

  try {
    revalidatePath("/sales/dispatch");
    revalidatePath(`/sales/dispatch/${pl.challanId}`);
  } catch {}

  return { success: `Packing list ${pl.code} finalized.` };
}


