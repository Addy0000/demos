"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PriceStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/session";

export type ActionState = { error?: string; success?: string };

/**
 * Approve a vendor price submission.
 *
 * Runs as one transaction: supersede the previous approved row, approve this one,
 * and refresh the denormalised current rate on the material. Costing reads that
 * field, so it must never drift from the approved price history.
 */
export async function approvePrice(priceId: string): Promise<ActionState> {
  const user = await assertPermission("price:approve");

  const price = await prisma.materialPrice.findUnique({
    where: { id: priceId },
    include: { material: { select: { id: true, name: true, currentPricePerKg: true } }, vendor: { select: { name: true } } },
  });

  if (!price) return { error: "That price submission no longer exists." };
  if (price.status !== PriceStatus.PENDING_APPROVAL) {
    return { error: `This submission is already ${price.status.toLowerCase().replace(/_/g, " ")}.` };
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.materialPrice.updateMany({
      where: {
        materialId: price.materialId,
        vendorId: price.vendorId,
        status: PriceStatus.APPROVED,
        id: { not: priceId },
      },
      data: { status: PriceStatus.SUPERSEDED, effectiveTo: price.effectiveFrom },
    }),
    prisma.materialPrice.update({
      where: { id: priceId },
      data: { status: PriceStatus.APPROVED, approvedById: user.id, approvedAt: now },
    }),
    prisma.rawMaterial.update({
      where: { id: price.materialId },
      data: { currentPricePerKg: price.pricePerKg, currentPriceFrom: price.effectiveFrom },
    }),
    prisma.auditEvent.create({
      data: {
        entityType: "MaterialPrice",
        entityId: priceId,
        action: "APPROVE",
        summary: `Approved ${price.material.name} at ₹${Number(price.pricePerKg).toFixed(2)}/kg from ${price.vendor.name}`,
        metadata: {
          previous: price.material.currentPricePerKg ? Number(price.material.currentPricePerKg) : null,
          approved: Number(price.pricePerKg),
          effectiveFrom: price.effectiveFrom.toISOString(),
        },
        actorId: user.id,
      },
    }),
  ]);

  revalidatePath("/finance/approvals");
  revalidatePath("/finance/prices");
  revalidatePath("/finance/history");
  revalidatePath("/finance/costing");
  revalidatePath("/");
  return { success: `Approved at ₹${Number(price.pricePerKg).toFixed(2)}/kg.` };
}

export async function rejectPrice(priceId: string, reason: string): Promise<ActionState> {
  const user = await assertPermission("price:approve");

  const trimmed = reason.trim();
  if (trimmed.length < 5) {
    return { error: "Give the vendor a reason — at least a few words they can act on." };
  }

  const price = await prisma.materialPrice.findUnique({
    where: { id: priceId },
    include: { material: { select: { name: true } }, vendor: { select: { name: true } } },
  });
  if (!price) return { error: "That price submission no longer exists." };
  if (price.status !== PriceStatus.PENDING_APPROVAL) {
    return { error: `This submission is already ${price.status.toLowerCase().replace(/_/g, " ")}.` };
  }

  await prisma.$transaction([
    prisma.materialPrice.update({
      where: { id: priceId },
      data: { status: PriceStatus.REJECTED, approvedById: user.id, approvedAt: new Date(), rejectionReason: trimmed },
    }),
    prisma.auditEvent.create({
      data: {
        entityType: "MaterialPrice", entityId: priceId, action: "REJECT",
        summary: `Rejected ${price.material.name} from ${price.vendor.name} — ${trimmed}`,
        actorId: user.id,
      },
    }),
  ]);

  revalidatePath("/finance/approvals");
  revalidatePath("/finance/history");
  revalidatePath("/");
  return { success: "Submission rejected and the reason recorded." };
}

/** Bulk approve from the grid's selection bar. */
export async function approveMany(ids: string[]): Promise<ActionState> {
  await assertPermission("price:approve");
  let ok = 0;
  const failures: string[] = [];

  for (const id of ids) {
    const res = await approvePrice(id);
    if (res.error) failures.push(res.error);
    else ok++;
  }

  if (ok === 0) return { error: failures[0] ?? "Nothing was approved." };
  return {
    success:
      failures.length > 0
        ? `Approved ${ok}. ${failures.length} could not be processed.`
        : `Approved ${ok} price revision${ok === 1 ? "" : "s"}.`,
  };
}

// ── Vendor-side submission ──────────────────────────────────────────────────

const submitSchema = z.object({
  materialId: z.string().min(1, "Choose a material."),
  pricePerKg: z.coerce.number().positive("Enter a rate greater than zero."),
  effectiveFrom: z.string().min(1, "Choose the date this rate takes effect."),
  moqKg: z.coerce.number().min(0).optional(),
  leadTimeDays: z.coerce.number().int().min(0).max(365).optional(),
  remark: z.string().optional(),
});

/**
 * A vendor proposes a new rate. The vendorId comes from the session, never from
 * the form — a vendor cannot submit on another vendor's behalf.
 */
export async function submitPrice(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission("price:submit");

  if (user.role !== Role.VENDOR || !user.vendorId) {
    return { error: "Only a vendor account can submit a price revision." };
  }

  const parsed = submitSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the submission." };

  const { materialId, pricePerKg, effectiveFrom, ...rest } = parsed.data;

  // The vendor must actually be approved to supply this material.
  const link = await prisma.vendorMaterial.findUnique({
    where: { vendorId_materialId: { vendorId: user.vendorId, materialId } },
  });
  if (!link) return { error: "You are not listed as an approved supplier for that material." };

  const existingPending = await prisma.materialPrice.findFirst({
    where: { vendorId: user.vendorId, materialId, status: PriceStatus.PENDING_APPROVAL },
  });
  if (existingPending) {
    return { error: "You already have a revision awaiting approval for this material." };
  }

  const current = await prisma.materialPrice.findFirst({
    where: { vendorId: user.vendorId, materialId, status: PriceStatus.APPROVED },
    orderBy: { effectiveFrom: "desc" },
  });

  const previous = current ? Number(current.pricePerKg) : null;
  const changePct = previous ? ((pricePerKg - previous) / previous) * 100 : null;

  await prisma.materialPrice.create({
    data: {
      ...rest,
      materialId,
      vendorId: user.vendorId,
      pricePerKg,
      changePct,
      effectiveFrom: new Date(effectiveFrom),
      status: PriceStatus.PENDING_APPROVAL,
      submittedById: user.id,
    },
  });

  revalidatePath("/vendor/prices");
  revalidatePath("/vendor/submissions");
  revalidatePath("/finance/approvals");
  revalidatePath("/");
  return { success: "Submitted. Finance will review it before the rate goes live." };
}

export async function withdrawSubmission(priceId: string): Promise<ActionState> {
  const user = await assertPermission("price:submit");
  if (!user.vendorId) return { error: "No vendor is linked to your account." };

  // Scoped delete: a vendor can only withdraw its own pending submission.
  const res = await prisma.materialPrice.deleteMany({
    where: { id: priceId, vendorId: user.vendorId, status: PriceStatus.PENDING_APPROVAL },
  });

  if (res.count === 0) return { error: "That submission cannot be withdrawn." };

  revalidatePath("/vendor/submissions");
  revalidatePath("/finance/approvals");
  return { success: "Submission withdrawn." };
}
