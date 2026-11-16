"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitRequisition, decideRequisition, raiseInquiry, convertRequisitionToPO } from "../../sourcing-actions";
import { safeAction } from "@/lib/safe-action";
import { Button, Input, Textarea } from "@/components/ui/form";
import { IconApprove, IconClose, IconAlert, IconCheck, IconVendor, IconDocument } from "@/components/icons";

type Candidate = { id: string; name: string; city: string; rating: number; covers: number };

/**
 * The requisition's whole action surface: send for approval, decide it, and —
 * once approved — take it to the market (RFQ) or convert it directly to a PO.
 *
 * The inquiry step carries the vendor shortlist rather than sending the operator
 * to a separate screen to rebuild it, because the shortlist is derived from what
 * the requisition asks for and the system already knows who supplies it.
 */
export function RequisitionActions({
  requisitionId,
  status,
  canWrite,
  canApprove,
  canInquire,
  canOrder,
  isOwnRequisition,
  hasInquiry,
  candidates,
  lineCount,
}: {
  requisitionId: string;
  status: string;
  canWrite: boolean;
  canApprove: boolean;
  canInquire: boolean;
  canOrder: boolean;
  isOwnRequisition: boolean;
  hasInquiry: boolean;
  candidates: Candidate[];
  lineCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const [sourcing, setSourcing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [dueOn, setDueOn] = useState("");
  const [terms, setTerms] = useState("Rates FOR our works, inclusive of freight. Validity 30 days.");

  // Direct-to-PO conversion state
  const [converting, setConverting] = useState(false);
  const [poVendorId, setPoVendorId] = useState("");
  const [poPaymentTerms, setPoPaymentTerms] = useState("30 days credit");
  const [poDeliveryTerms, setPoDeliveryTerms] = useState("FOR our works");
  const [poExpectedOn, setPoExpectedOn] = useState("");

  const isDraft = status === "DRAFT";
  const isPending = status === "PENDING_APPROVAL";
  const isApproved = status === "APPROVED" || status === "PARTIALLY_ORDERED";

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

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  if (!canWrite && !canApprove && !canInquire && !canOrder) return null;

  return (
    <div className="relative flex items-center gap-1.5">
      {notice && (
        <span
          className={`absolute right-0 top-[calc(100%+8px)] z-40 flex w-80 items-start gap-2 rounded border px-2.5 py-2 text-[12px] shadow-pop ${
            notice.tone === "ok" ? "border-success/35 bg-success-bg" : "border-danger/35 bg-danger-bg"
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
        </span>
      )}

      {canWrite && isDraft && (
        <Button
          variant="primary"
          disabled={pending || lineCount === 0}
          onClick={() => run(() => submitRequisition(requisitionId))}
        >
          Send for approval
        </Button>
      )}

      {/* An approver who cannot sign this one is told why, not shown an empty bar. */}
      {isPending && canApprove && isOwnRequisition && (
        <span className="flex items-center gap-1.5 rounded border border-edge bg-faint px-2.5 py-1 text-[11.5px] text-muted">
          <IconAlert size={12} />
          You raised this — it needs another signer.
        </span>
      )}

      {isPending && canApprove && !isOwnRequisition && !rejecting && (
        <>
          <Button variant="success" disabled={pending} onClick={() => run(() => decideRequisition(requisitionId, true, ""))}>
            <IconApprove size={13} />
            Approve
          </Button>
          <Button variant="outline" onClick={() => setRejecting(true)}>Reject</Button>
        </>
      )}

      {rejecting && (
        <span className="animate-pop flex items-center gap-1.5">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why — the raiser has to act on this"
            className="h-[26px] w-72"
            autoFocus
          />
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => run(() => decideRequisition(requisitionId, false, reason), () => { setRejecting(false); setReason(""); })}
          >
            Confirm
          </Button>
          <Button variant="ghost" onClick={() => { setRejecting(false); setReason(""); }}>Back</Button>
        </span>
      )}

      {/* ── Approved actions: direct-PO path then RFQ path ── */}

      {canOrder && isApproved && !converting && !sourcing && (
        <Button variant="outline" onClick={() => setConverting(true)}>
          <IconDocument size={13} />
          Convert to PO
        </Button>
      )}

      {canInquire && isApproved && !sourcing && !converting && (
        <Button variant={hasInquiry ? "outline" : "primary"} onClick={() => setSourcing(true)}>
          <IconVendor size={13} />
          {hasInquiry ? "Raise another inquiry" : "Raise inquiry"}
        </Button>
      )}

      {/* ── Direct-to-PO conversion panel ── */}
      {converting && (
        <div className="animate-pop absolute right-0 top-[calc(100%+8px)] z-40 w-[400px] rounded-md border border-edge bg-surface shadow-pop">
          <header className="flex h-[32px] items-center gap-2 border-b border-edge bg-faint px-3">
            <h3 className="text-[11.5px] font-semibold text-ink">Convert to Purchase Order</h3>
            <div className="flex-1" />
            <button type="button" onClick={() => setConverting(false)} aria-label="Close" className="text-muted hover:text-ink">
              <IconClose size={12} />
            </button>
          </header>

          <div className="space-y-3 p-3">
            {candidates.length === 0 ? (
              <p className="rounded border border-warning/30 bg-warning-bg px-3 py-2 text-[11.5px] leading-relaxed text-ink">
                No active vendor is linked to these materials. Link a supplier on the vendor record first, or use the RFQ path.
              </p>
            ) : (
              <>
                <div>
                  <label className="mb-1 block text-[11.5px] font-medium text-ink">Vendor *</label>
                  <select
                    value={poVendorId}
                    onChange={(e) => setPoVendorId(e.target.value)}
                    className="h-[28px] w-full rounded border border-edge bg-faint px-2 text-[12px] text-ink focus:border-primary focus:outline-none"
                  >
                    <option value="">— select vendor —</option>
                    {candidates.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} · {v.city} · covers {v.covers}/{lineCount} lines
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[11.5px] font-medium text-ink">Payment terms</label>
                  <Input
                    value={poPaymentTerms}
                    onChange={(e) => setPoPaymentTerms(e.target.value)}
                    placeholder="e.g. 30 days credit"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[11.5px] font-medium text-ink">Delivery terms</label>
                  <Input
                    value={poDeliveryTerms}
                    onChange={(e) => setPoDeliveryTerms(e.target.value)}
                    placeholder="e.g. FOR our works"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[11.5px] font-medium text-ink">Expected delivery by</label>
                  <Input type="date" value={poExpectedOn} onChange={(e) => setPoExpectedOn(e.target.value)} />
                </div>

                <p className="text-[11px] leading-relaxed text-muted">
                  Rates are taken from each material&apos;s current approved price. The PO will land in the approval queue, same as any order created via RFQ.
                </p>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 border-t border-edge px-3 pb-3 pt-2">
            {candidates.length > 0 && (
              <Button
                variant="primary"
                disabled={pending || !poVendorId}
                onClick={() =>
                  run(
                    async () => {
                      const res = await convertRequisitionToPO(
                        requisitionId,
                        poVendorId,
                        poPaymentTerms,
                        poDeliveryTerms,
                        poExpectedOn || null,
                      );
                      if (res.orderId) router.push(`/procurement/orders/${res.orderId}`);
                      return res;
                    },
                    () => { setConverting(false); setPoVendorId(""); },
                  )
                }
              >
                {pending ? "Creating…" : "Create PO"}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setConverting(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* ── RFQ inquiry panel ── */}
      {sourcing && (
        <div className="animate-pop absolute right-0 top-[calc(100%+8px)] z-40 w-[420px] rounded-md border border-edge bg-surface shadow-pop">
          <header className="flex h-[32px] items-center gap-2 border-b border-edge bg-faint px-3">
            <h3 className="text-[11.5px] font-semibold text-ink">Put this to the market</h3>
            <span className="text-[11px] text-muted">
              {picked.length === 0 ? "Pick at least two" : `${picked.length} selected`}
            </span>
            <div className="flex-1" />
            <button type="button" onClick={() => setSourcing(false)} aria-label="Close" className="text-muted hover:text-ink">
              <IconClose size={12} />
            </button>
          </header>

          {/* Fewer than two suppliers is a dead end, not an error the operator
              caused — say which way out exists rather than leaving a disabled
              button and a rule they cannot satisfy. */}
          {candidates.length < 2 && (
            <p className="border-b border-warning/30 bg-warning-bg px-3 py-2 text-[11.5px] leading-relaxed text-ink">
              {candidates.length === 0
                ? "No active vendor is linked to these materials, so there is nobody to ask. Link a supplier on the vendor record, then come back."
                : `Only ${candidates[0]!.name} is linked to these materials, so there is nothing to compare. Link a second supplier, or raise the order against them directly from Purchase orders.`}
            </p>
          )}

          <div className="max-h-[240px] overflow-y-auto scroll-thin">
            {candidates.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12px] text-muted">
                Nothing to show until a vendor supplies one of these materials.
              </p>
            ) : (
              candidates.map((v) => (
                <label
                  key={v.id}
                  className="flex cursor-pointer items-center gap-2 border-b border-edge/60 px-3 py-1.5 last:border-b-0 hover:bg-faint"
                >
                  <input
                    type="checkbox"
                    checked={picked.includes(v.id)}
                    onChange={() => toggle(v.id)}
                    className="h-[13px] w-[13px] shrink-0 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-ink">{v.name}</span>
                    <span className="block text-[11px] text-muted">
                      {v.city} · covers {v.covers} of {lineCount}
                    </span>
                  </span>
                  <span className="shrink-0 font-num text-[11.5px] tabular-nums text-muted">{v.rating.toFixed(1)}</span>
                </label>
              ))
            )}
          </div>

          <div className="border-t border-edge p-3">
            <label className="mb-1 block text-[11.5px] font-medium text-ink">Quotations due by</label>
            <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
            <label className="mb-1 mt-2 block text-[11.5px] font-medium text-ink">Terms sent with the inquiry</label>
            <Textarea rows={2} value={terms} onChange={(e) => setTerms(e.target.value)} />
            <div className="mt-2 flex items-center gap-1.5">
              <Button
                variant="primary"
                disabled={pending || picked.length < 2}
                onClick={() =>
                  run(
                    async () => {
                      const res = await raiseInquiry(requisitionId, JSON.stringify(picked), dueOn, terms);
                      if (res.inquiryId) router.push(`/procurement/inquiries/${res.inquiryId}`);
                      return res;
                    },
                    () => { setSourcing(false); setPicked([]); },
                  )
                }
              >
                {pending ? "Issuing…" : `Issue to ${picked.length || "…"}`}
              </Button>
              <Button variant="ghost" onClick={() => setSourcing(false)}>Cancel</Button>
            </div>
            {candidates.length >= 2 && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                One quotation is not a comparison — the inquiry needs at least two vendors before it can go out.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

