"use client";

import { useState, useTransition } from "react";
import { approvePurchaseOrder, cancelPurchaseOrder, closePurchaseOrder } from "../../actions";
import { safeAction } from "@/lib/safe-action";
import { Button, Input } from "@/components/ui/form";
import { IconApprove, IconClose, IconAlert, IconCheck } from "@/components/icons";
import { ReceiveMaterialModal, type OrderLineItem } from "./receive-material-modal";

export function PoActions({
  poId,
  poCode,
  vendorName,
  status,
  canApprove,
  canWrite,
  canReceive,
  blockedReason,
  lines,
}: {
  poId: string;
  poCode: string;
  vendorName: string;
  status: string;
  canApprove: boolean;
  canWrite: boolean;
  canReceive?: boolean;
  /** Why approval is unavailable to a signer who otherwise holds `po:approve`. */
  blockedReason?: string | null;
  lines?: OrderLineItem[];
}) {
  const [pending, startTransition] = useTransition();
  const [cancelling, setCancelling] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const canBeApproved = status === "PENDING_APPROVAL";
  const canBeCancelled = !["RECEIVED", "CLOSED", "CANCELLED"].includes(status);
  const hasPendingQty = lines && lines.some((l) => Number(l.quantityKg) - Number(l.receivedKg) > 0.001);
  const canBeClosed = canWrite && (status === "APPROVED" || status === "PARTIALLY_RECEIVED") && Boolean(hasPendingQty);
  const canBeReceived = (status === "APPROVED" || status === "PARTIALLY_RECEIVED" || status === "CLOSED" || status === "RECEIVED") && (canReceive ?? canWrite) && Boolean(hasPendingQty);

  if (!canApprove && !canWrite && !canBeReceived && !canBeClosed && !blockedReason) return null;

  return (
    <div className="relative flex items-center gap-1.5">
      {notice && (
        <span
          className={`absolute right-0 top-[calc(100%+8px)] z-40 flex w-72 items-start gap-2 rounded border px-2.5 py-2 text-[12px] shadow-pop ${
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

      {/* Say why, rather than silently hiding the button — an approver who cannot
          sign needs to know it escalated, not wonder where the control went. */}
      {!canApprove && canBeApproved && blockedReason && (
        <span className="flex items-center gap-1.5 rounded border border-edge bg-faint px-2.5 py-1 text-[11.5px] text-muted">
          <IconAlert size={12} />
          {blockedReason}
        </span>
      )}

      {canApprove && canBeApproved && (
        <Button
          variant="success"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await safeAction(() => approvePurchaseOrder(poId));
              setNotice(res.error ? { tone: "err", text: res.error } : { tone: "ok", text: res.success! });
            })
          }
        >
          <IconApprove size={13} />
          Approve order
        </Button>
      )}

      {canBeReceived && lines && lines.length > 0 && (
        <ReceiveMaterialModal
          poId={poId}
          poCode={poCode}
          vendorName={vendorName}
          lines={lines}
        />
      )}

      {canWrite && canBeClosed && !closing && !cancelling && (
        <Button variant="outline" onClick={() => { setClosing(true); setCancelling(false); setReason(""); }}>
          Close PO
        </Button>
      )}

      {closing && (
        <span className="animate-pop flex items-center gap-1.5">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for closing (short-close)"
            className="h-[26px] w-60"
            autoFocus
          />
          <Button
            variant="primary"
            disabled={pending || !reason.trim()}
            onClick={() =>
              startTransition(async () => {
                const res = await safeAction(() => closePurchaseOrder(poId, reason));
                setNotice(res.error ? { tone: "err", text: res.error } : { tone: "ok", text: res.success! });
                setClosing(false);
                setReason("");
              })
            }
          >
            Confirm
          </Button>
          <Button variant="ghost" onClick={() => { setClosing(false); setReason(""); }}>
            Back
          </Button>
        </span>
      )}

      {canWrite && canBeCancelled && !cancelling && !closing && (
        <Button variant="outline" onClick={() => { setCancelling(true); setClosing(false); setReason(""); }}>
          Cancel order
        </Button>
      )}

      {cancelling && (
        <span className="animate-pop flex items-center gap-1.5">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for cancelling"
            className="h-[26px] w-56"
            autoFocus
          />
          <Button
            variant="danger"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await safeAction(() => cancelPurchaseOrder(poId, reason));
                setNotice(res.error ? { tone: "err", text: res.error } : { tone: "ok", text: res.success! });
                setCancelling(false);
                setReason("");
              })
            }
          >
            Confirm
          </Button>
          <Button variant="ghost" onClick={() => { setCancelling(false); setReason(""); }}>
            Back
          </Button>
        </span>
      )}
    </div>
  );
}
