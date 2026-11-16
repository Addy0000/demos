import type { Metadata } from "next";
import { getTenant } from "@/lib/tenant-server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { PostingSide } from "@prisma/client";
import { money, amount, date } from "@/lib/format";
import { PrintButton } from "./print-button";
import { ReverseVoucherButton } from "./reverse-button";
import { IconChevronLeft } from "@/components/icons";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ voucherNo: string }>;
}): Promise<Metadata> {
  const { voucherNo } = await params;
  return { title: `Journal Voucher - ${voucherNo}` };
}

export const dynamic = "force-dynamic";

export default async function JournalDetailPage({
  params,
}: {
  params: Promise<{ voucherNo: string }>;
}) {
  const COMPANY = await getTenant();
  const user = await requirePermission("journal:read");
  const canReverse = can(user.role, "journal:reverse");

  const { voucherNo } = await params;

  // Unknown voucherNo or non-JV series returns standard not-found
  if (!voucherNo || !voucherNo.startsWith("JV-")) {
    notFound();
  }

  const postings = await prisma.ledgerPosting.findMany({
    where: { voucherNo },
    include: {
      account: { select: { id: true, code: true, name: true, type: true } },
      customer: { select: { id: true, name: true, code: true } },
      vendor: { select: { id: true, name: true, code: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (postings.length === 0) {
    notFound();
  }

  // Check if this voucher has been reversed
  const reversalPosting = await prisma.ledgerPosting.findFirst({
    where: { reversalOfVoucherNo: voucherNo },
    select: { voucherNo: true, postedAt: true, remark: true },
  });

  let reversalReason: string | null = null;
  let reversalDate: Date | null = null;

  if (reversalPosting?.voucherNo) {
    const reversalAudit = await prisma.auditEvent.findFirst({
      where: {
        entityType: "JOURNAL",
        entityId: reversalPosting.voucherNo,
        action: "REVERSE",
      },
      select: { createdAt: true, metadata: true },
    });
    reversalReason = (reversalAudit?.metadata as any)?.reason ?? reversalPosting.remark ?? "Reversal";
    reversalDate = reversalPosting.postedAt ?? reversalAudit?.createdAt ?? null;
  }

  // Check if this voucher is a reversal of another voucher
  const originalVoucherNo = postings.find((p) => p.reversalOfVoucherNo)?.reversalOfVoucherNo ?? null;

  // Fetch creator from AuditEvent
  const auditEvent = await prisma.auditEvent.findFirst({
    where: {
      entityType: "JOURNAL",
      entityId: voucherNo,
      action: "POST",
    },
    include: {
      actor: { select: { id: true, name: true, email: true } },
    },
  });

  const createdByName = auditEvent?.actor?.name ?? auditEvent?.actor?.email ?? "System";
  const narration = (auditEvent?.metadata as any)?.remark ?? postings[0].remark ?? "—";
  const voucherDate = postings[0].postedAt;
  const isReversed = !!reversalPosting;
  const status = isReversed ? "REVERSED" : "POSTED";

  const debitTotal = postings
    .filter((p) => p.side === PostingSide.DEBIT)
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const creditTotal = postings
    .filter((p) => p.side === PostingSide.CREDIT)
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div data-print-document className="mx-auto max-w-4xl p-6 bg-surface min-h-screen text-ink">
      {/* Top Header Actions (hidden on print) */}
      <div className="mb-6 flex items-center justify-between border-b border-edge pb-4 print:hidden">
        <Link
          href="/finance/journal"
          className="flex items-center gap-1 text-[13px] text-muted hover:text-primary transition-colors"
        >
          <IconChevronLeft size={14} />
          Back to journal vouchers
        </Link>
        <div className="flex items-center gap-2.5">
          {canReverse && status === "POSTED" && !originalVoucherNo && (
            <ReverseVoucherButton voucherNo={voucherNo} />
          )}
          <PrintButton />
        </div>
      </div>

      {/* Reversal Banners */}
      {isReversed && reversalPosting && (
        <div className="mb-4 rounded border border-rose-300 bg-rose-50 px-4 py-3 text-[12.5px] text-rose-800 print:hidden flex items-center justify-between">
          <div>
            <span className="font-semibold">Reversed by </span>
            <Link
              href={`/finance/journal/${encodeURIComponent(reversalPosting.voucherNo!)}`}
              className="font-mono font-bold underline hover:opacity-80"
            >
              {reversalPosting.voucherNo}
            </Link>
            <span> on {date(reversalDate)} — {reversalReason}</span>
          </div>
        </div>
      )}

      {originalVoucherNo && (
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-800 print:hidden flex items-center justify-between">
          <div>
            <span className="font-semibold">Reversal of </span>
            <Link
              href={`/finance/journal/${encodeURIComponent(originalVoucherNo)}`}
              className="font-mono font-bold underline hover:opacity-80"
            >
              {originalVoucherNo}
            </Link>
          </div>
        </div>
      )}

      {/* Journal Voucher Document Container */}
      <div className="border border-edge p-8 shadow-sm bg-white print:border-none print:p-0 print:shadow-none relative">
        {/* Watermark / Stamp for Reversed Vouchers in Print & View */}
        {isReversed && (
          <div className="hidden print:block absolute right-8 top-16 -rotate-12 border-4 border-rose-600 px-4 py-1.5 text-lg font-black tracking-widest text-rose-600 uppercase opacity-70 pointer-events-none">
            REVERSED
          </div>
        )}

        {/* Company Header */}
        <div className="mb-6 border-b-2 border-primary pb-3 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-primary uppercase">{COMPANY.name}</h1>
            <p className="text-xs text-muted">Finance Department — Official Accounting Voucher</p>
          </div>
          <div className="text-right">
            <div
              className={`inline-block rounded px-3 py-1 text-xs font-bold border ${
                status === "POSTED"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                  : "bg-rose-50 text-rose-800 border-rose-300"
              }`}
            >
              {status === "POSTED" ? "JOURNAL VOUCHER (POSTED)" : "JOURNAL VOUCHER (REVERSED)"}
            </div>
            <p className="mt-1 font-mono text-xs font-semibold text-ink">No: {voucherNo}</p>
          </div>
        </div>

        {/* Title */}
        <div className="mb-6 text-center border-b border-edge pb-3">
          <h2 className="text-lg font-bold tracking-wider text-ink uppercase">Journal Voucher</h2>
          <p className="text-[11px] text-muted">General Ledger Journal Entry</p>
        </div>

        {/* Document Details Grid */}
        <div className="mb-8 grid grid-cols-2 gap-6 text-xs">
          <div>
            <h3 className="font-semibold text-muted uppercase tracking-wider text-[11px] mb-1">
              Voucher Particulars
            </h3>
            <p className="font-bold text-ink text-sm font-mono">{voucherNo}</p>
            <div className="mt-2 space-y-1">
              <div>
                <span className="text-muted">Narration / Remark: </span>
                <span className="font-medium text-ink">{narration}</span>
              </div>
              {originalVoucherNo && (
                <div>
                  <span className="text-muted">Original Voucher: </span>
                  <Link
                    href={`/finance/journal/${encodeURIComponent(originalVoucherNo)}`}
                    className="font-mono text-primary font-semibold hover:underline"
                  >
                    {originalVoucherNo}
                  </Link>
                </div>
              )}
              {isReversed && reversalPosting && (
                <div>
                  <span className="text-muted">Reversed By: </span>
                  <Link
                    href={`/finance/journal/${encodeURIComponent(reversalPosting.voucherNo!)}`}
                    className="font-mono text-danger font-semibold hover:underline"
                  >
                    {reversalPosting.voucherNo}
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="text-right space-y-1">
            <div>
              <span className="text-muted">Posting Date: </span>
              <span className="font-num font-semibold text-ink">{date(voucherDate)}</span>
            </div>
            <div>
              <span className="text-muted">Status: </span>
              <span className={`font-semibold ${status === "POSTED" ? "text-success" : "text-danger"}`}>
                {status}
              </span>
            </div>
            <div className="pt-1 border-t border-edge/60">
              <span className="text-muted">Created By: </span>
              <span className="font-medium text-ink">{createdByName}</span>
            </div>
          </div>
        </div>

        {/* Legs Table */}
        <div className="mb-8 overflow-hidden rounded border border-edge">
          <table className="w-full text-left text-xs">
            <thead className="bg-faint border-b border-edge font-semibold text-ink">
              <tr>
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-3">Account Code & Name</th>
                <th className="py-2.5 px-3">Party (Customer / Vendor)</th>
                <th className="py-2.5 px-3 text-right">Debit (₹)</th>
                <th className="py-2.5 px-3 text-right">Credit (₹)</th>
                <th className="py-2.5 px-3">Line Remark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {postings.map((p, idx) => {
                const partyName = p.customer
                  ? `${p.customer.name}${p.customer.code ? ` (${p.customer.code})` : ""}`
                  : p.vendor
                  ? `${p.vendor.name}${p.vendor.code ? ` (${p.vendor.code})` : ""}`
                  : null;

                const isDebit = p.side === PostingSide.DEBIT;
                const isCredit = p.side === PostingSide.CREDIT;

                return (
                  <tr key={p.id}>
                    <td className="py-2.5 px-3 text-center text-muted font-num">{idx + 1}</td>
                    <td className="py-2.5 px-3">
                      <span className="font-mono font-semibold text-primary mr-1.5">{p.account.code}</span>
                      <span className="font-medium text-ink">{p.account.name}</span>
                    </td>
                    <td className="py-2.5 px-3 text-muted">
                      {partyName ? <span className="font-medium text-ink">{partyName}</span> : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-num font-mono">
                      {isDebit ? amount(Number(p.amount)) : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-num font-mono">
                      {isCredit ? amount(Number(p.amount)) : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-muted text-[11.5px]">
                      {p.remark || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Totals Row */}
            <tfoot className="bg-faint/80 border-t-2 border-edge font-semibold text-ink">
              <tr>
                <td colSpan={3} className="py-2.5 px-3 text-right uppercase tracking-wider text-[11px]">
                  Total:
                </td>
                <td className="py-2.5 px-3 text-right font-mono font-bold text-ink">
                  {money(debitTotal, 2)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono font-bold text-ink">
                  {money(creditTotal, 2)}
                </td>
                <td className="py-2.5 px-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Signature Block */}
        <div className="border-t border-edge pt-8 text-xs grid grid-cols-2 gap-8">
          <div>
            <p className="font-semibold text-ink mb-12">Prepared By</p>
            <div className="border-t border-dashed border-edge pt-2 text-muted">
              <p>Name: {createdByName}</p>
              <p className="text-[11px] mt-1">Date: {date(voucherDate)}</p>
            </div>
          </div>
          <div className="text-right flex flex-col justify-between items-end">
            <div>
              <p className="font-semibold text-ink">Authorised Signatory</p>
              <p className="text-[11px] text-muted">Finance & Accounts</p>
            </div>
            <div className="border-t border-dashed border-edge pt-2 text-muted w-56 text-right mt-12">
              <p>Signature / Stamp</p>
              <p className="text-[11px] mt-1">Date: ________________________</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

