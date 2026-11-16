"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createSalesInquiry, type ActionState } from "../../sales-actions";
import { SubmitButton, Button, Input, Select, Textarea, Field, FormGrid, FormError } from "@/components/ui/form";
import { IconPlus, IconClose } from "@/components/icons";

export type CustomerOption = {
  id: string;
  code: string;
  name: string;
  industry: string;
};

export type ProjectOption = {
  id: string;
  code: string;
  name: string;
  application: string;
};

type Line = {
  key: number;
  description: string;
  quantityKg: number;
  targetRate: number | string;
};

export function NewSalesInquiryForm({
  customers,
  projects,
}: {
  customers: CustomerOption[];
  projects: ProjectOption[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(createSalesInquiry, {});
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id ?? "");

  const [lines, setLines] = useState<Line[]>([
    {
      key: 1,
      description: "PVC compound requirement",
      quantityKg: 5000,
      targetRate: "",
    },
  ]);
  const [nextKey, setNextKey] = useState(2);

  function addLine() {
    setLines((ls) => [
      ...ls,
      {
        key: nextKey,
        description: "",
        quantityKg: 1000,
        targetRate: "",
      },
    ]);
    setNextKey((k) => k + 1);
  }

  function patch(key: number, next: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...next } : l)));
  }

  const payload = JSON.stringify(
    lines.map(({ description, quantityKg, targetRate }) => ({
      description: description.trim(),
      quantityKg: Number(quantityKg) || 0,
      targetRate: targetRate !== "" ? Number(targetRate) : null,
    })),
  );

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="lines" value={payload} />

      <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-edge bg-faint px-3">
        <h1 className="flex-1 text-[14px] font-semibold tracking-tight text-ink">New sales inquiry</h1>
        <Link
          href="/sales/inquiries"
          className="inline-flex h-[26px] items-center rounded px-2.5 text-[12px] text-muted transition-colors duration-150 hover:bg-pastel hover:text-primary"
        >
          Cancel
        </Link>
        <SubmitButton pendingLabel="Saving…">Create Inquiry</SubmitButton>
      </div>

      <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-canvas p-3">
        <div className="mx-auto max-w-4xl space-y-3">
          <FormError message={state.error} />

          <section className="panel">
            <header className="flex h-[32px] items-center border-b border-edge bg-faint px-3">
              <h2 className="text-[11.5px] font-semibold text-ink">Inquiry details</h2>
            </header>
            <div className="p-3">
              <FormGrid columns={2}>
                <Field label="Customer" required hint="Select customer making the inquiry.">
                  <Select
                    name="customerId"
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    required
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Matched compound / Project (optional)" hint="If known, match to existing compound.">
                  <Select name="projectId" defaultValue="">
                    <option value="">(None — new requirement)</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Required-by date" hint="Date customer needs delivery or trial sample.">
                  <Input name="requiredBy" type="date" />
                </Field>

                <Field label="Source / Channel" hint="How inquiry arrived (e.g. Email, Phone, Direct visit).">
                  <Input name="source" placeholder="e.g. Email request / Sales visit" />
                </Field>

                <Field label="Remark / Notes" span hint="Additional details or special requirements.">
                  <Textarea name="remark" rows={2} placeholder="Customer requirements, specs, notes…" />
                </Field>
              </FormGrid>
            </div>
          </section>

          <section className="panel">
            <header className="flex h-[32px] items-center gap-2 border-b border-edge bg-faint px-3">
              <h2 className="text-[11.5px] font-semibold text-ink">Requested items</h2>
              <span className="text-[11px] text-muted">
                {lines.length} {lines.length === 1 ? "item" : "items"}
              </span>
              <div className="flex-1" />
              <Button type="button" variant="secondary" onClick={addLine}>
                <IconPlus size={13} />
                Add line item
              </Button>
            </header>

            <div className="overflow-x-auto scroll-thin">
              <table className="w-full min-w-[650px]">
                <thead>
                  <tr className="border-b border-edge bg-faint">
                    <th className="w-[36px] px-2.5 py-1.5 text-left text-[10.5px] font-semibold text-muted">#</th>
                    <th className="px-2.5 py-1.5 text-left text-[10.5px] font-semibold text-muted">Requirement description</th>
                    <th className="w-[140px] px-2.5 py-1.5 text-right text-[10.5px] font-semibold text-muted">Quantity (kg)</th>
                    <th className="w-[140px] px-2.5 py-1.5 text-right text-[10.5px] font-semibold text-muted">Target rate (₹/kg)</th>
                    <th className="w-[40px]" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.key} className="border-b border-edge/60 last:border-b-0">
                      <td className="px-2.5 py-1.5 font-num text-[12px] text-muted">{i + 1}</td>
                      <td className="px-2.5 py-1.5">
                        <Input
                          value={l.description}
                          onChange={(e) => patch(l.key, { description: e.target.value })}
                          placeholder="Describe the requested compound/spec…"
                          required
                        />
                      </td>
                      <td className="px-2.5 py-1.5">
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={l.quantityKg}
                          onChange={(e) => patch(l.key, { quantityKg: Number(e.target.value) || 0 })}
                          className="text-right font-num"
                          required
                        />
                      </td>
                      <td className="px-2.5 py-1.5">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={l.targetRate}
                          onChange={(e) => patch(l.key, { targetRate: e.target.value })}
                          placeholder="Optional"
                          className="text-right font-num"
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
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </form>
  );
}
