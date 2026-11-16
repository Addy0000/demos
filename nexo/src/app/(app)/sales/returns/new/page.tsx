import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { NewReturnForm } from "./new-return-form";

export const metadata: Metadata = { title: "Create sales return" };
export const dynamic = "force-dynamic";

export default async function NewReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  await requirePermission("sreturn:write");
  const { orderId } = await searchParams;

  const orders = await prisma.salesOrder.findMany({
    where: {
      status: { in: ["DISPATCHED", "PARTIALLY_DISPATCHED", "INVOICED"] },
    },
    orderBy: { orderedOn: "desc" },
    select: {
      id: true,
      code: true,
      customer: { select: { id: true, name: true, code: true } },
      lines: {
        select: {
          id: true,
          lineNo: true,
          projectId: true,
          quantityKg: true,
          dispatchedKg: true,
          project: { select: { id: true, code: true, name: true, application: true } },
        },
      },
    },
  });

  return (
    <NewReturnForm
      initialOrderId={orderId ?? ""}
      orders={orders.map((o) => ({
        id: o.id,
        code: o.code,
        customerName: o.customer.name,
        lines: o.lines.map((l) => ({
          id: l.id,
          lineNo: l.lineNo,
          projectId: l.project.id,
          projectName: l.project.name,
          projectCode: l.project.code,
          dispatchedKg: Number(l.dispatchedKg),
        })),
      }))}
    />
  );
}
