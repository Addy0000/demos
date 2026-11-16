"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { raiseRejectionNote } from "../../sourcing-actions";
import { safeAction } from "@/lib/safe-action";
import { Button } from "@/components/ui/form";
import { kgPlain } from "@/lib/format";
import { IconAlert, IconCheck, IconClose, IconArrowRight } from "@/components/icons";

/**
 * The handoff from QC to the return.
 *
 * Rejected quantity that nobody raises a note against just sits in the Rejection
 * warehouse indefinitely, so the receipt itself offers the next document rather
 * than leaving the operator to find it.
 */
export function GrnRejectionAction({
  grnId,
  rejectedKg,
  canRaise,
  existingNote,
}: {
  grnId: string;
  rejectedKg: number;
  canRaise: boolean;
  existingNote: { id: string; code: string } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  if (existingNote) {
    return (
      <Link
        href={`/procurement/rejections/${existingNote.id}`}
        className="flex items-center gap-1.5 rounded border border-edge bg-surface px-2.5 py-1 text-[11.5px] text-ink transition-colors duration-150 hover:bg-faint hover:text-primary"
      >
        <IconAlert size={12} className="text-danger" />
        Rejection note <span className="font-num">{existingNote.code}</span>
        <IconArrowRight size={11} />
      </Link>
    );
  }

  if (rejectedKg <= 0 || !canRaise) return null;

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

      <span className="text-[11.5px] text-danger-text">{kgPlain(rejectedKg)} kg rejected</span>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await safeAction(() => raiseRejectionNote(grnId));
            setNotice(res.error ? { tone: "err", text: res.error } : { tone: "ok", text: res.success! });
            if (!res.error) {
              const noteId = (res as { noteId?: string }).noteId;
              if (noteId) router.push(`/procurement/rejections/${noteId}`);
              else router.refresh();
            }
          })
        }
      >
        {pending ? "Raising…" : "Raise rejection note"}
      </Button>
    </div>
  );
}
