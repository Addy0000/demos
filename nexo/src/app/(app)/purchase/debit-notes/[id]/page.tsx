import type { Metadata } from "next";
import { getTenant } from "@/lib/tenant-server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { money, amount, date } from "@/lib/format";
import { PrintButton } from "./print-button";
import { IconChevronLeft } from "@/components/icons";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const dn = await prisma.debitNote.findUnique({
    where: { id },
    select: { number: true },
  });
  return { title: dn ? `Debit Note - ${dn.number}` : "Debit Note" };
}

export const dynamic = "force-dynamic";

export default async function DebitNoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const COMPANY = await getTenant();
  await requirePermission("po:read");
  const { id } = await params;

  const dn = await prisma.debitNote.findUnique({
    where: { id },
    include: {
      vendor: {
        select: {
          id: true,
          code: true,
          name: true,
          legalName: true,
          gstin: true,
          addressLine1: true,
          city: true,
          state: true,
          pincode: true,
        },
      },
      vendorBill: {
        select: {
          id: true,
          code: true,
          billNo: true,
          billDate: true,
          totalValue: true,
        },
      },
      goodsReceipt: {
        select: {
          id: true,
          code: true,
          receivedOn: true,
        },
      },
      lines: {
        orderBy: { createdAt: "asc" },
      },
      createdBy: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!dn) {
    notFound();
  }

  const taxableValue = Number(dn.taxableValue);
  const taxAmount = Number(dn.taxAmount);
  const totalValue = Number(dn.totalValue);

  return (
    <div data-print-document className="mx-auto max-w-4xl p-6 bg-surface min-h-screen text-ink">
      {/* Top Header Actions (hidden on print) */}
      <div className="mb-6 flex items-center justify-between border-b border-edge pb-4 print:hidden">
        <Link
          href="/purchase/debit-notes"
          className="flex items-center gap-1 text-[13px] text-muted hover:text-primary transition-colors"
        >
          <IconChevronLeft size={14} />
          Back to debit notes
        </Link>
        <PrintButton />
      </div>

      {/* Debit Note Document Container */}
      <div className="border border-edge p-8 shadow-sm bg-white print:border-none print:p-0 print:shadow-none">
        {/* Banner */}
        <div className="mb-6 border-b-2 border-primary pb-3 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-primary uppercase">{COMPANY.name}</h1>
            <p className="text-xs text-muted">Procurement Department — Official Accounting Adjustment</p>
          </div>
          <div className="text-right">
            <div
              className={`inline-block rounded px-3 py-1 text-xs font-bold border ${
                dn.status === "ISSUED"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                  : "bg-rose-50 text-rose-800 border-rose-300"
              }`}
            >
              {dn.status === "ISSUED" ? "DEBIT NOTE" : "DEBIT NOTE (CANCELLED)"}
            </div>
            <p className="mt-1 font-num text-xs font-semibold text-ink">No: {dn.number}</p>
          </div>
        </div>

        {/* Title */}
        <div className="mb-6 text-center border-b border-edge pb-3">
          <h2 className="text-lg font-bold tracking-wider text-ink uppercase">Debit Note</h2>
          <p className="text-[11px] text-muted">Issued under Section 34 of the Central Goods and Services Tax Act</p>
        </div>

        {/* Vendor & Document Details Grid */}
        <div className="mb-8 grid grid-cols-2 gap-6 text-xs">
          <div>
            <h3 className="font-semibold text-muted uppercase tracking-wider text-[11px] mb-1">
              Vendor / Debited To
            </h3>
            <p className="font-bold text-ink text-sm">{dn.vendor.name}</p>
            <p className="text-muted">
              {[dn.vendor.addressLine1, dn.vendor.city, dn.vendor.state, dn.vendor.pincode]
                .filter(Boolean)
                .join(", ") || "Address on file"}
            </p>
            <p className="mt-1 font-num text-ink font-semibold">
              GSTIN: <span className="font-mono">{dn.vendor.gstin || "URP (Unregistered)"}</span>
            </p>
          </div>

          <div className="text-right space-y-1">
            <div>
              <span className="text-muted">Debit Note Number: </span>
              <span className="font-num font-semibold text-ink">{dn.number}</span>
            </div>
            <div>
              <span className="text-muted">Debit Note Date: </span>
              <span className="font-num text-ink">{date(dn.date)}</span>
            </div>
            <div className="pt-1 border-t border-edge/60">
              <span className="text-muted">Original Bill Number: </span>
              <Link href={`/finance/payable/${dn.vendorBill.id}`} className="font-num font-semibold text-primary hover:underline">
                {dn.vendorBill.billNo ? `${dn.vendorBill.billNo} (${dn.vendorBill.code})` : dn.vendorBill.code}
              </Link>
            </div>
            <div>
              <span className="text-muted">Original Bill Date: </span>
              <span className="font-num text-ink">{date(dn.vendorBill.billDate)}</span>
            </div>
            <div>
              <span className="text-muted">Against GRN Reference: </span>
              <Link href={`/procurement/grn/${dn.goodsReceipt.id}`} className="font-num text-primary hover:underline">
                {dn.goodsReceipt.code}
              </Link>
            </div>
            <div className="pt-1">
              <span className="text-muted">Reason for Debit: </span>
              <span className="font-medium text-ink">{dn.reason || "Rejection of Goods on Inward Inspection"}</span>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="mb-8 overflow-hidden rounded border border-edge">
          <table className="w-full text-left text-xs">
            <thead className="bg-faint border-b border-edge font-semibold text-ink">
              <tr>
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-3">Description / Item</th>
                <th className="py-2.5 px-3 text-right">Quantity</th>
                <th className="py-2.5 px-3 text-right">Rate (₹)</th>
                <th className="py-2.5 px-3 text-right">Taxable Value (₹)</th>
                <th className="py-2.5 px-3 text-right">Tax Amount (₹)</th>
                <th className="py-2.5 px-3 text-right">Line Total (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {dn.lines.map((l, idx) => (
                <tr key={l.id}>
                  <td className="py-2.5 px-3 text-center text-muted font-num">{idx + 1}</td>
                  <td className="py-2.5 px-3">
                    <span className="font-medium text-ink">{l.description}</span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-num">
                    {Number(l.quantity).toFixed(3)} {l.unit}
                  </td>
                  <td className="py-2.5 px-3 text-right font-num">₹{Number(l.rate).toFixed(2)}</td>
                  <td className="py-2.5 px-3 text-right font-num">{amount(Number(l.taxableValue))}</td>
                  <td className="py-2.5 px-3 text-right font-num">{amount(Number(l.taxAmount))}</td>
                  <td className="py-2.5 px-3 text-right font-num font-medium">{amount(Number(l.totalValue))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Tax Summary & Totals */}
        <div className="mb-8 flex justify-end">
          <div className="w-80 space-y-1.5 text-xs">
            <div className="flex justify-between border-b border-edge pb-1">
              <span className="text-muted">Taxable Value</span>
              <span className="font-num font-medium">{money(taxableValue)}</span>
            </div>
            <div className="flex justify-between border-b border-edge pb-1">
              <span className="text-muted">Tax Amount (GST)</span>
              <span className="font-num font-medium">{money(taxAmount)}</span>
            </div>
            <div className="flex justify-between pt-1.5 text-sm font-bold border-t-2 border-edge">
              <span>Total Debit Note Amount</span>
              <span className="font-num text-primary">{money(totalValue)}</span>
            </div>
          </div>
        </div>

        {/* Signature Block */}
        <div className="border-t border-edge pt-8 text-xs grid grid-cols-2 gap-8">
          <div>
            <p className="font-semibold text-ink mb-12">Vendor Acknowledgment</p>
            <div className="border-t border-dashed border-edge pt-2 text-muted">
              <p>Authorized Signature & Stamp</p>
              <p className="text-[11px] mt-1">Date: ________________________</p>
            </div>
          </div>
          <div className="text-right flex flex-col justify-between items-end">
            <div>
              <p className="font-semibold text-ink">For {COMPANY.name}</p>
              <p className="text-[11px] text-muted">Authorized Signatory</p>
            </div>
            <div className="border-t border-dashed border-edge pt-2 text-muted w-56 text-right mt-12">
              <p>Signature / Stamp</p>
              <p className="text-[11px] mt-1">Prepared By: {dn.createdBy?.name || "System"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
