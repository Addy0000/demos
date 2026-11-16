"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { raiseInvoice } from "../../sales-actions";
import { safeAction } from "@/lib/safe-action";
import { Button } from "@/components/ui/form";
import { IconCheck, IconAlert, IconClose } from "@/components/icons";

/** Goods have gone; this is the button that asks for the money. */
export function ChallanActions({
  challanId,
  canInvoice,
  alreadyInvoiced,
  dispatched,
}: {
  challanId: string;
  canInvoice: boolean;
  alreadyInvoiced: { id: string; code: string } | null;
  dispatched: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  if (alreadyInvoiced) {
    return (
      <span className="flex items-center gap-1.5 rounded border border-edge bg-faint px-2.5 py-1 text-[11.5px] text-muted">
        <IconCheck size={12} className="text-success" />
        Invoiced as <span className="font-num text-ink">{alreadyInvoiced.code}</span>
      </span>
    );
  }

  if (!canInvoice) return null;

  if (!dispatched) {
    return (
      <span className="flex items-center gap-1.5 rounded border border-edge bg-faint px-2.5 py-1 text-[11.5px] text-muted">
        <IconAlert size={12} />
        Despatch it before invoicing.
      </span>
    );
  }

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

      <Button
        variant="primary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await safeAction(() => raiseInvoice(challanId));
            setNotice(res.error ? { tone: "err", text: res.error } : { tone: "ok", text: res.success! });
            if (!res.error) router.refresh();
          })
        }
      >
        {pending ? "Raising…" : "Raise invoice"}
      </Button>
    </div>
  );
}
