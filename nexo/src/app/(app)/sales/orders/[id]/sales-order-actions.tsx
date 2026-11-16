"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmSalesOrder, dispatchOrder, raiseInvoice, cancelSalesOrder } from "../../sales-actions";
import { safeAction } from "@/lib/safe-action";
import { Button, Input } from "@/components/ui/form";
import { money } from "@/lib/format";
import { IconApprove, IconClose, IconAlert, IconCheck, IconArrowRight } from "@/components/icons";

/**
 * Confirm, despatch, invoice — the three commitments on a sales order.
 *
 * Confirmation carries the credit gate. Rather than refusing an over-limit order
 * outright, it asks for the reason and records it: the person who decided to ship
 * on extended exposure should be named on the order, not absent from it.
 */
export function SalesOrderActions({
  orderId,
  status,
  canConfirm,
  canDispatch,
  canInvoice,
  canCancel,
  isOwnOrder,
  hasAllocation,
  challanForInvoice,
  credit,
}: {
  orderId: string;
  status: string;
  canConfirm: boolean;
  canDispatch: boolean;
  canInvoice: boolean;
  canCancel?: boolean;
  isOwnOrder: boolean;
  hasAllocation: boolean;
  challanForInvoice: { id: string; code: string } | null;
  credit: { limit: number; outstanding: number; exposure: number; overLimit: boolean; customerName: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [vehicleNo, setVehicleNo] = useState("");
  const [driverName, setDriverName] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const awaitingConfirm = status === "PENDING_APPROVAL" || status === "DRAFT";
  const canGoOut = ["CONFIRMED", "PARTIALLY_DISPATCHED"].includes(status);

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

  if (!canConfirm && !canDispatch && !canInvoice && !canCancel) return null;

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

      {awaitingConfirm && canConfirm && isOwnOrder && (
        <span className="flex items-center gap-1.5 rounded border border-edge bg-faint px-2.5 py-1 text-[11.5px] text-muted">
          <IconAlert size={12} />
          You raised this — confirming commits stock and credit.
        </span>
      )}

      {awaitingConfirm && canConfirm && !isOwnOrder && !confirming && (
        <Button
          variant={credit.overLimit ? "outline" : "success"}
          disabled={pending}
          onClick={() => (credit.overLimit ? setConfirming(true) : run(() => confirmSalesOrder(orderId, "")))}
        >
          <IconApprove size={13} />
          {credit.overLimit ? "Confirm over limit…" : "Confirm order"}
        </Button>
      )}

      {confirming && (
        <span className="animate-pop flex items-center gap-1.5">
          <span className="whitespace-nowrap text-[11.5px] text-warning-text">
            {money(credit.exposure)} vs {money(credit.limit)} limit
          </span>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why ship past the limit?"
            className="h-[26px] w-64"
            autoFocus
          />
          <Button
            variant="success"
            disabled={pending || !reason.trim()}
            onClick={() => run(() => confirmSalesOrder(orderId, reason), () => { setConfirming(false); setReason(""); })}
          >
            Confirm
          </Button>
          <Button variant="ghost" onClick={() => { setConfirming(false); setReason(""); }}>Back</Button>
        </span>
      )}

      {canGoOut && canDispatch && !dispatching && (
        <>
          {hasAllocation ? (
            <Button variant="primary" onClick={() => setDispatching(true)}>
              <IconArrowRight size={13} />
              Despatch reserved stock
            </Button>
          ) : (
            <span className="flex items-center gap-1.5 rounded border border-edge bg-faint px-2.5 py-1 text-[11.5px] text-muted">
              <IconAlert size={12} />
              Reserve stock below before despatching.
            </span>
          )}
        </>
      )}

      {dispatching && (
        <span className="animate-pop flex items-center gap-1.5">
          <Input
            value={vehicleNo}
            onChange={(e) => setVehicleNo(e.target.value)}
            placeholder="Vehicle"
            className="h-[26px] w-32"
            autoFocus
          />
          <Input
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
            placeholder="Driver"
            className="h-[26px] w-36"
          />
          <Button
            variant="primary"
            disabled={pending}
            onClick={() =>
              run(
                async () => {
                  const res = await dispatchOrder(orderId, vehicleNo, driverName);
                  if (res.challanId) router.push(`/sales/dispatch/${res.challanId}`);
                  return res;
                },
                () => { setDispatching(false); setVehicleNo(""); setDriverName(""); },
              )
            }
          >
            {pending ? "Despatching…" : "Confirm despatch"}
          </Button>
          <Button variant="ghost" onClick={() => setDispatching(false)}>Back</Button>
        </span>
      )}

      {challanForInvoice && canInvoice && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => run(() => raiseInvoice(challanForInvoice.id))}
        >
          {pending ? "Raising…" : `Invoice ${challanForInvoice.code}`}
        </Button>
      )}

      {canCancel && !cancelling && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => setCancelling(true)}
          className="text-danger hover:border-danger hover:bg-danger-bg hover:text-danger"
        >
          <IconClose size={13} />
          Cancel order
        </Button>
      )}

      {cancelling && (
        <span className="animate-pop flex items-center gap-1.5">
          <Input
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Cancellation reason…"
            className="h-[26px] w-64"
            autoFocus
          />
          <Button
            variant="danger"
            disabled={pending || !cancelReason.trim()}
            onClick={() =>
              run(
                () => cancelSalesOrder(orderId, cancelReason),
                () => {
                  setCancelling(false);
                  setCancelReason("");
                }
              )
            }
          >
            Confirm cancel
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setCancelling(false);
              setCancelReason("");
            }}
          >
            Back
          </Button>
        </span>
      )}
    </div>
  );
}
