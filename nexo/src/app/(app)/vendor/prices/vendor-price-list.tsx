"use client";

import { presentOptions } from "@/lib/enums";

import { useActionState, useEffect, useMemo, useState } from "react";
import { submitPrice, type ActionState } from "../../finance/actions";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip } from "@/components/ui/chip";
import { Button, SubmitButton, Input, Field, FormGrid } from "@/components/ui/form";
import { ratePerKg, date, titleise, percent } from "@/lib/format";
import { IconPlus, IconClose, IconCheck, IconAlert, IconClock } from "@/components/icons";

type Row = {
  materialId: string; code: string; name: string; category: string; grade: string;
  vendorSku: string; isPreferred: boolean; leadTimeDays: number;
  approvedPrice: number | null; approvedFrom: string | null;
  pendingPrice: number | null; pendingFrom: string | null; pendingId: string | null;
  lastRejection: string | null; history: number;
};


export function VendorPriceList({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [revising, setRevising] = useState<string | null>(null);
  const [state, formAction] = useActionState<ActionState, FormData>(submitPrice, {});

  // Close the form once the revision lands — the row above it now shows the
  // pending rate, so leaving the form open just displays a stale number.
  useEffect(() => {
    if (state.success) setRevising(null);
  }, [state.success]);

  const filtered = useMemo(() => {
    let out = rows;
    if (category) out = out.filter((r) => r.category === category);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
    }
    return out;
  }, [rows, category, search]);

  const pendingCount = rows.filter((r) => r.pendingPrice !== null).length;

  const crumbs: Crumb[] = [{ label: "Materials you supply" }];
  if (category) crumbs.push({ label: "Category =", value: titleise(category), onRemove: () => setCategory("") });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  return (
    <ListShell
      title="My price list"
      count={filtered.length}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search material"
      crumbs={crumbs}
      onClearFilters={() => { setCategory(""); setSearch(""); }}
      toolbarExtra={
        <>
          <FilterSelect
            label="Category" value={category} onChange={setCategory}
            options={presentOptions(rows, (r) => r.category)}
          />
          {pendingCount > 0 && (
            <span className="shrink-0 whitespace-nowrap text-[11.5px] text-muted">
              <span className="font-num font-semibold text-warning">{pendingCount}</span> awaiting approval
            </span>
          )}
        </>
      }
    >
      {(state.error || state.success) && (
        <div
          role="status"
          className={`flex shrink-0 items-start gap-2 border-b px-3 py-2 text-[12px] ${
            state.success ? "border-success/30 bg-success-bg" : "border-danger/30 bg-danger-bg"
          }`}
        >
          {state.success ? (
            <IconCheck size={14} className="mt-px shrink-0 text-success" />
          ) : (
            <IconAlert size={14} className="mt-px shrink-0 text-danger" />
          )}
          <span className="text-ink">{state.success ?? state.error}</span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-canvas p-3">
        {filtered.length === 0 ? (
          <p className="py-20 text-center text-[12.5px] text-muted">
            No materials match. Clear the filter to see everything you are approved to supply.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((r) => {
              const open = revising === r.materialId;
              const delta =
                r.pendingPrice && r.approvedPrice
                  ? ((r.pendingPrice - r.approvedPrice) / r.approvedPrice) * 100
                  : null;

              return (
                <li key={r.materialId} className="panel">
                  <div className="flex flex-wrap items-center gap-3 p-3">
                    <div className="min-w-[220px] flex-1">
                      <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                        {r.name}
                        {r.isPreferred && <Chip tone="info">Preferred supplier</Chip>}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-muted">
                        <span className="font-num">{r.code}</span>
                        {r.grade !== "—" && <> · {r.grade}</>} · {titleise(r.category)}
                        {r.vendorSku !== "—" && <> · your SKU <span className="font-num">{r.vendorSku}</span></>}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-[10.5px] text-muted">Approved rate</p>
                      <p className="font-num text-[15px] font-semibold tabular-nums text-ink">
                        {r.approvedPrice ? ratePerKg(r.approvedPrice) : "—"}
                      </p>
                      {r.approvedFrom && (
                        <p className="text-[10.5px] text-muted">from {date(r.approvedFrom)}</p>
                      )}
                    </div>

                    {r.pendingPrice !== null && (
                      <div className="shrink-0 border-l border-edge pl-3 text-right">
                        <p className="flex items-center justify-end gap-1 text-[10.5px] text-warning-text">
                          <IconClock size={11} />
                          Awaiting approval
                        </p>
                        <p className="font-num text-[15px] font-semibold tabular-nums text-ink">
                          {ratePerKg(r.pendingPrice)}
                        </p>
                        <p className="text-[10.5px] text-muted">
                          from {date(r.pendingFrom)}
                          {delta !== null && <span className="ml-1">({percent(delta, 1)})</span>}
                        </p>
                      </div>
                    )}

                    <div className="shrink-0">
                      {r.pendingPrice !== null ? (
                        <Chip tone="warning">Revision in review</Chip>
                      ) : (
                        <Button variant="secondary" onClick={() => setRevising(open ? null : r.materialId)}>
                          <IconPlus size={13} />
                          Propose new rate
                        </Button>
                      )}
                    </div>
                  </div>

                  {r.lastRejection && r.pendingPrice === null && (
                    <p className="border-t border-danger/20 bg-danger-bg/40 px-3 py-1.5 text-[11.5px] text-ink">
                      <span className="font-medium">Last submission was rejected:</span> {r.lastRejection}
                    </p>
                  )}

                  {open && (
                    <form action={formAction} className="animate-pop border-t border-edge bg-faint p-3">
                      <input type="hidden" name="materialId" value={r.materialId} />
                      <FormGrid columns={3}>
                        <Field
                          label="Proposed rate (₹/kg)"
                          required
                          hint={r.approvedPrice ? `Current approved rate is ${ratePerKg(r.approvedPrice)}.` : "No approved rate on record yet."}
                        >
                          <Input
                            name="pricePerKg" type="number" step={0.01} min={0.01} required
                            defaultValue={r.approvedPrice ?? ""}
                            autoFocus
                          />
                        </Field>
                        <Field label="Effective from" required hint="Rates take effect only once approved.">
                          <Input name="effectiveFrom" type="date" required defaultValue={tomorrow} min={tomorrow} />
                        </Field>
                        <Field label="Minimum order (kg)">
                          <Input name="moqKg" type="number" min={0} step={100} placeholder="5000" />
                        </Field>
                        <Field label="Lead time (days)">
                          <Input name="leadTimeDays" type="number" min={0} max={365} defaultValue={r.leadTimeDays} />
                        </Field>
                        <Field label="Reason for the revision" span hint="Finance reads this. A clear reason gets approved faster.">
                          <Input name="remark" placeholder="Feedstock escalation — ethylene and chlorine both up this quarter." />
                        </Field>
                      </FormGrid>

                      <div className="mt-3 flex gap-1.5">
                        <SubmitButton pendingLabel="Submitting…">Submit for approval</SubmitButton>
                        <Button type="button" variant="ghost" onClick={() => setRevising(null)}>
                          <IconClose size={13} />
                          Cancel
                        </Button>
                      </div>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ListShell>
  );
}
