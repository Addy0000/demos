import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { GrnGrid } from "./grn-grid";

export const metadata: Metadata = { title: "Goods receipts" };
export const dynamic = "force-dynamic";

export default async function GrnPage() {
  await requirePermission("grn:read");

  const rows = await prisma.goodsReceipt.findMany({
    include: {
      vendor: { select: { id: true, name: true } },
      purchaseOrder: { select: { id: true, code: true } },
      receivedBy: { select: { name: true } },
      inspectedBy: { select: { name: true } },
      lines: { select: { challanQtyKg: true, receivedQtyKg: true, acceptedQtyKg: true, rejectedQtyKg: true, qcResult: true } },
    },
    orderBy: { receivedOn: "desc" },
  });

  return (
    <GrnGrid
      rows={rows.map((g) => {
        const challan = g.lines.reduce((a, l) => a + Number(l.challanQtyKg), 0);
        const received = g.lines.reduce((a, l) => a + Number(l.receivedQtyKg), 0);
        const accepted = g.lines.reduce((a, l) => a + Number(l.acceptedQtyKg), 0);
        const rejected = g.lines.reduce((a, l) => a + Number(l.rejectedQtyKg), 0);
        return {
          id: g.id,
          code: g.code,
          status: g.status,
          vendorId: g.vendor.id,
          vendorName: g.vendor.name,
          poId: g.purchaseOrder.id,
          poCode: g.purchaseOrder.code,
          receivedOn: g.receivedOn.toISOString(),
          invoiceNo: g.invoiceNo ?? "—",
          vehicleNo: g.vehicleNo ?? "—",
          gateEntryNo: g.gateEntryNo ?? "—",
          lineCount: g.lines.length,
          challanKg: challan,
          receivedKg: received,
          acceptedKg: accepted,
          rejectedKg: rejected,
          shortfallKg: challan - received,
          receivedBy: g.receivedBy?.name ?? "—",
          inspectedBy: g.inspectedBy?.name ?? "—",
          hasFailure: g.lines.some((l) => l.qcResult === "FAIL" || l.qcResult === "CONDITIONAL"),
        };
      })}
    />
  );
}
