"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { acceptQuotation, rejectQuotation } from "../../sales-actions";
import { safeAction } from "@/lib/safe-action";
import { Button, Input } from "@/components/ui/form";
import { IconClose, IconAlert, IconCheck, IconArrowRight } from "@/components/icons";

/**
 * "The customer said yes." Turning that into an order is one click, but not while
 * the margin behind it is unsigned — the block names the sheet rather than just
 * greying the button.
 */
export function QuotationActions({
  quotationId,
  status,
  canOrder,
  existingOrder,
  costSheetUnsigned,
  costSheetCode,
}: {
  quotationId: string;
  status: string;
  canOrder: boolean;
  existingOrder: { id: string; code: string } | null;
  costSheetUnsigned: boolean;
  costSheetCode: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const canViewProforma = !["REJECTED", "EXPIRED"].includes(status);
  const isSent = status === "SENT";

  return (
    <div className="relative flex items-center gap-1.5">
      {notice && (
        <span
          className={`absolute right-0 top-[calc(100%+8px)] z-40 flex w-96 items-start gap-2 rounded border px-2.5 py-2 text-[12px] shadow-pop ${
            notice.tone === "ok" ? "border-success/35 bg-success-bg" : "border-danger/35 bg-danger-bg"
          }`}
        >
          {notice.tone === "ok" ? (
            <IconCheck size={14} className="mt-px shrink-0 text-success" />
          ) : (
            <IconAlert size={14} className="mt-px shrink-0 text-danger" />
          )}
          <span className="flex-1 leading-relaxed text-ink">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="text-muted hover:text-ink">
            <IconClose size={11} />
          </button>
        </span>
      )}

      {canViewProforma && (
        <Link
          href={`/sales/quotations/${quotationId}/proforma`}
          className="flex items-center gap-1.5 rounded border border-edge bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink transition-colors duration-150 hover:bg-faint hover:text-primary"
        >
          Proforma
        </Link>
      )}

      {existingOrder ? (
        <Link
          href={`/sales/orders/${existingOrder.id}`}
          className="flex items-center gap-1.5 rounded border border-edge bg-surface px-2.5 py-1 text-[11.5px] text-ink transition-colors duration-150 hover:bg-faint hover:text-primary"
        >
          <IconCheck size={12} className="text-success" />
          Ordered as <span className="font-num">{existingOrder.code}</span>
          <IconArrowRight size={11} />
        </Link>
      ) : rejecting ? (
        <span className="animate-pop flex items-center gap-1.5">
          <Input
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Rejection reason…"
            className="h-[28px] w-64"
            autoFocus
          />
          <Button
            variant="danger"
            disabled={pending || !rejectReason.trim()}
            onClick={() =>
              startTransition(async () => {
                const res = await safeAction(async () => {
                  return rejectQuotation(quotationId, rejectReason);
                });
                if (res.error) {
                  setNotice({ tone: "err", text: res.error });
                } else {
                  setNotice({ tone: "ok", text: res.success! });
                  setRejecting(false);
                  setRejectReason("");
                  router.refresh();
                }
              })
            }
          >
            Confirm reject
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setRejecting(false);
              setRejectReason("");
            }}
          >
            Back
          </Button>
        </span>
      ) : (
        <>
          {canOrder && costSheetUnsigned ? (
            <span className="flex items-center gap-1.5 rounded border border-warning/40 bg-warning-bg px-2.5 py-1 text-[11.5px] text-ink">
              <IconAlert size={12} className="text-warning" />
              {costSheetCode ?? "The cost sheet"} needs Finance approval first
            </span>
          ) : canOrder && isSent ? (
            <Button
              variant="primary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await safeAction(async () => {
                    const r = await acceptQuotation(quotationId);
                    if (r.orderId) router.push(`/sales/orders/${r.orderId}`);
                    return r;
                  });
                  setNotice(res.error ? { tone: "err", text: res.error } : { tone: "ok", text: res.success! });
                  if (!res.error) router.refresh();
                })
              }
            >
              <IconArrowRight size={13} />
              {pending ? "Raising…" : "Customer accepted — raise order"}
            </Button>
          ) : null}

          {isSent && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setRejecting(true)}
              className="text-danger hover:border-danger hover:bg-danger-bg hover:text-danger"
            >
              <IconClose size={13} />
              Reject
            </Button>
          )}
        </>
      )}
    </div>
  );
}
