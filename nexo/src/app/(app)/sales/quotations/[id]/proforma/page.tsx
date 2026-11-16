import type { Metadata } from "next";
import { getTenant } from "@/lib/tenant-server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { money, amount, kgPlain, date } from "@/lib/format";
import { PrintButton } from "./print-button";
import { IconChevronLeft } from "@/components/icons";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const q = await prisma.salesQuotation.findUnique({ where: { id }, select: { code: true } });
  return { title: q ? `Proforma - ${q.code}` : "Proforma invoice" };
}

export const dynamic = "force-dynamic";

export default async function ProformaPage({ params }: { params: Promise<{ id: string }> }) {
  const COMPANY = await getTenant();
  await requirePermission("squote:read");
  const { id } = await params;

  const q = await prisma.salesQuotation.findUnique({
    where: { id },
    include: {
      customer: {
        select: {
          id: true,
          code: true,
          name: true,
          gstin: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          pincode: true,
        },
      },
      lines: {
        orderBy: { lineNo: "asc" },
        include: {
          project: { select: { id: true, code: true, name: true, application: true } },
        },
      },
    },
  });

  if (!q || q.status === "REJECTED" || q.status === "EXPIRED") {
    notFound();
  }

  const subtotal = Number(q.subtotal);
  const taxAmount = Number(q.taxAmount);
  const totalValue = Number(q.totalValue);

  return (
    <div data-print-document className="mx-auto max-w-4xl p-6 bg-surface min-h-screen text-ink">
      {/* Top Header Actions (hidden on print) */}
      <div className="mb-6 flex items-center justify-between border-b border-edge pb-4 print:hidden">
        <Link
          href={`/sales/quotations/${q.id}`}
          className="flex items-center gap-1 text-[13px] text-muted hover:text-primary transition-colors"
        >
          <IconChevronLeft size={14} />
          Back to quotation {q.code}
        </Link>
        <PrintButton />
      </div>

      {/* Proforma Document Container */}
      <div className="border border-edge p-8 shadow-sm bg-white print:border-none print:p-0 print:shadow-none">
        {/* Banner */}
        <div className="mb-6 border-b-2 border-primary pb-3 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-primary uppercase">{COMPANY.name}</h1>
            <p className="text-xs text-muted">Sales Department — Official Proforma Document</p>
          </div>
          <div className="text-right">
            <div className="inline-block rounded bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900 border border-amber-300">
              PROFORMA — not a tax invoice
            </div>
            <p className="mt-1 font-num text-xs font-semibold text-ink">Ref: {q.code}</p>
          </div>
        </div>

        {/* Document Details Grid */}
        <div className="mb-8 grid grid-cols-2 gap-6 text-xs">
          <div>
            <h2 className="font-semibold text-muted uppercase tracking-wider text-[11px] mb-1">Customer / Billed To</h2>
            <p className="font-bold text-ink text-sm">{q.customer.name}</p>
            <p className="text-muted">
              {[q.customer.addressLine1, q.customer.addressLine2, q.customer.city, q.customer.state, q.customer.pincode]
                .filter(Boolean)
                .join(", ") || "Address on file"}
            </p>
            {q.customer.gstin && <p className="mt-1 font-num text-ink">GSTIN: {q.customer.gstin}</p>}
          </div>

          <div className="text-right space-y-1">
            <div>
              <span className="text-muted">Proforma Reference: </span>
              <span className="font-num font-semibold text-ink">{q.code}</span>
            </div>
            <div>
              <span className="text-muted">Issued Date: </span>
              <span className="font-num text-ink">{date(q.issuedOn)}</span>
            </div>
            <div>
              <span className="text-muted">Valid Until: </span>
              <span className="font-num text-ink">{q.validUntil ? date(q.validUntil) : "Until further notice"}</span>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="mb-8 overflow-hidden rounded border border-edge">
          <table className="w-full text-left text-xs">
            <thead className="bg-faint border-b border-edge font-semibold text-ink">
              <tr>
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-3">Compound / Description</th>
                <th className="py-2.5 px-3 text-right">Quantity (kg)</th>
                <th className="py-2.5 px-3 text-right">Rate (₹/kg)</th>
                <th className="py-2.5 px-3 text-right">Tax %</th>
                <th className="py-2.5 px-3 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {q.lines.map((l) => (
                <tr key={l.id}>
                  <td className="py-2 px-3 text-center text-muted font-num">{l.lineNo}</td>
                  <td className="py-2 px-3">
                    <span className="font-medium text-ink">{l.project.name}</span>
                    <span className="block text-[11px] text-muted">{l.project.code} · {l.project.application}</span>
                  </td>
                  <td className="py-2 px-3 text-right font-num">{kgPlain(Number(l.quantityKg))}</td>
                  <td className="py-2 px-3 text-right font-num">₹{Number(l.ratePerKg).toFixed(2)}</td>
                  <td className="py-2 px-3 text-right font-num">{Number(l.taxPct)}%</td>
                  <td className="py-2 px-3 text-right font-num font-medium">{amount(Number(l.lineTotal))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary Totals */}
        <div className="mb-8 flex justify-end">
          <div className="w-72 space-y-1.5 text-xs">
            <div className="flex justify-between border-b border-edge pb-1">
              <span className="text-muted">Subtotal</span>
              <span className="font-num font-medium">{money(subtotal)}</span>
            </div>
            <div className="flex justify-between border-b border-edge pb-1">
              <span className="text-muted">Tax Amount (GST)</span>
              <span className="font-num font-medium">{money(taxAmount)}</span>
            </div>
            <div className="flex justify-between pt-1 text-sm font-bold">
              <span>Total Proforma Amount</span>
              <span className="font-num text-primary">{money(totalValue)}</span>
            </div>
          </div>
        </div>

        {/* Commercial Terms */}
        <div className="border-t border-edge pt-4 text-xs grid grid-cols-2 gap-4">
          <div>
            <h3 className="font-semibold text-ink mb-1">Commercial & Delivery Terms</h3>
            <p className="text-muted"><span className="font-medium text-ink">Payment terms:</span> {q.paymentTerms || "30 days NET"}</p>
            <p className="text-muted"><span className="font-medium text-ink">Delivery terms:</span> {q.deliveryTerms || "Ex-works / Door delivery as agreed"}</p>
            {q.leadTimeDays && <p className="text-muted"><span className="font-medium text-ink">Lead time:</span> {q.leadTimeDays} days from PO</p>}
          </div>
          <div className="text-right text-muted text-[11px] flex flex-col justify-end">
            <p className="font-semibold text-ink">This is a proforma quotation document.</p>
            <p>Subject to final sales order acceptance and credit clearance.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
