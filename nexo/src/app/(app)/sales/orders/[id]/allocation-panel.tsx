"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { allocateStock, releaseAllocation } from "../../sales-actions";
import { safeAction } from "@/lib/safe-action";
import { Section } from "@/components/detail/record";
import { Button, Input } from "@/components/ui/form";
import { kgPlain, date } from "@/lib/format";
import { IconCheck, IconAlert, IconClose } from "@/components/icons";

type Batch = {
  id: string; batchNo: string; availableKg: number; ratePerKg: number;
  receivedOn: string; warehouse: string;
};

type Line = {
  id: string; lineNo: number; projectName: string;
  orderedKg: number; allocatedKg: number; dispatchedKg: number;
  leadMaterial: string | null;
  available: Batch[];
  reserved: { id: string; batchNo: string; warehouse: string; quantityKg: number }[];
};

/**
 * The allocation bench.
 *
 * Reserving stock is its own act, separate from despatch: it takes material out
 * of free stock so two orders cannot be promised the same drum, but nothing has
 * left the building. Oldest batch first is offered by default because that is
 * what FIFO on a shelf-life material means in practice.
 */
export function AllocationPanel({
  orderCode,
  orderStatus,
  lines,
}: {
  orderCode: string;
  orderStatus: string;
  lines: Line[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [openLine, setOpenLine] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, number>>({});

  const confirmable = orderStatus !== "PENDING_APPROVAL" && orderStatus !== "DRAFT";

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

  const totalPicked = Object.values(picks).reduce((a, n) => a + (n || 0), 0);

  return (
    <Section
      title="Stock allocation"
      hint={
        confirmable
          ? "Reserve batches against a line — this takes them out of free stock"
          : `${orderCode} is not confirmed yet — nothing can be reserved`
      }
      padded={false}
    >
      {notice && (
        <div
          className={`flex items-start gap-2 border-b px-3 py-2 text-[12px] ${
            notice.tone === "ok" ? "border-success/30 bg-success-bg" : "border-danger/30 bg-danger-bg"
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
        </div>
      )}

      {lines.map((line) => {
        const open = line.orderedKg - line.allocatedKg;
        const isOpen = openLine === line.id;
        const fully = open <= 0.001;

        return (
          <div key={line.id} className="border-b border-edge/60 last:border-b-0">
            <div className="flex items-center gap-3 px-3 py-2">
              <span className="font-num text-[12px] text-muted">{line.lineNo}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] text-ink">{line.projectName}</span>
                <span className="block text-[11px] text-muted">
                  {line.leadMaterial ? `Lead material ${line.leadMaterial}` : "No formulation — nothing to reserve against"}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-num text-[12px] tabular-nums text-ink">
                  {kgPlain(line.allocatedKg)} <span className="text-muted">/ {kgPlain(line.orderedKg)} kg</span>
                </span>
                <span className={`block text-[11px] ${fully ? "text-success-text" : "text-warning"}`}>
                  {fully ? "fully reserved" : `${kgPlain(open)} kg open`}
                </span>
              </span>
              {confirmable && !fully && line.available.length > 0 && (
                <Button
                  variant={isOpen ? "ghost" : "outline"}
                  onClick={() => { setOpenLine(isOpen ? null : line.id); setPicks({}); }}
                >
                  {isOpen ? "Close" : "Reserve"}
                </Button>
              )}
            </div>

            {line.reserved.length > 0 && (
              <div className="border-t border-edge/60 bg-faint/60 px-3 py-1.5">
                <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                  Reserved
                </span>
                {line.reserved.map((r) => (
                  <span key={r.id} className="flex items-center gap-2 py-0.5 text-[11.5px]">
                    <span className="font-num text-ink">{r.batchNo}</span>
                    <span className="text-muted">{r.warehouse}</span>
                    <span className="flex-1" />
                    <span className="font-num tabular-nums text-ink">{kgPlain(r.quantityKg)} kg</span>
                    {line.dispatchedKg <= 0.001 && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => releaseAllocation(r.id))}
                        className="rounded px-1 text-[11px] text-muted transition-colors duration-150 hover:bg-danger-bg hover:text-danger-text"
                      >
                        Release
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}

            {isOpen && (
              <div className="animate-pop border-t border-edge bg-surface px-3 py-2">
                {line.available.length === 0 ? (
                  <p className="py-3 text-center text-[12px] text-muted">
                    No available batch of this material is in stock. It has to be received before it can be
                    promised.
                  </p>
                ) : (
                  <>
                    <p className="mb-1.5 text-[11px] text-muted">
                      Oldest batch first. {kgPlain(open)} kg still to reserve on this line.
                    </p>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-edge">
                          {["Batch", "Warehouse", "Received", "Available", "Reserve"].map((h, i) => (
                            <th
                              key={h}
                              className={`py-1 text-[10.5px] font-semibold text-muted ${i >= 3 ? "text-right" : "text-left"}`}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {line.available.map((b) => (
                          <tr key={b.id} className="border-b border-edge/60 last:border-b-0">
                            <td className="py-1.5">
                              <Link href={`/procurement/inventory/${b.id}`} className="ref-link font-num text-[11.5px]">
                                {b.batchNo}
                              </Link>
                            </td>
                            <td className="py-1.5 text-[11.5px] text-muted">{b.warehouse}</td>
                            <td className="py-1.5 text-[11.5px] text-muted">{date(b.receivedOn)}</td>
                            <td className="py-1.5 text-right font-num text-[11.5px] tabular-nums">{kgPlain(b.availableKg)}</td>
                            <td className="w-[110px] py-1.5 pl-2">
                              <Input
                                type="number"
                                min={0}
                                step={0.001}
                                max={Math.min(b.availableKg, open)}
                                value={picks[b.id] ?? ""}
                                placeholder="0"
                                onChange={(e) =>
                                  setPicks((p) => ({ ...p, [b.id]: Number(e.target.value) || 0 }))
                                }
                                className="h-[24px] text-right text-[11.5px]"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="mt-2 flex items-center gap-1.5">
                      <Button
                        variant="primary"
                        disabled={pending || totalPicked <= 0 || totalPicked > open + 0.001}
                        onClick={() =>
                          run(
                            () =>
                              allocateStock(
                                line.id,
                                JSON.stringify(
                                  Object.entries(picks)
                                    .filter(([, q]) => q > 0)
                                    .map(([batchId, quantityKg]) => ({ batchId, quantityKg })),
                                ),
                              ),
                            () => { setOpenLine(null); setPicks({}); },
                          )
                        }
                      >
                        {pending ? "Reserving…" : `Reserve ${totalPicked > 0 ? `${kgPlain(totalPicked)} kg` : ""}`}
                      </Button>
                      <Button variant="ghost" onClick={() => { setOpenLine(null); setPicks({}); }}>
                        Cancel
                      </Button>
                      {totalPicked > open + 0.001 && (
                        <span className="text-[11px] text-danger-text">
                          That is {kgPlain(totalPicked - open)} kg more than the line still needs.
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </Section>
  );
}
