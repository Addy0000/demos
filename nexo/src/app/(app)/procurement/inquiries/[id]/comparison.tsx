"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { selectQuotation, createOrderFromQuotation, submitVendorQuotation } from "../../sourcing-actions";
import { safeAction } from "@/lib/safe-action";
import { Section } from "@/components/detail/record";
import { Button, Input } from "@/components/ui/form";
import { Chip, quotationStatusTone } from "@/components/ui/chip";
import { money, amount, kgPlain, date, titleise } from "@/lib/format";
import { IconCheck, IconAlert, IconClose, IconApprove, IconArrowRight } from "@/components/icons";

type Line = {
  id: string; lineNo: number; materialId: string; materialCode: string;
  materialName: string; grade: string; quantityKg: number; baseRate: number;
};

type Quote = {
  id: string; code: string; status: string;
  vendorId: string; vendorName: string; vendorCity: string; rating: number;
  receivedOn: string; validUntil: string | null; leadTimeDays: number | null;
  subtotal: number; freight: number; totalValue: number;
  decisionNote: string; selectedBy: string;
  orderId: string | null; orderCode: string | null;
  rates: Record<string, { rate: number; qty: number; total: number; leadDays: number | null } | undefined>;
};

function VendorQuotationForm({
  inquiryId,
  lines,
  run,
  pending,
}: {
  inquiryId: string;
  lines: Line[];
  run: (fn: () => Promise<{ error?: string; success?: string }>, after?: () => void) => void;
  pending: boolean;
}) {
  const [rates, setRates] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const l of lines) {
      init[l.id] = l.baseRate ? String(l.baseRate) : "";
    }
    return init;
  });
  const [leadTimeDays, setLeadTimeDays] = useState("7");
  const [freight, setFreight] = useState("0");
  const [deliveryTerms, setDeliveryTerms] = useState("FOR our works");
  const [paymentTerms, setPaymentTerms] = useState("30 days credit");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payloadLines = lines.map((l) => ({
      inquiryLineId: l.id,
      materialId: l.materialId,
      ratePerKg: parseFloat(rates[l.id] || "0") || 0,
      taxPct: 18,
    }));

    if (payloadLines.some((l) => l.ratePerKg <= 0)) {
      alert("Please enter a valid rate per kg (> 0) for all material lines.");
      return;
    }

    run(() =>
      submitVendorQuotation(
        inquiryId,
        JSON.stringify(payloadLines),
        parseInt(leadTimeDays, 10) || 0,
        parseFloat(freight) || 0,
        deliveryTerms,
        paymentTerms
      )
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4">
      <div>
        <h3 className="text-[13px] font-semibold text-ink">Submit Your Quotation</h3>
        <p className="text-[11.5px] text-muted">
          Provide unit rates per kg for each requested material line and your commercial terms.
        </p>
      </div>

      <div className="rounded border border-edge">
        <table className="w-full text-left text-[12px]">
          <thead className="border-b border-edge bg-faint text-[11px] font-semibold text-muted">
            <tr>
              <th className="px-3 py-2">Material</th>
              <th className="px-3 py-2 text-right">Quantity</th>
              <th className="px-3 py-2 text-right w-36">Rate ₹/kg *</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge/60 font-num">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2">
                  <span className="block font-medium text-ink font-sans">{l.materialName}</span>
                  <span className="block text-[11px] text-muted">{l.materialCode}{l.grade && ` · ${l.grade}`}</span>
                </td>
                <td className="px-3 py-2 text-right">{kgPlain(l.quantityKg)} kg</td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={rates[l.id] || ""}
                    onChange={(e) => setRates({ ...rates, [l.id]: e.target.value })}
                    placeholder="e.g. 160.00"
                    className="h-[28px] text-right font-num text-[12px]"
                    required
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-[11.5px] font-medium text-ink">Lead time (days)</label>
          <Input
            type="number"
            min="0"
            value={leadTimeDays}
            onChange={(e) => setLeadTimeDays(e.target.value)}
            className="h-[28px] font-num text-[12px]"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11.5px] font-medium text-ink">Freight amount (₹)</label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={freight}
            onChange={(e) => setFreight(e.target.value)}
            className="h-[28px] font-num text-[12px]"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11.5px] font-medium text-ink">Delivery terms</label>
          <Input
            value={deliveryTerms}
            onChange={(e) => setDeliveryTerms(e.target.value)}
            className="h-[28px] text-[12px]"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11.5px] font-medium text-ink">Payment terms</label>
          <Input
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            className="h-[28px] text-[12px]"
          />
        </div>
      </div>

      <div className="pt-2">
        <Button variant="primary" type="submit" disabled={pending}>
          {pending ? "Submitting quotation…" : "Submit Quotation"}
        </Button>
      </div>
    </form>
  );
}

