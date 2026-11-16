import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { ReturnsGrid } from "./returns-grid";

export const metadata: Metadata = { title: "Sales returns" };
export const dynamic = "force-dynamic";

export default async function ReturnsPage() {
  await requirePermission("sreturn:read");

  const rows = await prisma.salesReturn.findMany({
    include: {
      customer: { select: { id: true, name: true } },
      salesOrder: { select: { id: true, code: true } },
      receivedBy: { select: { name: true } },
      inspectedBy: { select: { name: true } },
      lines: {
        select: {
          quantityKg: true, restockedKg: true, scrappedKg: true, qcResult: true,
          project: { select: { name: true } },
        },
      },
    },
    orderBy: { returnedOn: "desc" },
  });

  return (
    <ReturnsGrid
      rows={rows.map((r) => {
        const back = r.lines.reduce((a, l) => a + Number(l.quantityKg), 0);
        const restocked = r.lines.reduce((a, l) => a + Number(l.restockedKg), 0);
        const scrapped = r.lines.reduce((a, l) => a + Number(l.scrappedKg), 0);
        return {
          id: r.id,
          code: r.code,
          status: r.status,
          customerId: r.customer.id,
          customerName: r.customer.name,
          orderId: r.salesOrder.id,
          orderCode: r.salesOrder.code,
          returnedOn: r.returnedOn.toISOString(),
          reason: r.reason ?? "—",
          customerDcNo: r.customerDcNo ?? "—",
          lineCount: r.lines.length,
          firstProject: r.lines[0]?.project.name ?? "—",
          returnedKg: back,
          restockedKg: restocked,
          scrappedKg: scrapped,
          recovery: back > 0 ? (restocked / back) * 100 : 0,
          inspectedBy: r.inspectedBy?.name ?? null,
          receivedBy: r.receivedBy?.name ?? "—",
        };
      })}
    />
  );
}
