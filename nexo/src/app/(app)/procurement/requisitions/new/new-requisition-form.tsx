"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { createPurchaseRequisition, type ActionState } from "../../sourcing-actions";
import { SubmitButton, Button, Input, Select, Textarea, Field, FormGrid, FormError } from "@/components/ui/form";
import { money, amount, kgPlain, ratePerKg } from "@/lib/format";
import { IconPlus, IconClose } from "@/components/icons";

export type MaterialOption = {
  id: string;
  code: string;
  name: string;
  grade: string;
  uom: string;
  rate: number;
  onHand: number;
  suggestedQty: number;
};

export type ProjectOption = {
  id: string;
  code: string;
  name: string;
};

type Line = {
  key: number;
  materialId: string;
  quantityKg: number;
  remark: string;
};

export function NewRequisitionForm({
  materials,
  projects,
}: {
  materials: MaterialOption[];
  projects: ProjectOption[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(createPurchaseRequisition, {});
  const [lines, setLines] = useState<Line[]>(() => {
    if (materials.length > 0) {
      const first = materials[0]!;
      return [
        {
          key: 1,
          materialId: first.id,
          quantityKg: first.suggestedQty || 1000,
          remark: "",
        },
      ];
    }
    return [];
  });
  const [nextKey, setNextKey] = useState(2);

  const totals = useMemo(() => {
    const totalQty = lines.reduce((a, l) => a + (Number(l.quantityKg) || 0), 0);
    const estValue = lines.reduce((a, l) => {
      const mat = materials.find((m) => m.id === l.materialId);
      const rate = mat?.rate ?? 0;
      return a + (Number(l.quantityKg) || 0) * rate;
    }, 0);
    return { totalQty, estValue };
  }, [lines, materials]);

  function addLine() {
    const available = materials.find((m) => !lines.some((l) => l.materialId === m.id)) ?? materials[0];
    if (!available) return;
    setLines((ls) => [
      ...ls,
      {
        key: nextKey,
        materialId: available.id,
        quantityKg: available.suggestedQty || 1000,
        remark: "",
      },
    ]);
    setNextKey((k) => k + 1);
  }

  function patch(key: number, next: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...next } : l)));
  }

  const payload = JSON.stringify(
    lines.map(({ materialId, quantityKg, remark }) => ({
      materialId,
      quantityKg: Number(quantityKg) || 0,
      remark: remark?.trim() || undefined,
    })),
  );

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="lines" value={payload} />

      <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-edge bg-faint px-3">
        <h1 className="flex-1 text-[14px] font-semibold tracking-tight text-ink">New purchase requisition</h1>
        <span className="whitespace-nowrap text-[11.5px] text-muted">
          Est. total <span className="font-num text-[13px] font-semibold tabular-nums text-ink">{money(totals.estValue, 2)}</span>
        </span>
        <Link
          href="/procurement/requisitions"
          className="inline-flex h-[26px] items-center rounded px-2.5 text-[12px] text-muted transition-colors duration-150 hover:bg-pastel hover:text-primary"
        >
          Cancel
        </Link>
        <SubmitButton pendingLabel="Saving…">Save as Draft</SubmitButton>
      </div>

      <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-canvas p-3">
        <div className="mx-auto max-w-5xl space-y-3">
          <FormError message={state.error} />

          <section className="panel">
            <header className="flex h-[32px] items-center border-b border-edge bg-faint px-3">
              <h2 className="text-[11.5px] font-semibold text-ink">Requisition details</h2>
            </header>
            <div className="p-3">
              <FormGrid columns={3}>
                <Field label="Purpose / Justification" required hint="Why the material is needed — e.g. Production trial, batch shortage, reorder.">
                  <Input
                    name="purpose"
                    required
                    placeholder="e.g. Raw material replenishment for cable compound line"
                  />
                </Field>
                <Field label="Required by date" hint="Date by which material is expected on factory floor.">
                  <Input name="requiredBy" type="date" />
                </Field>
                <Field label="Linked project" hint="Associate with an R&D or customer project if applicable.">
                  <Select name="projectId" defaultValue="">
                    <option value="">No linked project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="General remarks / notes" span hint="Additional context, delivery instructions, or priority notes.">
                  <Textarea
                    name="remark"
                    rows={2}
                    placeholder="Notes for procurement / approver…"
                  />
                </Field>
              </FormGrid>
            </div>
          </section>

          <section className="panel">
            <header className="flex h-[32px] items-center gap-2 border-b border-edge bg-faint px-3">
              <h2 className="text-[11.5px] font-semibold text-ink">Material lines</h2>
              <span className="text-[11px] text-muted">
                {lines.length} {lines.length === 1 ? "line" : "lines"}
              </span>
              <div className="flex-1" />
              <Button
                type="button"
                variant="secondary"
                onClick={addLine}
                disabled={materials.length === 0}
              >
                <IconPlus size={13} />
                Add material line
              </Button>
            </header>

            {lines.length === 0 ? (
              <p className="px-3 py-10 text-center text-[12.5px] text-muted">
                No material lines yet. Add the materials and quantities you need to procure.
              </p>
            ) : (
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full min-w-[860px]">
                  <thead>
                    <tr className="border-b border-edge bg-faint">
                      <th className="w-[36px] px-2.5 py-1.5 text-left text-[10.5px] font-semibold text-muted">#</th>
                      <th className="px-2.5 py-1.5 text-left text-[10.5px] font-semibold text-muted">Material</th>
                      <th className="w-[100px] px-2.5 py-1.5 text-right text-[10.5px] font-semibold text-muted">Stock on hand</th>
                      <th className="w-[130px] px-2.5 py-1.5 text-right text-[10.5px] font-semibold text-muted">Quantity (kg)</th>
                      <th className="w-[110px] px-2.5 py-1.5 text-right text-[10.5px] font-semibold text-muted">Est. rate</th>
                      <th className="w-[120px] px-2.5 py-1.5 text-right text-[10.5px] font-semibold text-muted">Est. value</th>
                      <th className="w-[180px] px-2.5 py-1.5 text-left text-[10.5px] font-semibold text-muted">Line notes</th>
                      <th className="w-[40px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const mat = materials.find((m) => m.id === l.materialId);
                      const rate = mat?.rate ?? 0;
                      const lineValue = (Number(l.quantityKg) || 0) * rate;

                      return (
                        <tr key={l.key} className="border-b border-edge/60 last:border-b-0">
                          <td className="px-2.5 py-1.5 font-num text-[12px] text-muted">{i + 1}</td>
                          <td className="px-2.5 py-1.5">
                            <Select
                              value={l.materialId}
                              onChange={(e) => {
                                const selectedMat = materials.find((x) => x.id === e.target.value);
                                patch(l.key, {
                                  materialId: e.target.value,
                                  quantityKg: selectedMat?.suggestedQty || l.quantityKg,
                                });
                              }}
                            >
                              {materials.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name} ({m.code}{m.grade ? ` · ${m.grade}` : ""})
                                </option>
                              ))}
                            </Select>
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-num text-[12px] tabular-nums text-muted">
                            {mat ? kgPlain(mat.onHand) : "—"}
                          </td>
                          <td className="px-2.5 py-1.5">
                            <Input
                              type="number"
                              min={0.001}
                              step={1}
                              value={l.quantityKg}
                              onChange={(e) => patch(l.key, { quantityKg: Number(e.target.value) || 0 })}
                              className="text-right font-num"
                              required
                            />
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-num text-[12px] tabular-nums text-muted">
                            {rate > 0 ? ratePerKg(rate) : "—"}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-num text-[12px] font-medium tabular-nums text-ink">
                            {lineValue > 0 ? amount(lineValue) : "—"}
                          </td>
                          <td className="px-2.5 py-1.5">
                            <Input
                              type="text"
                              value={l.remark}
                              onChange={(e) => patch(l.key, { remark: e.target.value })}
                              placeholder="Spec, grade or packing note…"
                            />
                          </td>
                          <td className="px-2.5 py-1.5">
                            <button
                              type="button"
                              onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                              aria-label="Remove line"
                              disabled={lines.length === 1}
                              className="grid h-6 w-6 place-items-center rounded text-muted transition-colors duration-150 hover:bg-danger-bg hover:text-danger disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted"
                            >
                              <IconClose size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <dl className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-edge bg-faint px-3 py-2 text-[11.5px]">
                  <div className="flex gap-2">
                    <dt className="text-muted">Total wanted</dt>
                    <dd className="font-num tabular-nums text-ink">{kgPlain(totals.totalQty)}</dd>
                  </div>
                  <div className="flex gap-2 border-l border-edge pl-6">
                    <dt className="font-medium text-ink">Est. total value</dt>
                    <dd className="font-num text-[13px] font-semibold tabular-nums text-ink">{money(totals.estValue, 2)}</dd>
                  </div>
                </dl>
              </div>
            )}
          </section>
        </div>
      </div>
    </form>
  );
}
