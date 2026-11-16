"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { decideCostSheet } from "../../sales-actions";
import { safeAction } from "@/lib/safe-action";
import { Button, Input } from "@/components/ui/form";
import { IconApprove, IconClose, IconAlert, IconCheck, IconPlus } from "@/components/icons";

/** Finance signs the margin. Sales prepares it and cannot sign its own. */
export function CostSheetActions({
  sheetId,
  status,
  canApprove,
  isOwnSheet,
  marginPct,
}: {
  sheetId: string;
  status: string;
  canApprove: boolean;
  isOwnSheet: boolean;
  marginPct: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  const awaiting = status === "PENDING_APPROVAL" || status === "DRAFT";

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

  if (status === "APPROVED") {
    return (
      <Link
        href={`/sales/quotations/new?costSheetId=${sheetId}`}
        className="flex items-center gap-1.5 rounded bg-primary px-2.5 py-1 text-[11.5px] font-medium text-white transition-colors duration-150 hover:bg-primary-hover"
      >
        <IconPlus size={12} />
        Create quotation
      </Link>
    );
  }

  if (!canApprove || !awaiting) return null;

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

      {isOwnSheet ? (
        <span className="flex items-center gap-1.5 rounded border border-edge bg-faint px-2.5 py-1 text-[11.5px] text-muted">
          <IconAlert size={12} />
          You prepared this — the margin needs a second signer.
        </span>
      ) : (
        <>
          {marginPct < 8 && (
            <span className="whitespace-nowrap text-[11.5px] text-danger-text">
              {marginPct.toFixed(1)}% margin
            </span>
          )}
          {!rejecting && (
            <>
              <Button variant="success" disabled={pending} onClick={() => run(() => decideCostSheet(sheetId, true, ""))}>
                <IconApprove size={13} />
                Approve margin
              </Button>
              <Button variant="outline" onClick={() => setRejecting(true)}>Send back</Button>
            </>
          )}
          {rejecting && (
            <span className="animate-pop flex items-center gap-1.5">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What needs reworking?"
                className="h-[26px] w-72"
                autoFocus
              />
              <Button
                variant="danger"
                disabled={pending}
                onClick={() => run(() => decideCostSheet(sheetId, false, note), () => { setRejecting(false); setNote(""); })}
              >
                Confirm
              </Button>
              <Button variant="ghost" onClick={() => { setRejecting(false); setNote(""); }}>Back</Button>
            </span>
          )}
        </>
      )}
    </div>
  );
}
