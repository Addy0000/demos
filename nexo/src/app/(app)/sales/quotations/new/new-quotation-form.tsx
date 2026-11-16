"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { createSalesQuotation, type ActionState } from "../../sales-actions";
import { SubmitButton, Button, Input, Select, Textarea, Field, FormGrid, FormError } from "@/components/ui/form";
import { money, amount, kgPlain } from "@/lib/format";
import { IconPlus, IconClose } from "@/components/icons";

export type CustomerOption = {
  id: string;
  code: string;
  name: string;
  paymentTerms: string | null;
};

export type InquiryOption = {
  id: string;
  code: string;
  customerId: string;
  customerName: string;
  lines: {
    id: string;
    lineNo: number;
    description: string;
    quantityKg: number;
    targetRate: number | null;
  }[];
};

export type CostSheetOption = {
  id: string;
  code: string;
  projectId: string;
  projectName: string;
  sellingRatePerKg: number;
  marginPct: number;
};

export type ProjectOption = {
  id: string;
  code: string;
  name: string;
  application: string;
  floorRate: number | null;
  costSheetCode: string | null;
};

type Line = {
  key: number;
  projectId: string;
  quantityKg: number;
  ratePerKg: number;
  taxPct: number;
};

export function NewQuotationForm({
  customers,
  inquiries,
  costSheets,
  projects,
}: {
  customers: CustomerOption[];
  inquiries: InquiryOption[];
  costSheets: CostSheetOption[];
  projects: ProjectOption[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(createSalesQuotation, {});
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id ?? "");
  const [selectedInquiryId, setSelectedInquiryId] = useState<string>("");
  const [selectedCostSheetId, setSelectedCostSheetId] = useState<string>("");

  const selectedInquiry = useMemo(() => {
    return inquiries.find((i) => i.id === selectedInquiryId) ?? null;
  }, [inquiries, selectedInquiryId]);

  const selectedCostSheet = useMemo(() => {
    return costSheets.find((cs) => cs.id === selectedCostSheetId) ?? null;
  }, [costSheets, selectedCostSheetId]);

  const [lines, setLines] = useState<Line[]>(() => {
    if (projects.length > 0) {
      const first = projects[0]!;
      return [
        {
          key: 1,
          projectId: first.id,
          quantityKg: 1000,
          ratePerKg: first.floorRate || 130,
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

  function handleInquiryChange(inqId: string) {
    setSelectedInquiryId(inqId);
    const inq = inquiries.find((i) => i.id === inqId);
    if (inq) {
      setSelectedCustomerId(inq.customerId);
      // Populate lines from inquiry reference if projects exist
      if (inq.lines.length > 0 && projects.length > 0) {
        setLines(
          inq.lines.map((inqLine, idx) => {
            const prj = projects[0]!;
            return {
              key: idx + 1,
              projectId: prj.id,
              quantityKg: inqLine.quantityKg,
              ratePerKg: prj.floorRate || 130,
              taxPct: 18,
            };
          }),
        );
        setNextKey(inq.lines.length + 1);
      }
    }
  }

  function handleCostSheetChange(csId: string) {
    setSelectedCostSheetId(csId);
    const cs = costSheets.find((x) => x.id === csId);
    if (cs) {
      const prj = projects.find((p) => p.id === cs.projectId);
      if (prj) {
        // Update first line to match cost sheet project & floor rate
        setLines((ls) => {
          if (ls.length === 0) {
            return [{ key: 1, projectId: prj.id, quantityKg: 1000, ratePerKg: cs.sellingRatePerKg, taxPct: 18 }];
          }
          return ls.map((l, idx) => (idx === 0 ? { ...l, projectId: prj.id, ratePerKg: cs.sellingRatePerKg } : l));
        });
      }
    }
  }

  function addLine() {
    const available = projects.find((p) => !lines.some((l) => l.projectId === p.id)) ?? projects[0];
    if (!available) return;
    setLines((ls) => [
      ...ls,
      {
        key: nextKey,
        projectId: available.id,
        quantityKg: 1000,
        ratePerKg: available.floorRate || 130,
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
        <h1 className="flex-1 text-[14px] font-semibold tracking-tight text-ink">New sales quotation</h1>
        <span className="whitespace-nowrap text-[11.5px] text-muted">
          Total value <span className="font-num text-[13px] font-semibold tabular-nums text-ink">{money(totals.grandTotal, 2)}</span>
        </span>
        <Link
          href="/sales/quotations"
          className="inline-flex h-[26px] items-center rounded px-2.5 text-[12px] text-muted transition-colors duration-150 hover:bg-pastel hover:text-primary"
        >
          Cancel
        </Link>
        <SubmitButton pendingLabel="Saving…">Create Quotation</SubmitButton>
      </div>

      <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-canvas p-3">
        <div className="mx-auto max-w-5xl space-y-3">
          <FormError message={state.error} />

          <section className="panel">
            <header className="flex h-[32px] items-center border-b border-edge bg-faint px-3">
              <h2 className="text-[11.5px] font-semibold text-ink">Quotation header details</h2>
            </header>
            <div className="p-3">
              <FormGrid columns={3}>
                <Field label="Customer" required hint="Customer being quoted.">
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

                <Field label="Sales inquiry (optional)" hint="Link to customer inquiry if originating from one.">
                  <Select
                    name="inquiryId"
                    value={selectedInquiryId}
                    onChange={(e) => handleInquiryChange(e.target.value)}
                  >
                    <option value="">(Direct quotation / No inquiry)</option>
                    {inquiries.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.code} — {i.customerName}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Approved cost sheet (optional)" hint="Pulls rate floor & margin.">
                  <Select
                    name="costSheetId"
                    value={selectedCostSheetId}
                    onChange={(e) => handleCostSheetChange(e.target.value)}
                  >
                    <option value="">(Direct quote / No cost sheet)</option>
                    {costSheets.map((cs) => (
                      <option key={cs.id} value={cs.id}>
                        {cs.code} — {cs.projectName} (₹{cs.sellingRatePerKg.toFixed(2)}/kg)
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Valid until date" hint="Expiration date for quoted pricing.">
                  <Input name="validUntil" type="date" />
                </Field>

                <Field label="Payment terms" hint="Commercial payment terms.">
                  <Input name="paymentTerms" placeholder="e.g. 30 days NET / Advance" />
                </Field>

                <Field label="Delivery terms & lead time" hint="Freight terms & lead time in days.">
                  <div className="flex gap-2">
                    <Input name="deliveryTerms" placeholder="e.g. Ex-works / Door delivery" className="flex-1" />
                    <Input name="leadTimeDays" type="number" min={0} placeholder="Days" className="w-[80px]" />
                  </div>
                </Field>

                <Field label="Remark / Terms note" span hint="Additional commercial conditions.">
                  <Textarea name="remark" rows={2} placeholder="Quotation terms & conditions..." />
                </Field>
              </FormGrid>
            </div>
          </section>

          {selectedInquiry && (
            <section className="panel border-primary/30 bg-primary-bg/10">
              <header className="flex h-[32px] items-center border-b border-edge bg-faint px-3">
                <h2 className="text-[11.5px] font-semibold text-ink">
                  Inquiry reference ({selectedInquiry.code} — {selectedInquiry.customerName})
                </h2>
              </header>
              <div className="p-3">
                <p className="mb-2 text-[11.5px] text-muted">
                  The customer requested the following items. Map each requirement to a compound line below:
                </p>
                <div className="overflow-x-auto scroll-thin">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-edge bg-faint">
                        <th className="px-2.5 py-1 text-left text-[10.5px] font-semibold text-muted">#</th>
                        <th className="px-2.5 py-1 text-left text-[10.5px] font-semibold text-muted">Customer requirement description</th>
                        <th className="w-[120px] px-2.5 py-1 text-right text-[10.5px] font-semibold text-muted">Requested qty</th>
                        <th className="w-[120px] px-2.5 py-1 text-right text-[10.5px] font-semibold text-muted">Target rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedInquiry.lines.map((l) => (
                        <tr key={l.id} className="border-b border-edge/60 last:border-b-0">
                          <td className="px-2.5 py-1 font-num text-[11.5px] text-muted">{l.lineNo}</td>
                          <td className="px-2.5 py-1 text-[11.5px] text-ink">{l.description}</td>
                          <td className="px-2.5 py-1 text-right font-num text-[11.5px] text-ink">{kgPlain(l.quantityKg)}</td>
                          <td className="px-2.5 py-1 text-right font-num text-[11.5px] text-muted">
                            {l.targetRate ? `₹${l.targetRate.toFixed(2)}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          <section className="panel">
            <header className="flex h-[32px] items-center gap-2 border-b border-edge bg-faint px-3">
              <h2 className="text-[11.5px] font-semibold text-ink">Quotation line items</h2>
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
                No lines added yet. Add at least one line item to build the quotation.
              </p>
            ) : (
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full min-w-[860px]">
                  <thead>
                    <tr className="border-b border-edge bg-faint">
                      <th className="w-[36px] px-2.5 py-1.5 text-left text-[10.5px] font-semibold text-muted">#</th>
                      <th className="px-2.5 py-1.5 text-left text-[10.5px] font-semibold text-muted">Compound / Project</th>
                      <th className="w-[130px] px-2.5 py-1.5 text-right text-[10.5px] font-semibold text-muted">Quantity (kg)</th>
                      <th className="w-[130px] px-2.5 py-1.5 text-right text-[10.5px] font-semibold text-muted">Rate (₹/kg)</th>
                      <th className="w-[90px] px-2.5 py-1.5 text-right text-[10.5px] font-semibold text-muted">Tax %</th>
                      <th className="w-[130px] px-2.5 py-1.5 text-right text-[10.5px] font-semibold text-muted">Line total</th>
                      <th className="w-[40px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const prj = projects.find((p) => p.id === l.projectId);
                      const lineSubtotal = (Number(l.quantityKg) || 0) * (Number(l.ratePerKg) || 0);
                      const floor = prj?.floorRate;

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
                                  ratePerKg: selectedPrj?.floorRate || l.ratePerKg,
                                });
                              }}
                            >
                              {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.code}{p.floorRate ? ` · Approved floor ₹${p.floorRate.toFixed(2)}/kg` : ""})
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
                              className={`text-right font-num ${floor && l.ratePerKg < floor ? "border-danger text-danger" : ""}`}
                              required
                            />
                            {floor && (
                              <div className="text-[10px] text-muted text-right mt-0.5">
                                Floor: ₹{floor.toFixed(2)}/kg
                              </div>
                            )}
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
                    <dt className="text-muted">Total weight</dt>
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
                    <dt className="font-medium text-ink">Total Quotation Value</dt>
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
