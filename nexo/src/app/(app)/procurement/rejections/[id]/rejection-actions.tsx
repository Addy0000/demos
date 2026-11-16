"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideRejectionNote, dispatchRejectionNote } from "../../sourcing-actions";
import { safeAction } from "@/lib/safe-action";
import { Button, Input } from "@/components/ui/form";
import { IconApprove, IconClose, IconAlert, IconCheck, IconArrowRight } from "@/components/icons";

/**
 * Approve the debit, then record the challan the material actually left on.
 *
 * The two are deliberately separate: approving commits the company to a claim
 * against the vendor, despatching is the physical event. Collapsing them would
 * let stock leave on an unapproved note.
 */
export function RejectionActions({
  noteId,
  status,
  canWrite,
  canApprove,
  isOwnNote,
}: {
  noteId: string;
  status: string;
  canWrite: boolean;
  canApprove: boolean;
  isOwnNote: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [challanNo, setChallanNo] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");

  const awaitingDecision = status === "DRAFT" || status === "PENDING_APPROVAL";
  const approved = status === "APPROVED";

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

  if (!canWrite && !canApprove) return null;

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

      {awaitingDecision && canApprove && isOwnNote && (
        <span className="flex items-center gap-1.5 rounded border border-edge bg-faint px-2.5 py-1 text-[11.5px] text-muted">
          <IconAlert size={12} />
          You raised this — a debit needs a second signer.
        </span>
      )}

      {awaitingDecision && canApprove && !isOwnNote && !rejecting && (
        <>
          <Button variant="success" disabled={pending} onClick={() => run(() => decideRejectionNote(noteId, true, ""))}>
            <IconApprove size={13} />
            Approve despatch
          </Button>
          <Button variant="outline" onClick={() => setRejecting(true)}>Cancel note</Button>
        </>
      )}

      {rejecting && (
        <span className="animate-pop flex items-center gap-1.5">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this being cancelled?"
            className="h-[26px] w-64"
            autoFocus
          />
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => run(() => decideRejectionNote(noteId, false, reason), () => { setRejecting(false); setReason(""); })}
          >
            Confirm
          </Button>
          <Button variant="ghost" onClick={() => { setRejecting(false); setReason(""); }}>Back</Button>
        </span>
      )}

      {approved && canWrite && !dispatching && (
        <Button variant="primary" onClick={() => setDispatching(true)}>
          <IconArrowRight size={13} />
          Record despatch
        </Button>
      )}

      {dispatching && (
        <span className="animate-pop flex items-center gap-1.5">
          <Input
            value={challanNo}
            onChange={(e) => setChallanNo(e.target.value)}
            placeholder="Challan number"
            className="h-[26px] w-40"
            autoFocus
          />
          <Input
            value={vehicleNo}
            onChange={(e) => setVehicleNo(e.target.value)}
            placeholder="Vehicle"
            className="h-[26px] w-32"
          />
          <Button
            variant="primary"
            disabled={pending}
            onClick={() =>
              run(
                () => dispatchRejectionNote(noteId, challanNo, vehicleNo),
                () => { setDispatching(false); setChallanNo(""); setVehicleNo(""); },
              )
            }
          >
            {pending ? "Recording…" : "Confirm"}
          </Button>
          <Button variant="ghost" onClick={() => setDispatching(false)}>Back</Button>
        </span>
      )}
    </div>
  );
}
