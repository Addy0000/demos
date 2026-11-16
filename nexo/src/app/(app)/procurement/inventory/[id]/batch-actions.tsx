"use client";

import { useActionState, useState, useTransition } from "react";
import { adjustStock, releaseBatch, type ActionState } from "../../actions";
import { safeAction } from "@/lib/safe-action";
import { Button, SubmitButton, Input, Field } from "@/components/ui/form";
import { IconCheck, IconAlert, IconClose } from "@/components/icons";

export function BatchActions({
  batchId,
  status,
  available,
  canAdjust,
}: {
  batchId: string;
  status: string;
  available: number;
  canAdjust: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [state, formAction] = useActionState<ActionState, FormData>(adjustStock, {});

  if (!canAdjust) return null;

  const shown = state.error
    ? { tone: "err" as const, text: state.error }
    : state.success
      ? { tone: "ok" as const, text: state.success }
      : notice;

  return (
    <div className="relative flex items-center gap-1.5">
      {shown && (
        <span
          className={`absolute right-0 top-[calc(100%+8px)] z-40 flex w-72 items-start gap-2 rounded border px-2.5 py-2 text-[12px] shadow-pop ${
            shown.tone === "ok" ? "border-success/35 bg-success-bg" : "border-danger/35 bg-danger-bg"
          }`}
        >
          {shown.tone === "ok" ? (
            <IconCheck size={14} className="mt-px shrink-0 text-success" />
          ) : (
            <IconAlert size={14} className="mt-px shrink-0 text-danger" />
          )}
          <span className="flex-1 text-ink">{shown.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="text-muted hover:text-ink">
            <IconClose size={11} />
          </button>
        </span>
      )}

      {status === "QUARANTINE" && (
        <Button
          variant="success"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await safeAction(() => releaseBatch(batchId));
              setNotice(res.error ? { tone: "err", text: res.error } : { tone: "ok", text: res.success! });
            })
          }
        >
          <IconCheck size={13} />
          Release from quarantine
        </Button>
      )}

      {!open ? (
        <Button variant="outline" onClick={() => setOpen(true)}>Adjust stock</Button>
      ) : (
        <form action={formAction} className="animate-pop absolute right-0 top-[calc(100%+8px)] z-50 w-80 space-y-2.5 rounded-md border border-edge bg-surface p-3 shadow-pop">
          <input type="hidden" name="batchId" value={batchId} />
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-semibold text-ink">Adjust stock</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-muted hover:text-ink">
              <IconClose size={12} />
            </button>
          </div>

          <Field
            label="Quantity (kg)"
            required
            hint={`Positive adds, negative removes. ${available.toFixed(3)} kg currently available.`}
          >
            <Input name="quantityKg" type="number" step={0.001} required placeholder="-12.500" autoFocus />
          </Field>

          <Field label="Reason" required>
            <Input name="reason" required placeholder="Physical verification shortfall" />
          </Field>

          <div className="flex gap-1.5">
            <SubmitButton pendingLabel="Posting…">Post adjustment</SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>

          <p className="text-[11px] leading-snug text-muted">
            The adjustment is written to the stock ledger with your name against it.
          </p>
        </form>
      )}
    </div>
  );
}
