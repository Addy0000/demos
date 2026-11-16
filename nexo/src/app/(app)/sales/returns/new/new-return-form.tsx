"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { createSalesReturn, type ActionState } from "../../sales-actions";
import { SubmitButton, Button, Input, Select, Textarea, Field, FormGrid, FormError } from "@/components/ui/form";
import { kgPlain } from "@/lib/format";
import { IconPlus, IconClose } from "@/components/icons";

export type OrderOption = {
  id: string;
  code: string;
  customerName: string;
  lines: {
    id: string;
    lineNo: number;
    projectId: string;
    projectName: string;
    projectCode: string;
    dispatchedKg: number;
  }[];
};

type Line = {
  key: number;
  salesOrderLineId: string;
  projectId: string;
  quantityKg: number;
};

export function NewReturnForm({
  initialOrderId,
  orders,
}: {
  initialOrderId: string;
  orders: OrderOption[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(createSalesReturn, {});
  const [selectedOrderId, setSelectedOrderId] = useState<string>(
    orders.find((o) => o.id === initialOrderId)?.id ?? orders[0]?.id ?? "",
  );

  const selectedOrder = useMemo(() => {
    return orders.find((o) => o.id === selectedOrderId) ?? null;
  }, [orders, selectedOrderId]);

  const [lines, setLines] = useState<Line[]>(() => {
    if (selectedOrder && selectedOrder.lines.length > 0) {
      return selectedOrder.lines.map((l, i) => ({
        key: i + 1,
        salesOrderLineId: l.id,
        projectId: l.projectId,
        quantityKg: Math.min(100, l.dispatchedKg || 100),
      }));
    }
    return [];
  });

  // When selected order changes, reset lines to match that order
  function handleOrderChange(id: string) {
    setSelectedOrderId(id);
    const ord = orders.find((o) => o.id === id);
    if (ord && ord.lines.length > 0) {
      setLines(
        ord.lines.map((l, i) => ({
          key: i + 1,
          salesOrderLineId: l.id,
          projectId: l.projectId,
          quantityKg: Math.min(100, l.dispatchedKg || 100),
        })),
      );
    } else {
      setLines([]);
    }
  }

  function patch(key: number, next: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...next } : l)));
  }

  const payload = JSON.stringify(
    lines.map(({ salesOrderLineId, projectId, quantityKg }) => ({
      salesOrderLineId,
      projectId,
      quantityKg: Number(quantityKg) || 0,
    })),
  );

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="lines" value={payload} />

      <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-edge bg-faint px-3">
        <h1 className="flex-1 text-[14px] font-semibold tracking-tight text-ink">Create sales return</h1>
        <Link
          href="/sales/returns"
          className="inline-flex h-[26px] items-center rounded px-2.5 text-[12px] text-muted transition-colors duration-150 hover:bg-pastel hover:text-primary"
        >
          Cancel
        </Link>
        <SubmitButton pendingLabel="Creating…">Log Sales Return</SubmitButton>
      </div>

      <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-canvas p-3">
        <div className="mx-auto max-w-4xl space-y-3">
          <FormError message={state.error} />

          <section className="panel">
            <header className="flex h-[32px] items-center border-b border-edge bg-faint px-3">
              <h2 className="text-[11.5px] font-semibold text-ink">Return details</h2>
            </header>
            <div className="p-3">
              <FormGrid columns={2}>
                <Field label="Dispatched Sales Order" required hint="Select order against which material is being returned.">
                  <Select
                    name="salesOrderId"
                    value={selectedOrderId}
                    onChange={(e) => handleOrderChange(e.target.value)}
                    required
                  >
                    <option value="">Select sales order...</option>
                    {orders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.code} — {o.customerName}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Customer Delivery Challan No." hint="Customer's return DC or debit note reference.">
                  <Input name="customerDcNo" placeholder="e.g. RET-DC-992" />
                </Field>
                <Field label="Customer's stated reason" span hint="Why the customer states the material was returned.">
                  <Input name="reason" placeholder="e.g. Off-spec hardness, surface blemishes, customer trial fail" />
                </Field>
                <Field label="Internal notes / remark" span hint="Receiving notes or gate check remarks.">
                  <Textarea name="remark" rows={2} placeholder="Gate entry / unloading notes…" />
                </Field>
              </FormGrid>
            </div>
          </section>

          <section className="panel">
            <header className="flex h-[32px] items-center gap-2 border-b border-edge bg-faint px-3">
              <h2 className="text-[11.5px] font-semibold text-ink">Returned line items</h2>
              <span className="text-[11px] text-muted">
                {lines.length} {lines.length === 1 ? "line" : "lines"}
              </span>
            </header>

            {lines.length === 0 ? (
              <p className="px-3 py-8 text-center text-[12.5px] text-muted">
                Select a dispatched sales order above to populate return line items.
              </p>
            ) : (
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="border-b border-edge bg-faint">
                      <th className="w-[36px] px-2.5 py-1.5 text-left text-[10.5px] font-semibold text-muted">#</th>
                      <th className="px-2.5 py-1.5 text-left text-[10.5px] font-semibold text-muted">Compound / Project</th>
                      <th className="w-[120px] px-2.5 py-1.5 text-right text-[10.5px] font-semibold text-muted">Despatched (kg)</th>
                      <th className="w-[150px] px-2.5 py-1.5 text-right text-[10.5px] font-semibold text-muted">Returned (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const ordLine = selectedOrder?.lines.find((x) => x.id === l.salesOrderLineId);

                      return (
                        <tr key={l.key} className="border-b border-edge/60 last:border-b-0">
                          <td className="px-2.5 py-1.5 font-num text-[12px] text-muted">{i + 1}</td>
                          <td className="px-2.5 py-1.5 text-[12px] text-ink font-medium">
                            {ordLine?.projectName ?? "—"}
                            <span className="block text-[11px] font-normal text-muted">{ordLine?.projectCode}</span>
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-num text-[12px] tabular-nums text-muted">
                            {ordLine ? kgPlain(ordLine.dispatchedKg) : "—"}
                          </td>
                          <td className="px-2.5 py-1.5">
                            <Input
                              type="number"
                              min={0.001}
                              step={0.001}
                              value={l.quantityKg}
                              onChange={(e) => patch(l.key, { quantityKg: Number(e.target.value) || 0 })}
                              className="text-right font-num"
                              required
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </form>
  );
}