/**
 * The comparison.
 *
 * Vendors are columns and materials are rows, because that is the shape of the
 * question — one specification, several prices. The cheapest cell on each row is
 * marked, but the row winner is not the decision: lead time and the vendor's QC
 * record routinely beat a lower rate, so selecting a dearer quotation is allowed
 * and the reason is required rather than the action being blocked.
 */
export function Comparison({
  inquiryId,
  status,
  viewerIsVendor,
  canSelect,
  canOrder,
  lines,
  quotes,
}: {
  inquiryId: string;
  status: string;
  /** A vendor sees only its own column — never a comparison against rivals. */
  viewerIsVendor: boolean;
  canSelect: boolean;
  canOrder: boolean;
  lines: Line[];
  quotes: Quote[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const selected = quotes.find((q) => q.status === "SELECTED");

  const { cheapestTotal, bestByLine } = useMemo(() => {
    const totals = quotes.map((q) => q.totalValue).filter((n) => n > 0);
    const best: Record<string, number> = {};
    for (const l of lines) {
      const rates = quotes
        .map((q) => q.rates[l.id]?.rate)
        .filter((r): r is number => typeof r === "number" && r > 0);
      if (rates.length) best[l.id] = Math.min(...rates);
    }
    return { cheapestTotal: totals.length ? Math.min(...totals) : 0, bestByLine: best };
  }, [lines, quotes]);

  function run(fn: () => Promise<{ error?: string; success?: string }>, after?: () => void) {
    startTransition(async () => {
      const res = await safeAction(fn);
      setNotice(res.error ? { tone: "err", text: res.error } : { tone: "ok", text: res.success! });
      if (!res.error) {
        after?.();
        router.refresh();
      }
    });
  }

  if (quotes.length === 0) {
    return (
      <Section
        title={viewerIsVendor ? "Your quotation" : "Comparison"}
        hint={viewerIsVendor ? "Not submitted" : "Nothing to compare yet"}
      >
        {notice && (
          <div
            className={`flex items-start gap-2 border-b px-3 py-2 text-[12px] ${
              notice.tone === "ok" ? "border-success/30 bg-success-bg" : "border-danger/30 bg-danger-bg"
            }`}
          >
            {notice.tone === "ok" ? (
              <IconCheck size={14} className="mt-px shrink-0 text-success" />
            ) : (
              <IconAlert size={14} className="mt-px shrink-0 text-danger" />
            )}
            <span className="flex-1 text-ink">{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="text-muted hover:text-ink">
              <IconClose size={11} />
            </button>
          </div>
        )}
        {viewerIsVendor ? (
          <VendorQuotationForm inquiryId={inquiryId} lines={lines} run={run} pending={pending} />
        ) : (
          <p className="py-6 text-center text-[12px] text-muted">
            No quotation has come back on this inquiry. Once a vendor responds, the rates land here side by side.
          </p>
        )}
      </Section>
    );
  }

  return (
    <Section
      title={viewerIsVendor ? "Your quotation" : "Comparison"}
      hint={
        viewerIsVendor
          ? `${lines.length} ${lines.length === 1 ? "line" : "lines"}`
          : selected
            ? `${selected.vendorName} selected`
            : `${quotes.length} quotations · ${lines.length} lines`
      }
      padded={false}
    >
      {notice && (
        <div
          className={`flex items-start gap-2 border-b px-3 py-2 text-[12px] ${
            notice.tone === "ok" ? "border-success/30 bg-success-bg" : "border-danger/30 bg-danger-bg"
          }`}
        >
          {notice.tone === "ok" ? (
            <IconCheck size={14} className="mt-px shrink-0 text-success" />
          ) : (
            <IconAlert size={14} className="mt-px shrink-0 text-danger" />
          )}
          <span className="flex-1 text-ink">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="text-muted hover:text-ink">
            <IconClose size={11} />
          </button>
        </div>
      )}

      <div className="overflow-x-auto scroll-thin">
        <table className="w-full" style={{ minWidth: `${320 + quotes.length * 168}px` }}>
          <thead>
            <tr className="border-b border-edge bg-faint">
              <th className="sticky left-0 z-10 w-[320px] bg-faint px-2.5 py-1.5 text-left text-[10.5px] font-semibold text-muted">
                Material
              </th>
              {quotes.map((q) => {
                const won = q.status === "SELECTED";
                return (
                  <th
                    key={q.id}
                    className={`w-[168px] border-l border-edge px-2.5 py-1.5 text-left align-top ${won ? "bg-success-bg" : ""}`}
                  >
                    <Link href={`/procurement/vendors/${q.vendorId}`} className="ref-link block truncate text-[12px] font-semibold">
                      {q.vendorName}
                    </Link>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      <span className="font-num text-[10.5px] tabular-nums text-muted">{q.code}</span>
                      <span className="text-[10.5px] text-muted">·</span>
                      <span className="font-num text-[10.5px] tabular-nums text-muted" title="Vendor rating">
                        {q.rating.toFixed(1)}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[10.5px] font-normal text-muted">
                      {q.leadTimeDays ? `${q.leadTimeDays} d lead` : "lead not stated"}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-edge/60">
                <td className="sticky left-0 z-10 bg-surface px-2.5 py-2">
                  <Link href={`/procurement/materials/${l.materialId}`} className="ref-link text-[12px]">
                    {l.materialName}
                  </Link>
                  <span className="block font-num text-[11px] text-muted">
                    {l.materialCode}{l.grade && ` · ${l.grade}`} · {kgPlain(l.quantityKg)} kg
                  </span>
                </td>

                {quotes.map((q) => {
                  const cell = q.rates[l.id];
                  const won = q.status === "SELECTED";
                  if (!cell) {
                    return (
                      <td key={q.id} className={`border-l border-edge px-2.5 py-2 text-[11.5px] text-muted ${won ? "bg-success-bg/50" : ""}`}>
                        not quoted
                      </td>
                    );
                  }
                  // "best" and the percentage over it are comparative — with one
                  // column they would tell a vendor where it sat against rivals.
                  const isBest = !viewerIsVendor && bestByLine[l.id] === cell.rate;
                  const overBest =
                    viewerIsVendor || !bestByLine[l.id]
                      ? 0
                      : ((cell.rate - bestByLine[l.id]!) / bestByLine[l.id]!) * 100;
                  return (
                    <td key={q.id} className={`border-l border-edge px-2.5 py-2 ${won ? "bg-success-bg/50" : ""}`}>
                      <span className={`block font-num text-[12.5px] tabular-nums ${isBest ? "font-semibold text-success-text" : "text-ink"}`}>
                        ₹{cell.rate.toFixed(2)}
                        {isBest && <span className="ml-1 text-[10px] font-normal">best</span>}
                      </span>
                      <span className="block font-num text-[10.5px] tabular-nums text-muted">
                        {amount(cell.total)}
                        {!isBest && overBest > 0 && (
                          <span className="ml-1 text-warning">+{overBest.toFixed(1)}%</span>
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t border-edge bg-faint">
              <td className="sticky left-0 z-10 bg-faint px-2.5 py-2 text-[11.5px] font-medium text-ink">
                Landed total
                <span className="block text-[10.5px] font-normal text-muted">including tax and freight</span>
              </td>
              {quotes.map((q) => {
                const won = q.status === "SELECTED";
                const premium = q.totalValue - cheapestTotal;
                return (
                  <td key={q.id} className={`border-l border-edge px-2.5 py-2 ${won ? "bg-success-bg" : ""}`}>
                    <span className="block font-num text-[12.5px] font-semibold tabular-nums text-ink">
                      {money(q.totalValue)}
                    </span>
                    {!viewerIsVendor && (
                      <span className="block font-num text-[10.5px] tabular-nums">
                        {premium === 0 ? (
                          <span className="text-success-text">lowest</span>
                        ) : (
                          <span className="text-warning">+{money(premium)}</span>
                        )}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>

            <tr className="border-t border-edge bg-faint">
              <td className="sticky left-0 z-10 bg-faint px-2.5 py-2 text-[11.5px] text-muted">Decision</td>
              {quotes.map((q) => {
                const won = q.status === "SELECTED";
                return (
                  <td key={q.id} className={`border-l border-edge px-2.5 py-2 align-top ${won ? "bg-success-bg" : ""}`}>
                    <Chip tone={quotationStatusTone(q.status)}>{titleise(q.status)}</Chip>

                    {won && q.orderCode && q.orderId && (
                      <Link href={`/procurement/orders/${q.orderId}`} className="ref-link mt-1 block font-num text-[11px]">
                        {q.orderCode}
                      </Link>
                    )}

                    {won && !q.orderCode && canOrder && (
                      <Button
                        variant="primary"
                        className="mt-1.5 h-[24px] w-full px-1.5 text-[11px]"
                        disabled={pending}
                        onClick={() => run(() => createOrderFromQuotation(q.id))}
                      >
                        <IconArrowRight size={12} />
                        Raise order
                      </Button>
                    )}

                    {!selected && canSelect && choosing !== q.id && (
                      <Button
                        variant="outline"
                        className="mt-1.5 h-[24px] w-full px-1.5 text-[11px]"
                        onClick={() => { setChoosing(q.id); setReason(""); }}
                      >
                        Select
                      </Button>
                    )}

                    {choosing === q.id && (
                      <span className="animate-pop mt-1.5 block">
                        {q.totalValue > cheapestTotal && (
                          <Input
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Why, over the lowest?"
                            className="mb-1 h-[24px] text-[11px]"
                            autoFocus
                          />
                        )}
                        <span className="flex gap-1">
                          <Button
                            variant="success"
                            className="h-[24px] flex-1 px-1 text-[11px]"
                            disabled={pending}
                            onClick={() => run(() => selectQuotation(q.id, reason), () => { setChoosing(null); setReason(""); })}
                          >
                            <IconApprove size={12} />
                            Confirm
                          </Button>
                          <Button variant="ghost" className="h-[24px] px-1.5 text-[11px]" onClick={() => setChoosing(null)}>
                            Back
                          </Button>
                        </span>
                      </span>
                    )}

                    {/* The stored note names the winning vendor ("Higher landed
                        cost than X"), which is precisely what a losing vendor
                        must not be told. It gets the outcome, not the rival. */}
                    {q.decisionNote && !viewerIsVendor && (
                      <p className="mt-1 text-[10.5px] leading-snug text-muted">{q.decisionNote}</p>
                    )}
                    {viewerIsVendor && q.status === "REJECTED" && (
                      <p className="mt-1 text-[10.5px] leading-snug text-muted">
                        This inquiry was placed elsewhere.
                      </p>
                    )}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-edge px-3 py-2 text-[11px] text-muted">
        <span>Received {quotes.map((q) => date(q.receivedOn)).join(" · ")}</span>
        {!viewerIsVendor && selected?.selectedBy && (
          <span>
            Selected by <span className="text-ink">{selected.selectedBy}</span>
          </span>
        )}
        {!viewerIsVendor && !selected && canSelect && (
          <span>Selecting a quotation closes the others and records why.</span>
        )}
        {!viewerIsVendor && !selected && !canSelect && status !== "COMPARED" && (
          <span>Comparison is read-only for your role — the Purchase Head selects.</span>
        )}
        {viewerIsVendor && (
          <span>Only your own quotation is shown. Other responses are not visible to you.</span>
        )}
      </div>
    </Section>
  );
}
