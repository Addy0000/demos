"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { createSalesOrder, type ActionState } from "../../sales-actions";
import { SubmitButton, Button, Input, Select, Textarea, Field, FormGrid, FormError } from "@/components/ui/form";
import { money, amount, kgPlain } from "@/lib/format";
import { IconPlus, IconClose } from "@/components/icons";

export type CustomerOption = {
  id: string;
  code: string;
  name: string;
  creditLimit: number;
  outstandingAmt: number;
  paymentTerms: string | null;
};

export type ProjectOption = {
  id: string;
  code: string;
  name: string;
  application: string;
  targetPricePerKg: number | null;
};

type Line = {
  key: number;
  projectId: string;
  quantityKg: number;
  ratePerKg: number;
  taxPct: number;
};

export function NewSalesOrderForm({
  customers,
  projects,
}: {
  customers: CustomerOption[];
  projects: ProjectOption[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(createSalesOrder, {});
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id ?? "");

  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId) ?? null;
  }, [customers, selectedCustomerId]);

  const [lines, setLines] = useState<Line[]>(() => {
    if (projects.length > 0) {
      const first = projects[0]!;
      return [
        {
          key: 1,
          projectId: first.id,
          quantityKg: 1000,
          ratePerKg: first.targetPricePerKg || 120,
          taxPct: 18,
        },
      ];
    }
    return [];
  });
  const [nextKey, setNextKey] = useState(2);

  const totals = useMemo(() => {
    const totalQty = lines.reduce((a, l) => a + (Number(l.quantityKg) || 0), 0);
    const subtotal = lines.reduce(
      (a, l) => a + (Number(l.quantityKg) || 0) * (Number(l.ratePerKg) || 0),
      0,
    );
    const tax = lines.reduce(
      (a, l) =>
        a +
        ((Number(l.quantityKg) || 0) *
          (Number(l.ratePerKg) || 0) *
          (Number(l.taxPct) || 18)) /
          100,
      0,
    );
    const grandTotal = subtotal + tax;
    return { totalQty, subtotal, tax, grandTotal };
  }, [lines]);

  function addLine() {
    const available = projects.find((p) => !lines.some((l) => l.projectId === p.id)) ?? projects[0];
    if (!available) return;
    setLines((ls) => [
      ...ls,
      {
        key: nextKey,
        projectId: available.id,
        quantityKg: 1000,
        ratePerKg: available.targetPricePerKg || 120,
        taxPct: 18,
      },
    ]);
    setNextKey((k) => k + 1);
  }

  function patch(key: number, next: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...next } : l)));
  }

  const payload = JSON.stringify(
    lines.map(({ projectId, quantityKg, ratePerKg, taxPct }) => ({
      projectId,
      quantityKg: Number(quantityKg) || 0,
      ratePerKg: Number(ratePerKg) || 0,
      taxPct: Number(taxPct) || 18,
    })),
  );

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="lines" value={payload} />

      <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-edge bg-faint px-3">
        <h1 className="flex-1 text-[14px] font-semibold tracking-tight text-ink">New direct sales order</h1>
        <span className="whitespace-nowrap text-[11.5px] text-muted">
          Total value <span className="font-num text-[13px] font-semibold tabular-nums text-ink">{money(totals.grandTotal, 2)}</span>
        </span>
        <Link
          href="/sales/orders"
          className="inline-flex h-[26px] items-center rounded px-2.5 text-[12px] text-muted transition-colors duration-150 hover:bg-pastel hover:text-primary"
        >
          Cancel
        </Link>
        <SubmitButton pendingLabel="Saving…">Create Sales Order</SubmitButton>
      </div>

      <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-canvas p-3">
        <div className="mx-auto max-w-5xl space-y-3">
          <FormError message={state.error} />

          <section className="panel">
            <header className="flex h-[32px] items-center border-b border-edge bg-faint px-3">
              <h2 className="text-[11.5px] font-semibold text-ink">Order header details</h2>
            </header>
            <div className="p-3">
              <FormGrid columns={3}>
                <Field label="Customer" required hint="Select customer purchasing compound.">
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
                <Field label="Customer PO Number" hint="Customer's purchase order reference.">
                  <Input name="customerPoNo" placeholder="e.g. PO/2026/8841" />
                </Field>
                <Field label="Customer PO Date" hint="Date issued on customer PO.">
                  <Input name="customerPoDate" type="date" />
                </Field>
                <Field label="Promised delivery date" hint="Date material is promised to reach customer.">
                  <Input name="promisedOn" type="date" />
                </Field>
                <Field label="Payment terms" hint="Defaults to customer payment terms.">
                  <Input
                    name="paymentTerms"
                    defaultValue={selectedCustomer?.paymentTerms ?? ""}
                    placeholder="e.g. 30 days NET"
                  />
                </Field>
                <Field label="Delivery terms" hint="Freight & delivery terms.">
                  <Input name="deliveryTerms" placeholder="e.g. Ex-Works / Door Delivery" />
                </Field>
                <Field label="Order remark / notes" span hint="Special packing or dispatch instructions.">
                  <Textarea name="remark" rows={2} placeholder="Internal or delivery remarks…" />
                </Field>
              </FormGrid>

              {selectedCustomer && (
                <div className="mt-3 flex items-center gap-4 rounded border border-edge/60 bg-faint/60 px-3 py-2 text-[11.5px]">
                  <span className="text-muted">Credit position for <strong className="text-ink">{selectedCustomer.name}</strong>:</span>
                  <span>Limit: <strong className="font-num text-ink">{money(selectedCustomer.creditLimit)}</strong></span>
                  <span>Outstanding: <strong className="font-num text-ink">{money(selectedCustomer.outstandingAmt)}</strong></span>
                  <span>Available Credit: <strong className="font-num text-success-text">{money(Math.max(0, selectedCustomer.creditLimit - selectedCustomer.outstandingAmt))}</strong></span>
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <header className="flex h-[32px] items-center gap-2 border-b border-edge bg-faint px-3">
              <h2 className="text-[11.5px] font-semibold text-ink">Compound line items</h2>
              <span className="text-[11px] text-muted">
                {lines.length} {lines.length === 1 ? "line" : "lines"}
              </span>
              <div className="flex-1" />
              <Button type="button" variant="secondary" onClick={addLine} disabled={projects.length === 0}>
                <IconPlus size={13} />
                Add compound line
              </Button>
            </header>

            {lines.length === 0 ? (
              <p className="px-3 py-10 text-center text-[12.5px] text-muted">
                No compound lines added yet. Add at least one compound line item to create order.
              </p>
            ) : (
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full min-w-[860px]">
                  <thead>
                    <tr className="border-b border-edge bg-faint">
                      <th className="w-[36px] px-2.5 py-1.5 text-left text-[10.5px] font-semibold text-muted">#</th>
                      <th className="px-2.5 py-1.5 text-left text-[10.5px] font-semibold text-muted">Compound / Project</th>
                      <th className="w-[130px] px-2.5 py-1.5 text-right text-[10.5px] font-semibold text-muted">Quantity (kg)</th>
                      <th className="w-[120px] px-2.5 py-1.5 text-right text-[10.5px] font-semibold text-muted">Rate (₹/kg)</th>
                      <th className="w-[90px] px-2.5 py-1.5 text-right text-[10.5px] font-semibold text-muted">Tax %</th>
                      <th className="w-[130px] px-2.5 py-1.5 text-right text-[10.5px] font-semibold text-muted">Line total</th>
                      <th className="w-[40px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const prj = projects.find((p) => p.id === l.projectId);
                      const lineSubtotal = (Number(l.quantityKg) || 0) * (Number(l.ratePerKg) || 0);

                      return (
                        <tr key={l.key} className="border-b border-edge/60 last:border-b-0">
                          <td className="px-2.5 py-1.5 font-num text-[12px] text-muted">{i + 1}</td>
                          <td className="px-2.5 py-1.5">
                            <Select
                              value={l.projectId}
                              onChange={(e) => {
                                const selectedPrj = projects.find((x) => x.id === e.target.value);
                                patch(l.key, {
                                  projectId: e.target.value,
                                  ratePerKg: selectedPrj?.targetPricePerKg || l.ratePerKg,
                                });
                              }}
                            >
                              {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.code}{p.application ? ` · ${p.application}` : ""})
                                </option>
                              ))}
                            </Select>
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
                          <td className="px-2.5 py-1.5">
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={l.ratePerKg}
                              onChange={(e) => patch(l.key, { ratePerKg: Number(e.target.value) || 0 })}
                              className="text-right font-num"
                              required
                            />
                          </td>
                          <td className="px-2.5 py-1.5">
                            <Input
                              type="number"
                              min={0}
                              step={0.5}
                              value={l.taxPct}
                              onChange={(e) => patch(l.key, { taxPct: Number(e.target.value) || 0 })}
                              className="text-right font-num"
                            />
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-num text-[12px] font-medium tabular-nums text-ink">
                            {lineSubtotal > 0 ? amount(lineSubtotal) : "—"}
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
                    <dt className="text-muted">Total ordered</dt>
                    <dd className="font-num tabular-nums text-ink">{kgPlain(totals.totalQty)}</dd>
                  </div>
                  <div className="flex gap-2 border-l border-edge pl-6">
                    <dt className="text-muted">Subtotal</dt>
                    <dd className="font-num tabular-nums text-ink">{amount(totals.subtotal)}</dd>
                  </div>
                  <div className="flex gap-2 border-l border-edge pl-6">
                    <dt className="text-muted">Tax (18%)</dt>
                    <dd className="font-num tabular-nums text-ink">{amount(totals.tax)}</dd>
                  </div>
                  <div className="flex gap-2 border-l border-edge pl-6">
                    <dt className="font-medium text-ink">Total Order Value</dt>
                    <dd className="font-num text-[13px] font-semibold tabular-nums text-ink">{money(totals.grandTotal, 2)}</dd>
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
