"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { createCostSheet, type ActionState } from "../../sales-actions";
import { SubmitButton, Input, Select, Textarea, Field, FormGrid, FormError } from "@/components/ui/form";
import { money, amount } from "@/lib/format";

export type FormulationOption = {
  id: string;
  version: number;
  projectId: string;
  projectCode: string;
  projectName: string;
  targetPrice: number | null;
  materialCostPerKg: number;
  lines: {
    id: string;
    materialName: string;
    materialCode: string;
    phr: number;
    ratePerKg: number;
  }[];
};

export function NewCostSheetForm({
  formulations,
}: {
  formulations: FormulationOption[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(createCostSheet, {});
  const [selectedFormulationId, setSelectedFormulationId] = useState<string>(formulations[0]?.id ?? "");

  const [conversionPerKg, setConversionPerKg] = useState<number | string>(12);
  const [overheadPct, setOverheadPct] = useState<number | string>(5);
  const [marginPct, setMarginPct] = useState<number | string>(12);

  const formulation = useMemo(() => {
    return formulations.find((f) => f.id === selectedFormulationId) ?? null;
  }, [formulations, selectedFormulationId]);

  const calculations = useMemo(() => {
    const mat = formulation?.materialCostPerKg ?? 0;
    const conv = Number(conversionPerKg) || 0;
    const ovhPct = Number(overheadPct) || 0;
    const mgnPct = Number(marginPct) || 0;

    const ovh = (mat + conv) * (ovhPct / 100);
    const totalCost = mat + conv + ovh;
    const sellingRate = totalCost * (1 + mgnPct / 100);
    const contribution = sellingRate - totalCost;

    return {
      materialCost: mat,
      conversion: conv,
      overhead: ovh,
      totalCost,
      sellingRate,
      contribution,
    };
  }, [formulation, conversionPerKg, overheadPct, marginPct]);

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-edge bg-faint px-3">
        <h1 className="flex-1 text-[14px] font-semibold tracking-tight text-ink">New compound cost sheet</h1>
        <span className="whitespace-nowrap text-[11.5px] text-muted">
          Selling rate <span className="font-num text-[13px] font-semibold tabular-nums text-ink">₹{calculations.sellingRate.toFixed(2)}/kg</span>
        </span>
        <Link
          href="/sales/cost-sheets"
          className="inline-flex h-[26px] items-center rounded px-2.5 text-[12px] text-muted transition-colors duration-150 hover:bg-pastel hover:text-primary"
        >
          Cancel
        </Link>
        <SubmitButton pendingLabel="Saving…">Create Cost Sheet</SubmitButton>
      </div>

      <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-canvas p-3">
        <div className="mx-auto max-w-4xl space-y-3">
          <FormError message={state.error} />

          <section className="panel">
            <header className="flex h-[32px] items-center border-b border-edge bg-faint px-3">
              <h2 className="text-[11.5px] font-semibold text-ink">Compound & Costing parameters</h2>
            </header>
            <div className="p-3">
              <FormGrid columns={2}>
                <Field label="Compound formulation" required hint="Select formulation to cost.">
                  <Select
                    name="formulationId"
                    value={selectedFormulationId}
                    onChange={(e) => setSelectedFormulationId(e.target.value)}
                    required
                  >
                    {formulations.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.projectName} ({f.projectCode} · v{f.version})
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Conversion cost (₹/kg)" required hint="Processing power, labour, packing & wastage.">
                  <Input
                    name="conversionPerKg"
                    type="number"
                    min={0}
                    step={0.1}
                    value={conversionPerKg}
                    onChange={(e) => setConversionPerKg(e.target.value)}
                    className="font-num"
                    required
                  />
                </Field>

                <Field label="Overhead %" hint="Overhead % applied on material + conversion cost.">
                  <Input
                    name="overheadPct"
                    type="number"
                    min={0}
                    step={0.5}
                    value={overheadPct}
                    onChange={(e) => setOverheadPct(e.target.value)}
                    className="font-num"
                  />
                </Field>

                <Field label="Target margin %" required hint="Finance target profit margin % on total cost.">
                  <Input
                    name="marginPct"
                    type="number"
                    min={0}
                    step={0.5}
                    value={marginPct}
                    onChange={(e) => setMarginPct(e.target.value)}
                    className="font-num"
                    required
                  />
                </Field>

                <Field label="Remark / Justification" span hint="Notes on pricing or cost assumptions.">
                  <Textarea name="remark" rows={2} placeholder="Costing notes, vendor price base assumptions…" />
                </Field>
              </FormGrid>
            </div>
          </section>

          {formulation && (
            <section className="panel">
              <header className="flex h-[32px] items-center gap-2 border-b border-edge bg-faint px-3">
                <h2 className="text-[11.5px] font-semibold text-ink">Formulation cost breakdown ({formulation.projectName})</h2>
              </header>
              <div className="p-3 space-y-3">
                <div className="overflow-x-auto scroll-thin">
                  <table className="w-full min-w-[500px]">
                    <thead>
                      <tr className="border-b border-edge bg-faint">
                        <th className="px-2.5 py-1.5 text-left text-[10.5px] font-semibold text-muted">Material</th>
                        <th className="w-[100px] px-2.5 py-1.5 text-right text-[10.5px] font-semibold text-muted">PHR</th>
                        <th className="w-[120px] px-2.5 py-1.5 text-right text-[10.5px] font-semibold text-muted">Current rate</th>
                        <th className="w-[120px] px-2.5 py-1.5 text-right text-[10.5px] font-semibold text-muted">Cost fraction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formulation.lines.map((l) => {
                        const totalPhr = formulation.lines.reduce((a, x) => a + x.phr, 0);
                        const fraction = totalPhr > 0 ? l.phr / totalPhr : 0;
                        const cost = fraction * l.ratePerKg;

                        return (
                          <tr key={l.id} className="border-b border-edge/60 last:border-b-0">
                            <td className="px-2.5 py-1.5 text-[12px] text-ink">{l.materialName} ({l.materialCode})</td>
                            <td className="px-2.5 py-1.5 text-right font-num text-[12px] text-muted">{l.phr.toFixed(2)}</td>
                            <td className="px-2.5 py-1.5 text-right font-num text-[12px] text-muted">₹{l.ratePerKg.toFixed(2)}/kg</td>
                            <td className="px-2.5 py-1.5 text-right font-num text-[12px] font-medium text-ink">₹{cost.toFixed(3)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="rounded border border-edge bg-faint p-3 space-y-1 text-[12px]">
                  <div className="flex justify-between">
                    <span className="text-muted">Raw Material Cost:</span>
                    <span className="font-num font-medium text-ink">₹{calculations.materialCost.toFixed(3)}/kg</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Conversion Cost:</span>
                    <span className="font-num font-medium text-ink">₹{calculations.conversion.toFixed(3)}/kg</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Overhead ({overheadPct}%):</span>
                    <span className="font-num font-medium text-ink">₹{calculations.overhead.toFixed(3)}/kg</span>
                  </div>
                  <div className="flex justify-between border-t border-edge/60 pt-1 font-semibold">
                    <span className="text-ink">Total Production Cost:</span>
                    <span className="font-num text-ink">₹{calculations.totalCost.toFixed(3)}/kg</span>
                  </div>
                  <div className="flex justify-between text-success-text">
                    <span>Margin ({marginPct}% on cost):</span>
                    <span className="font-num font-medium">₹{calculations.contribution.toFixed(3)}/kg</span>
                  </div>
                  <div className="flex justify-between border-t border-edge pt-1.5 text-[13px] font-bold">
                    <span className="text-ink">Final Selling Rate:</span>
                    <span className="font-num text-primary">₹{calculations.sellingRate.toFixed(2)}/kg</span>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </form>
  );
}
