"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPackingList } from "../../sales-actions";
import { safeAction } from "@/lib/safe-action";
import { Button } from "@/components/ui/form";
import { Chip, packingListTone } from "@/components/ui/chip";
import { titleise } from "@/lib/format";
import { IconCheck, IconAlert, IconClose, IconArrowRight } from "@/components/icons";

export function PackingListSection({
  challanId,
  canWrite,
  dispatched,
  packingList,
}: {
  challanId: string;
  canWrite: boolean;
  dispatched: boolean;
  packingList: {
    id: string;
    code: string;
    status: string;
    packageCount: number;
  } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  if (packingList) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Link
            href={`/sales/packing-lists/${packingList.id}`}
            className="ref-link font-num text-[13px] font-semibold text-ink"
          >
            {packingList.code}
          </Link>
          <Chip tone={packingListTone(packingList.status)}>{titleise(packingList.status)}</Chip>
        </div>
        <p className="text-[12px] text-muted">
          {packingList.packageCount} {packingList.packageCount === 1 ? "package" : "packages"} recorded
        </p>
        <div>
          <Link
            href={`/sales/packing-lists/${packingList.id}`}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
          >
            Open packing list <IconArrowRight size={12} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-2.5">
      {notice && (
        <span
          className={`flex items-start gap-2 rounded border px-2.5 py-2 text-[12px] shadow-pop ${
            notice.tone === "ok" ? "border-success/35 bg-success-bg" : "border-danger/35 bg-danger-bg"
          }`}
        >
          {notice.tone === "ok" ? (
            <IconCheck size={14} className="mt-px shrink-0 text-success" />
          ) : (
            <IconAlert size={14} className="mt-px shrink-0 text-danger" />
          )}
          <span className="flex-1 text-ink">{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
            className="text-muted hover:text-ink"
          >
            <IconClose size={11} />
          </button>
        </span>
      )}

      <p className="text-[12px] text-muted">No packing list created yet.</p>

      {!dispatched && (
        <p className="text-[11.5px] text-muted/80">Despatch this challan before creating a packing list.</p>
      )}

      {canWrite && dispatched && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await safeAction(() => createPackingList(challanId));
              if ("error" in res && res.error) {
                setNotice({ tone: "err", text: res.error });
              } else if ("packingListId" in res && res.packingListId) {
                router.push(`/sales/packing-lists/${res.packingListId}`);
              }
            })
          }
        >
          {pending ? "Creating…" : "Create packing list"}
        </Button>
      )}
    </div>
  );
}
