import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { DebitNotesGrid, type DebitNoteRow } from "./debit-notes-grid";

export const metadata: Metadata = { title: "Debit notes" };
export const dynamic = "force-dynamic";

export default async function DebitNotesPage() {
  await requirePermission("po:read");

  const rows = await prisma.debitNote.findMany({
    include: {
      vendor: { select: { id: true, name: true } },
      vendorBill: { select: { id: true, code: true } },
      goodsReceipt: { select: { id: true, code: true } },
    },
    orderBy: { date: "desc" },
  });

  const formattedRows: DebitNoteRow[] = rows.map((dn) => ({
    id: dn.id,
    number: dn.number,
    date: dn.date.toISOString(),
    vendorId: dn.vendor.id,
    vendorName: dn.vendor.name,
    billId: dn.vendorBill.id,
    billCode: dn.vendorBill.code,
    grnId: dn.goodsReceipt.id,
    grnCode: dn.goodsReceipt.code,
    total: Number(dn.totalValue),
    status: dn.status,
  }));

  return <DebitNotesGrid rows={formattedRows} />;
}
