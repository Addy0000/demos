"use client";

import { presentOptions } from "@/lib/enums";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { approvePrice, rejectPrice, approveMany } from "../actions";
import { safeAction } from "@/lib/safe-action";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip } from "@/components/ui/chip";
import { Button, Textarea } from "@/components/ui/form";
import { money, ratePerKg, kg, date, relative, percent, titleise } from "@/lib/format";
import { IconApprove, IconClose, IconAlert, IconCheck, IconArrowRight } from "@/components/icons";

export type PendingRow = {
  id: string; materialId: string; materialCode: string; materialName: string;
  category: string; grade: string; vendorId: string; vendorName: string; vendorRating: number;
  currentPrice: number | null; proposedPrice: number; changePct: number | null;
  annualKg: number; annualImpact: number; usedInFormulations: number;
  effectiveFrom: string; submittedAt: string; submittedBy: string;
  moqKg: number | null; leadTimeDays: number | null; remark: string;
};

type Resolved = { id: string; outcome: "approved" | "rejected" };


export function ApprovalQueue({ rows }: { rows: PendingRow[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [, startTransition] = useTransition();

  // Optimistic: the row leaves the queue the instant you act, and reconciles
  // when the server action returns. A failure puts it back with the reason.
  const [resolved, addResolved] = useOptimistic<Resolved[], Resolved>(
    [],
    (state, next) => [...state, next],
  );

  const resolvedIds = useMemo(() => new Set(resolved.map((r) => r.id)), [resolved]);

  const filtered = useMemo(() => {
    let out = rows.filter((r) => !resolvedIds.has(r.id));
    if (category) out = out.filter((r) => r.category === category);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (r) =>
          r.materialName.toLowerCase().includes(q) ||
          r.materialCode.toLowerCase().includes(q) ||
          r.vendorName.toLowerCase().includes(q),
      );
    }
    return out;
  }, [rows, resolvedIds, category, search]);

  const totalImpact = filtered.reduce((a, r) => a + r.annualImpact, 0);

  function doApprove(id: string) {
    startTransition(async () => {
      addResolved({ id, outcome: "approved" });
      const res = await safeAction(() => approvePrice(id));
      setNotice(res.error ? { tone: "err", text: res.error } : { tone: "ok", text: res.success ?? "Approved." });
    });
  }

  function doReject(id: string, reason: string) {
    startTransition(async () => {
      addResolved({ id, outcome: "rejected" });
      const res = await safeAction(() => rejectPrice(id, reason));
      setNotice(res.error ? { tone: "err", text: res.error } : { tone: "ok", text: res.success ?? "Rejected." });
      setRejecting(null);
    });
  }

  function doApproveMany() {
    const ids = Array.from(selected);
    startTransition(async () => {
      for (const id of ids) addResolved({ id, outcome: "approved" });
      setSelected(new Set());
      const res = await safeAction(() => approveMany(ids));
      setNotice(res.error ? { tone: "err", text: res.error } : { tone: "ok", text: res.success ?? "Approved." });
    });
  }

  const crumbs: Crumb[] = [{ label: "Status =", value: "Pending approval" }];
  if (category) crumbs.push({ label: "Category =", value: titleise(category), onRemove: () => setCategory("") });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  return (
    <ListShell
      title="Price approvals"
      count={filtered.length}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search material or vendor"
      crumbs={crumbs}
      onClearFilters={() => { setCategory(""); setSearch(""); }}
      toolbarExtra={
        <>
          <FilterSelect
            label="Category" value={category} onChange={setCategory}
            options={presentOptions(rows, (r) => r.category)}
          />
          {filtered.length > 0 && (
            <span className="ml-1 shrink-0 whitespace-nowrap text-[11.5px] text-muted">
              Annual impact if all approved{" "}
              <span className={`font-num font-semibold tabular-nums ${totalImpact > 0 ? "text-danger" : "text-success"}`}>
                {totalImpact > 0 ? "+" : ""}{money(totalImpact)}
              </span>
            </span>
          )}
        </>
      }
    >
      {notice && (
        <div
          role="status"
          className={`flex shrink-0 items-center gap-2 border-b px-3 py-2 text-[12px] ${
            notice.tone === "ok" ? "border-success/30 bg-success-bg text-ink" : "border-danger/30 bg-danger-bg text-ink"
          }`}
        >
          {notice.tone === "ok" ? <IconCheck size={14} className="text-success" /> : <IconAlert size={14} className="text-danger" />}
          <span className="flex-1">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="text-muted hover:text-ink">
            <IconClose size={12} />
          </button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-edge bg-pastel px-3 py-2">
          <span className="text-[12px] font-medium text-ink">{selected.size} selected</span>
          <Button variant="primary" onClick={doApproveMany}>
            <IconApprove size={13} />
            Approve selected
          </Button>
          <Button variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-canvas p-3">
        {filtered.length === 0 ? (
          <div className="grid place-items-center py-24 text-center">
            <div>
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-success-bg text-success">
                <IconCheck size={20} />
              </span>
              <p className="mt-3 text-[14px] font-medium text-ink">The queue is clear</p>
              <p className="mt-1 text-[12.5px] text-muted">
                Every submitted rate has been dealt with. New submissions land here as vendors send them.
              </p>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((r) => {
              const rise = (r.changePct ?? 0) > 0;
              const severe = (r.changePct ?? 0) > 8;
              const isRejecting = rejecting === r.id;

              return (
                <li
                  key={r.id}
                  className="panel"
                >
                  <div className="flex flex-wrap items-start gap-3 p-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() =>
                        setSelected((s) => {
                          const n = new Set(s);
                          n.has(r.id) ? n.delete(r.id) : n.add(r.id);
                          return n;
                        })
                      }
                      aria-label={`Select ${r.materialName}`}
                      className="mt-1 h-[14px] w-[14px] shrink-0 cursor-pointer accent-primary"
                    />

                    {/* Material + vendor */}
                    <div className="min-w-[220px] flex-1">
                      <Link href={`/procurement/materials/${r.materialId}`} className="ref-link text-[13px] font-medium">
                        {r.materialName}
                      </Link>
                      <p className="mt-0.5 text-[11.5px] text-muted">
                        <span className="font-num">{r.materialCode}</span>
                        {r.grade !== "—" && <> · {r.grade}</>} · {titleise(r.category)}
                      </p>
                      <p className="mt-1 text-[11.5px] text-muted">
                        <Link href={`/procurement/vendors/${r.vendorId}`} className="ref-link">{r.vendorName}</Link>
                        <span className="ml-1.5">rating {r.vendorRating.toFixed(1)}</span>
                        <span className="ml-1.5">· submitted {relative(r.submittedAt)}</span>
                      </p>
                    </div>

                    {/* The price movement itself — the decision. */}
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <p className="text-[10.5px] text-muted">Current</p>
                        <p className="font-num text-[13px] tabular-nums text-muted">
                          {r.currentPrice ? ratePerKg(r.currentPrice) : "—"}
                        </p>
                      </div>
                      <IconArrowRight size={13} className="shrink-0 text-muted" />
                      <div className="text-right">
                        <p className="text-[10.5px] text-muted">Proposed</p>
                        <p className="font-num text-[15px] font-semibold tabular-nums text-ink">
                          {ratePerKg(r.proposedPrice)}
                        </p>
                      </div>
                      {r.changePct !== null && (
                        <Chip tone={severe ? "danger" : rise ? "warning" : "success"}>{percent(r.changePct)}</Chip>
                      )}
                    </div>

                    {/* Consequence */}
                    <div className="shrink-0 border-l border-edge pl-3 text-right">
                      <p className="text-[10.5px] text-muted">Annual impact</p>
                      <p
                        className={`font-num text-[13px] font-semibold tabular-nums ${
                          r.annualImpact > 0 ? "text-danger" : r.annualImpact < 0 ? "text-success" : "text-muted"
                        }`}
                      >
                        {r.annualImpact ? `${r.annualImpact > 0 ? "+" : ""}${money(r.annualImpact)}` : "—"}
                      </p>
                      <p className="text-[10.5px] text-muted">
                        on {r.annualKg > 0 ? kg(r.annualKg) : "no recorded"} usage
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-1.5 self-center">
                      <Button variant="success" onClick={() => doApprove(r.id)}>
                        <IconApprove size={13} />
                        Approve
                      </Button>
                      <Button variant="danger" onClick={() => setRejecting(isRejecting ? null : r.id)}>
                        Reject
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-edge/60 bg-faint px-3 py-1.5 text-[11.5px] text-muted">
                    <span>Effective from <span className="font-medium text-ink">{date(r.effectiveFrom)}</span></span>
                    {r.moqKg && <span>MOQ {kg(r.moqKg)}</span>}
                    {r.leadTimeDays !== null && <span>Lead {r.leadTimeDays} days</span>}
                    <span>
                      Used in{" "}
                      <span className="font-medium text-ink">{r.usedInFormulations}</span>{" "}
                      formulation{r.usedInFormulations === 1 ? "" : "s"}
                    </span>
                    {r.remark && <span className="min-w-0 flex-1 truncate italic">“{r.remark}”</span>}
                  </div>

                  {isRejecting && <RejectForm onCancel={() => setRejecting(null)} onSubmit={(reason) => doReject(r.id, reason)} />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ListShell>
  );
}

function RejectForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const PRESETS = [
    "Increase beyond contracted ceiling for the quarter. Resubmit within 8%.",
    "No supporting feedstock index provided.",
    "Competing quote lower for equivalent specification.",
    "Effective date precedes contract renewal.",
  ];

  return (
    <div className="animate-pop border-t border-danger/25 bg-danger-bg/40 p-3">
      <label className="mb-1.5 block text-[11.5px] font-medium text-ink">
        Reason for rejection — the vendor sees this
      </label>
      <Textarea
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Tell them what to change so the next submission can be approved."
        autoFocus
      />
      <div className="mt-1.5 flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setReason(p)}
            className="rounded-sm border border-edge bg-surface px-1.5 py-0.5 text-[11px] text-muted transition-colors duration-150 hover:border-primary hover:text-primary"
          >
            {p.slice(0, 42)}…
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        <Button variant="danger" disabled={reason.trim().length < 5} onClick={() => onSubmit(reason)}>
          Confirm rejection
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
