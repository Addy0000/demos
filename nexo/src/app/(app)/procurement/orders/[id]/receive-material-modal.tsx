"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createGoodsReceipt } from "../../actions";
import { Button, Input, Field } from "@/components/ui/form";
import { IconGrn, IconClose, IconAlert, IconCheck } from "@/components/icons";
import { kgPlain } from "@/lib/format";

export type OrderLineItem = {
  id: string;
  lineNo: number;
  materialCode: string;
  materialName: string;
  grade: string | null;
  quantityKg: number;
  receivedKg: number;
};

export function ReceiveMaterialModal({
  poId,
  poCode,
  vendorName,
  lines: poLines,
}: {
  poId: string;
  poCode: string;
  vendorName: string;
  lines: OrderLineItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const [challanNo, setChallanNo] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [gateEntryNo, setGateEntryNo] = useState("");

  // Initialize line quantities with pending quantities
  const [lineQuantities, setLineQuantities] = useState<
    Record<string, { challanQtyKg: number; receivedQtyKg: number }>
  >(() => {
    const initial: Record<string, { challanQtyKg: number; receivedQtyKg: number }> = {};
    for (const l of poLines) {
      const pendingQty = Math.max(0, l.quantityKg - l.receivedKg);
      initial[l.id] = { challanQtyKg: pendingQty, receivedQtyKg: pendingQty };
    }
    return initial;
  });

  function updateQty(id: string, field: "challanQtyKg" | "receivedQtyKg", val: number) {
    setLineQuantities((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: val,
      },
    }));
  }

  const hasExcess = poLines.some((l) => {
    const q = lineQuantities[l.id];
    if (!q) return false;
    const pendingQty = l.quantityKg - l.receivedKg;
    return q.receivedQtyKg > pendingQty + 0.001;
  });

  const totalWeighed = Object.values(lineQuantities).reduce((sum, q) => sum + (q.receivedQtyKg || 0), 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!challanNo.trim()) {
      setNotice({ tone: "err", text: "Delivery challan number is required." });
      return;
    }
    if (!vehicleNo.trim()) {
      setNotice({ tone: "err", text: "Transport vehicle number is required." });
      return;
    }
    if (hasExcess) {
      setNotice({ tone: "err", text: "Received quantity cannot exceed the pending quantity." });
      return;
    }
    if (totalWeighed <= 0) {
      setNotice({ tone: "err", text: "Enter a weighed quantity greater than zero for at least one line." });
      return;
    }

    const payload = poLines.map((l) => ({
      purchaseOrderLineId: l.id,
      challanQtyKg: lineQuantities[l.id]?.challanQtyKg || 0,
      receivedQtyKg: lineQuantities[l.id]?.receivedQtyKg || 0,
    }));

    const fd = new FormData();
    fd.append("purchaseOrderId", poId);
    fd.append("challanNo", challanNo.trim());
    fd.append("vehicleNo", vehicleNo.trim());
    if (invoiceNo.trim()) fd.append("invoiceNo", invoiceNo.trim());
    if (gateEntryNo.trim()) fd.append("gateEntryNo", gateEntryNo.trim());
    fd.append("lines", JSON.stringify(payload));

    startTransition(async () => {
      try {
        const res = await createGoodsReceipt(fd);
        if (res.error) {
          setNotice({ tone: "err", text: res.error });
        } else {
          setNotice({ tone: "ok", text: res.success! });
          if (res.grnId) {
            router.push(`/procurement/grn/${res.grnId}`);
          }
        }
      } catch (err) {
        setNotice({
          tone: "err",
          text: err instanceof Error ? err.message : "Failed to record goods receipt.",
        });
      }
    });
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <IconGrn size={13} />
        Receive material
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="animate-pop flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-edge bg-surface shadow-pop">
            <header className="flex shrink-0 items-center justify-between border-b border-edge bg-faint px-4 py-3">
              <div>
                <h2 className="text-[13.5px] font-semibold text-ink">Record Material Receipt (GRN)</h2>
                <p className="text-[11.5px] text-muted">
                  Against <span className="font-num text-ink font-medium">{poCode}</span> · {vendorName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-muted transition-colors hover:bg-edge/40 hover:text-ink"
                aria-label="Close"
              >
                <IconClose size={14} />
              </button>
            </header>

            {notice && (
              <div
                className={`flex items-start gap-2 border-b px-4 py-2 text-[12px] ${
                  notice.tone === "ok" ? "border-success/30 bg-success-bg" : "border-danger/30 bg-danger-bg"
                }`}
              >
                {notice.tone === "ok" ? (
                  <IconCheck size={14} className="mt-px shrink-0 text-success" />
                ) : (
                  <IconAlert size={14} className="mt-px shrink-0 text-danger" />
                )}
                <span className="flex-1 text-ink">{notice.text}</span>
                <button
                  type="button"
                  onClick={() => setNotice(null)}
                  className="text-muted hover:text-ink"
                >
                  <IconClose size={11} />
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 space-y-4 overflow-y-auto p-4 scroll-thin">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field label="Challan number" required>
                    <Input
                      placeholder="e.g. CH-9021"
                      value={challanNo}
                      onChange={(e) => setChallanNo(e.target.value)}
                      required
                      autoFocus
                    />
                  </Field>
                  <Field label="Vehicle number" required>
                    <Input
                      placeholder="e.g. MH-12-AB-1234"
                      value={vehicleNo}
                      onChange={(e) => setVehicleNo(e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Invoice number">
                    <Input
                      placeholder="e.g. INV-2026-01"
                      value={invoiceNo}
                      onChange={(e) => setInvoiceNo(e.target.value)}
                    />
                  </Field>
                  <Field label="Gate entry number">
                    <Input
                      placeholder="e.g. GE-001"
                      value={gateEntryNo}
                      onChange={(e) => setGateEntryNo(e.target.value)}
                    />
                  </Field>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11.5px] font-medium text-ink">
                    Consignment items & weighed quantities
                  </label>
                  <div className="overflow-x-auto rounded border border-edge">
                    <table className="w-full text-left text-[12px]">
                      <thead className="border-b border-edge bg-faint text-[11px] font-semibold text-muted">
                        <tr>
                          <th className="px-2.5 py-1.5 w-8">#</th>
                          <th className="px-2.5 py-1.5">Material</th>
                          <th className="px-2.5 py-1.5 text-right">Ordered</th>
                          <th className="px-2.5 py-1.5 text-right">Received</th>
                          <th className="px-2.5 py-1.5 text-right">Pending</th>
                          <th className="px-2.5 py-1.5 text-right w-28">Challan kg</th>
                          <th className="px-2.5 py-1.5 text-right w-28">Weighed kg *</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-edge/60 font-num">
                        {poLines.map((l) => {
                          const pendingKg = Math.max(0, l.quantityKg - l.receivedKg);
                          const q = lineQuantities[l.id] || { challanQtyKg: 0, receivedQtyKg: 0 };
                          const isExcess = q.receivedQtyKg > pendingKg + 0.001;

                          return (
                            <tr key={l.id} className="hover:bg-faint/50">
                              <td className="px-2.5 py-2 text-muted">{l.lineNo}</td>
                              <td className="px-2.5 py-2">
                                <span className="block font-medium text-ink font-sans">{l.materialName}</span>
                                <span className="block text-[11px] text-muted">
                                  {l.materialCode} {l.grade ? `· ${l.grade}` : ""}
                                </span>
                              </td>
                              <td className="px-2.5 py-2 text-right text-muted">{kgPlain(l.quantityKg)}</td>
                              <td className="px-2.5 py-2 text-right text-muted">{kgPlain(l.receivedKg)}</td>
                              <td className="px-2.5 py-2 text-right font-medium text-ink">{kgPlain(pendingKg)}</td>
                              <td className="px-2 py-1.5">
                                <Input
                                  type="number"
                                  step="0.001"
                                  min="0"
                                  className="h-[28px] text-right font-num text-[12px]"
                                  value={q.challanQtyKg}
                                  onChange={(e) =>
                                    updateQty(l.id, "challanQtyKg", Number(e.target.value) || 0)
                                  }
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <Input
                                  type="number"
                                  step="0.001"
                                  min="0"
                                  className={`h-[28px] text-right font-num text-[12px] ${
                                    isExcess ? "border-danger text-danger bg-danger-bg/20" : ""
                                  }`}
                                  value={q.receivedQtyKg}
                                  onChange={(e) =>
                                    updateQty(l.id, "receivedQtyKg", Number(e.target.value) || 0)
                                  }
                                />
                                {isExcess && (
                                  <span className="block text-[10px] text-danger text-right">
                                    Exceeds pending
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <footer className="flex shrink-0 items-center justify-between border-t border-edge bg-faint px-4 py-2.5">
                <div className="text-[12px] text-muted">
                  Total weighed: <span className="font-num font-semibold text-ink">{kgPlain(totalWeighed)} kg</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" type="submit" disabled={pending || hasExcess || totalWeighed <= 0}>
                    {pending ? "Recording receipt…" : "Record receipt"}
                  </Button>
                </div>
              </footer>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
