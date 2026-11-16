import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { NewOrderForm } from "./new-order-form";

export const metadata: Metadata = { title: "New purchase order" };
export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  await requirePermission("po:write");

  const vendors = await prisma.vendor.findMany({
    where: { status: { in: ["ACTIVE", "PENDING_APPROVAL"] } },
    select: {
      id: true, code: true, name: true, paymentTerms: true,
      materials: {
        select: {
          material: {
            select: { id: true, code: true, name: true, grade: true, currentPricePerKg: true, reorderQtyKg: true, uom: true },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <NewOrderForm
      vendors={vendors.map((v) => ({
        id: v.id,
        code: v.code,
        name: v.name,
        paymentTerms: v.paymentTerms ?? "",
        materials: v.materials.map((m) => ({
          id: m.material.id,
          code: m.material.code,
          name: m.material.name,
          grade: m.material.grade ?? "",
          rate: m.material.currentPricePerKg ? Number(m.material.currentPricePerKg) : 0,
          suggestedQty: Number(m.material.reorderQtyKg),
        })),
      }))}
    />
  );
}
