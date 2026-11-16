"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { createPurchaseOrder, type ActionState } from "../../actions";
import { SubmitButton, Button, Input, Select, Textarea, Field, FormGrid, FormError } from "@/components/ui/form";
import { money, amount, ratePerKg } from "@/lib/format";
import { IconPlus, IconClose } from "@/components/icons";

type Material = { id: string; code: string; name: string; grade: string; rate: number; suggestedQty: number };
type Vendor = { id: string; code: string; name: string; paymentTerms: string; materials: Material[] };
type Line = { key: number; materialId: string; quantityKg: number; ratePerKg: number; taxPct: number };

export function NewOrderForm({ vendors }: { vendors: Vendor[] }) {
  const [state, formAction] = useActionState<ActionState, FormData>(createPurchaseOrder, {});
  const [vendorId, setVendorId] = useState("");
  const [freight, setFreight] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [nextKey, setNextKey] = useState(1);

  const vendor = vendors.find((v) => v.id === vendorId);
  const available = vendor?.materials ?? [];

  const totals = useMemo(() => {
    const subtotal = lines.reduce((a, l) => a + l.quantityKg * l.ratePerKg, 0);
    const tax = lines.reduce((a, l) => a + (l.quantityKg * l.ratePerKg * l.taxPct) / 100, 0);
    return { subtotal, tax, total: subtotal + tax + freight };
  }, [lines, freight]);

  function addLine() {
    const first = available.find((m) => !lines.some((l) => l.materialId === m.id));
    if (!first) return;
    setLines((ls) => [
      ...ls,
      { key: nextKey, materialId: first.id, quantityKg: first.suggestedQty || 1000, ratePerKg: first.rate, taxPct: 18 },
    ]);
    setNextKey((k) => k + 1);
  }

  function patch(key: number, next: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...next } : l)));
  }

  const payload = JSON.stringify(
    lines.map(({ materialId, quantityKg, ratePerKg: r, taxPct }) => ({ materialId, quantityKg, ratePerKg: r, taxPct })),
  );

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="lines" value={payload} />

      <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-edge bg-faint px-3">
        <h1 className="flex-1 text-[14px] font-semibold tracking-tight text-ink">New purchase order</h1>
        <span className="whitespace-nowrap text-[11.5px] text-muted">
          Total <span className="font-num text-[13px] font-semibold tabular-nums text-ink">{money(totals.total, 2)}</span>
        </span>
        <Link
          href="/procurement/orders"
          className="inline-flex h-[26px] items-center rounded px-2.5 text-[12px] text-muted transition-colors duration-150 hover:bg-pastel hover:text-primary"
        >
          Cancel
        </Link>
        <SubmitButton pendingLabel="Raising…">Raise for approval</SubmitButton>
      </div>

      <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-canvas p-3">
        <div className="mx-auto max-w-5xl space-y-3">
          <FormError message={state.error} />

          <section className="panel">
            <header className="flex h-[32px] items-center border-b border-edge bg-faint px-3">
              <h2 className="text-[11.5px] font-semibold text-ink">Vendor & terms</h2>
            </header>
            <div className="p-3">
              <FormGrid columns={3}>
                <Field label="Vendor" required hint="Only materials this vendor is approved to supply can be ordered.">
                  <Select
                    name="vendorId"
                    required
                    value={vendorId}
                    onChange={(e) => { setVendorId(e.target.value); setLines([]); }}
                  >
                    <option value="">Choose a vendor…</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>{v.name} ({v.code})</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Expected delivery">
                  <Input name="expectedOn" type="date" />
                </Field>
                <Field label="Freight (₹)">
                  <Input
                    name="freight" type="number" min={0} step={100}
                    value={freight}
                    onChange={(e) => setFreight(Number(e.target.value) || 0)}
                  />
                </Field>
                <Field label="Delivery terms">
                  <Input name="deliveryTerms" placeholder="FOR our works" />
                </Field>
                <Field label="Payment terms">
                  <Input name="paymentTerms" defaultValue={vendor?.paymentTerms} key={vendorId} placeholder="45 days net" />
                </Field>
                <Field label="Remark">
                  <Input name="remark" placeholder="Anything the vendor should know" />
                </Field>
              </FormGrid>
            </div>
          </section>

          <section className="panel">
            <header className="flex h-[32px] items-center gap-2 border-b border-edge bg-faint px-3">
              <h2 className="text-[11.5px] font-semibold text-ink">Order lines</h2>
              <span className="text-[11px] text-muted">
                {vendorId ? `${available.length} materials approved for this vendor` : "Choose a vendor first"}
              </span>
              <div className="flex-1" />
              <Button
                type="button"
                variant="secondary"
                onClick={addLine}
                disabled={!vendorId || lines.length >= available.length}
              >
                <IconPlus size={13} />
                Add line
              </Button>
            </header>

            {lines.length === 0 ? (
              <p className="px-3 py-10 text-center text-[12.5px] text-muted">
                {vendorId
                  ? "No lines yet. Add the first one — rates default to the current approved price."
                  : "Choose a vendor to start building the order."}
              </p>
            ) : (
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full min-w-[820px]">
                  <thead>
                    <tr className="border-b border-edge bg-faint">
                      <th className="w-[36px] px-2.5 py-1.5 text-left text-[10.5px] font-semibold text-muted">#</th>
                      <th className="px-2.5 py-1.5 text-left text-[10.5px] font-semibold text-muted">Material</th>
                      <th className="w-[130px] px-2.5 py-1.5 text-right text-[10.5px] font-semibold text-muted">Quantity kg</th>
                      <th className="w-[120px] px-2.5 py-1.5 text-right text-[10.5px] font-semibold text-muted">Rate ₹/kg</th>
                      <th className="w-[84px] px-2.5 py-1.5 text-right text-[10.5px] font-semibold text-muted">Tax %</th>
                      <th className="w-[130px] px-2.5 py-1.5 text-right text-[10.5px] font-semibold text-muted">Line total</th>
                      <th className="w-[40px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const mat = available.find((m) => m.id === l.materialId);
                      const offRate = mat && Math.abs(l.ratePerKg - mat.rate) > 0.005;
                      return (
                        <tr key={l.key} className="border-b border-edge/60 last:border-b-0">
                          <td className="px-2.5 py-1.5 font-num text-[12px] text-muted">{i + 1}</td>
                          <td className="px-2.5 py-1.5">
                            <Select
                              value={l.materialId}
                              onChange={(e) => {
                                const m = available.find((x) => x.id === e.target.value)!;
                                patch(l.key, { materialId: m.id, ratePerKg: m.rate });
                              }}
                            >
                              {available
                                .filter((m) => m.id === l.materialId || !lines.some((x) => x.materialId === m.id))
                                .map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name}{m.grade ? ` · ${m.grade}` : ""}
                                  </option>
                                ))}
                            </Select>
                          </td>
                          <td className="px-2.5 py-1.5">
                            <Input
                              type="number" min={0.001} step={1} value={l.quantityKg}
                              onChange={(e) => patch(l.key, { quantityKg: Number(e.target.value) || 0 })}
                              className="text-right"
                            />
                          </td>
                          <td className="px-2.5 py-1.5">
                            <Input
                              type="number" min={0} step={0.01} value={l.ratePerKg}
                              onChange={(e) => patch(l.key, { ratePerKg: Number(e.target.value) || 0 })}
                              className={`text-right ${offRate ? "border-warning" : ""}`}
                              title={offRate && mat ? `Approved rate is ${ratePerKg(mat.rate)}` : undefined}
                            />
                          </td>
                          <td className="px-2.5 py-1.5">
                            <Input
                              type="number" min={0} max={100} step={1} value={l.taxPct}
                              onChange={(e) => patch(l.key, { taxPct: Number(e.target.value) || 0 })}
                              className="text-right"
                            />
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-num text-[12px] font-medium tabular-nums text-ink">
                            {amount(l.quantityKg * l.ratePerKg)}
                          </td>
                          <td className="px-2.5 py-1.5">
                            <button
                              type="button"
                              onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                              aria-label="Remove line"
                              className="grid h-6 w-6 place-items-center rounded text-muted transition-colors duration-150 hover:bg-danger-bg hover:text-danger"
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
                  <div className="flex gap-2"><dt className="text-muted">Subtotal</dt><dd className="font-num tabular-nums text-ink">{money(totals.subtotal, 2)}</dd></div>
                  <div className="flex gap-2"><dt className="text-muted">GST</dt><dd className="font-num tabular-nums text-ink">{money(totals.tax, 2)}</dd></div>
                  <div className="flex gap-2"><dt className="text-muted">Freight</dt><dd className="font-num tabular-nums text-ink">{money(freight, 2)}</dd></div>
                  <div className="flex gap-2 border-l border-edge pl-6">
                    <dt className="font-medium text-ink">Total</dt>
                    <dd className="font-num text-[13px] font-semibold tabular-nums text-ink">{money(totals.total, 2)}</dd>
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
