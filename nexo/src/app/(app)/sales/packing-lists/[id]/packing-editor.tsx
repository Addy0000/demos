"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { savePackingPackages, finalizePackingList } from "../../sales-actions";
import { safeAction } from "@/lib/safe-action";
import { Button, Input, Select } from "@/components/ui/form";
import { IconCheck, IconAlert, IconClose } from "@/components/icons";
import { kgPlain } from "@/lib/format";

export type ChallanLineOption = {
  id: string;
  lineNo: number;
  quantityKg: number;
  itemName: string;
  itemCode: string;
  batchNo: string | null;
  lotRef: string | null;
};

export type PackageDraftLine = {
  challanLineId: string;
  quantityKg: number | string;
};

export type PackageDraft = {
  packageNo: number;
  packageType: string;
  grossKg: number | string;
  tareKg: number | string;
  lines: PackageDraftLine[];
};

const PACKAGE_TYPES = ["carton", "bag", "pallet", "drum", "box", "crate"];

export function PackingEditor({
  packingListId,
  canWrite,
  challanLines,
  initialPackages,
}: {
  packingListId: string;
  canWrite: boolean;
  challanLines: ChallanLineOption[];
  initialPackages: PackageDraft[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  // Initialize packages
  const [packages, setPackages] = useState<PackageDraft[]>(() => {
    if (initialPackages.length > 0) {
      return initialPackages;
    }
    // Start with 1 package by default if empty
    return [
      {
        packageNo: 1,
        packageType: "carton",
        grossKg: "",
        tareKg: 0,
        lines: challanLines.length > 0 ? [{ challanLineId: challanLines[0]!.id, quantityKg: "" }] : [],
      },
    ];
  });

  // Calculate packed quantity per challan line across all packages
  const linePackedTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const pkg of packages) {
      for (const line of pkg.lines) {
        if (!line.challanLineId) continue;
        const qty = parseFloat(String(line.quantityKg)) || 0;
        map.set(line.challanLineId, (map.get(line.challanLineId) || 0) + qty);
      }
    }
    return map;
  }, [packages]);

  // Overall check if all challan lines are fully packed
  const allLinesPacked = useMemo(() => {
    if (challanLines.length === 0) return false;
    for (const cl of challanLines) {
      const packed = linePackedTotals.get(cl.id) || 0;
      if (Math.abs(packed - cl.quantityKg) > 0.001) return false;
    }
    return true;
  }, [challanLines, linePackedTotals]);

  // Add package
  function addPackage() {
    const nextNo = packages.length > 0 ? Math.max(...packages.map((p) => p.packageNo)) + 1 : 1;
    setPackages((prev) => [
      ...prev,
      {
        packageNo: nextNo,
        packageType: "carton",
        grossKg: "",
        tareKg: 0,
        lines: challanLines.length > 0 ? [{ challanLineId: challanLines[0]!.id, quantityKg: "" }] : [],
      },
    ]);
  }

  // Remove package
  function removePackage(index: number) {
    setPackages((prev) => prev.filter((_, i) => i !== index));
  }

  // Update package field
  function updatePackage(index: number, field: keyof PackageDraft, value: any) {
    setPackages((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index]!, [field]: value };
      return copy;
    });
  }

  // Add line to package
  function addLineToPackage(pkgIndex: number) {
    setPackages((prev) => {
      const copy = [...prev];
      const pkg = copy[pkgIndex]!;
      const defaultLineId = challanLines[0]?.id || "";
      copy[pkgIndex] = {
        ...pkg,
        lines: [...pkg.lines, { challanLineId: defaultLineId, quantityKg: "" }],
      };
      return copy;
    });
  }

  // Remove line from package
  function removeLineFromPackage(pkgIndex: number, lineIndex: number) {
    setPackages((prev) => {
      const copy = [...prev];
      const pkg = copy[pkgIndex]!;
      copy[pkgIndex] = {
        ...pkg,
        lines: pkg.lines.filter((_, i) => i !== lineIndex),
      };
      return copy;
    });
  }

  // Update line in package
  function updatePackageLine(pkgIndex: number, lineIndex: number, field: keyof PackageDraftLine, value: any) {
    setPackages((prev) => {
      const copy = [...prev];
      const pkg = copy[pkgIndex]!;
      const lines = [...pkg.lines];
      lines[lineIndex] = { ...lines[lineIndex]!, [field]: value };
      copy[pkgIndex] = { ...pkg, lines };
      return copy;
    });
  }

  // Prepare payload
  function buildPayload() {
    return packages.map((p) => ({
      packageNo: p.packageNo,
      packageType: p.packageType || null,
      grossKg: parseFloat(String(p.grossKg)) || 0,
      tareKg: parseFloat(String(p.tareKg)) || 0,
      lines: p.lines.map((l) => ({
        challanLineId: l.challanLineId,
        quantityKg: parseFloat(String(l.quantityKg)) || 0,
      })),
    }));
  }

  // Save packages
  async function handleSave() {
    setNotice(null);
    const payload = buildPayload();
    const res = await safeAction(() => savePackingPackages(packingListId, payload));
    if ("error" in res && res.error) {
      setNotice({ tone: "err", text: res.error });
      return;
    }
    setNotice({ tone: "ok", text: ("success" in res && res.success) || "Packing packages saved successfully." });
    router.refresh();
  }

  // Finalize packing list (save first, then finalize)
  async function handleFinalize() {
    setNotice(null);
    const payload = buildPayload();
    // 1. Save packages first
    const saveRes = await safeAction(() => savePackingPackages(packingListId, payload));
    if ("error" in saveRes && saveRes.error) {
      setNotice({ tone: "err", text: saveRes.error });
      return;
    }

    // 2. Finalize
    const finRes = await safeAction(() => finalizePackingList(packingListId));
    if ("error" in finRes && finRes.error) {
      setNotice({ tone: "err", text: finRes.error });
      return;
    }

    setNotice({ tone: "ok", text: ("success" in finRes && finRes.success) || "Packing list finalized." });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Notice Banner */}
      {notice && (
        <div
          className={`flex items-start gap-2 rounded border px-3 py-2.5 text-[12.5px] shadow-sm ${
            notice.tone === "ok" ? "border-success/35 bg-success-bg text-ink" : "border-danger/35 bg-danger-bg text-ink"
          }`}
        >
          {notice.tone === "ok" ? (
            <IconCheck size={16} className="mt-0.5 shrink-0 text-success" />
          ) : (
            <IconAlert size={16} className="mt-0.5 shrink-0 text-danger" />
          )}
          <span className="flex-1 font-medium">{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
            className="text-muted hover:text-ink"
          >
            <IconClose size={14} />
          </button>
        </div>
      )}

      {/* Live Challan Line Packing Status Monitor */}
      <div className="rounded border border-edge bg-surface overflow-hidden shadow-xs">
        <div className="flex items-center justify-between border-b border-edge bg-faint px-3.5 py-2">
          <span className="text-[12.5px] font-semibold text-ink">Packed vs Challan Quantities</span>
          <span
            className={`text-[11.5px] font-medium px-2 py-0.5 rounded-full border ${
              allLinesPacked
                ? "border-success/40 bg-success-bg text-success-text"
                : "border-warning/40 bg-warning-bg text-warning-text"
            }`}
          >
            {allLinesPacked ? "All lines fully packed" : "Packing in progress"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-edge/60 bg-surface/50 text-[11px] font-semibold text-muted">
                <th className="px-3.5 py-2">Line</th>
                <th className="px-3.5 py-2">Compound / Item</th>
                <th className="px-3.5 py-2">Batch</th>
                <th className="px-3.5 py-2 text-right">Challan (kg)</th>
                <th className="px-3.5 py-2 text-right">Packed (kg)</th>
                <th className="px-3.5 py-2 text-right">Remaining (kg)</th>
                <th className="px-3.5 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/40">
              {challanLines.map((cl) => {
                const packed = linePackedTotals.get(cl.id) || 0;
                const diff = cl.quantityKg - packed;
                const isExact = Math.abs(diff) <= 0.001;
                const isOver = diff < -0.001;

                return (
                  <tr key={cl.id} className="hover:bg-faint/50">
                    <td className="px-3.5 py-2 font-num text-muted">#{cl.lineNo}</td>
                    <td className="px-3.5 py-2 font-medium text-ink">
                      {cl.itemName}
                      <span className="ml-1 text-[11px] text-muted font-normal font-num">({cl.itemCode})</span>
                    </td>
                    <td className="px-3.5 py-2 font-num text-muted">{cl.batchNo ?? "—"}</td>
                    <td className="px-3.5 py-2 text-right font-num">{kgPlain(cl.quantityKg)}</td>
                    <td className="px-3.5 py-2 text-right font-num font-semibold text-ink">
                      {packed.toFixed(3)}
                    </td>
                    <td className="px-3.5 py-2 text-right font-num">
                      {isOver ? (
                        <span className="text-danger font-medium">+{Math.abs(diff).toFixed(3)}</span>
                      ) : diff > 0 ? (
                        <span className="text-warning-text font-medium">{diff.toFixed(3)}</span>
                      ) : (
                        <span className="text-muted">0.000</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2">
                      {isExact ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success-text">
                          <span className="h-2 w-2 rounded-full bg-success" /> Fully packed
                        </span>
                      ) : isOver ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-danger-text">
                          <span className="h-2 w-2 rounded-full bg-danger" /> Over-packed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-warning-text">
                          <span className="h-2 w-2 rounded-full bg-warning" /> Shortfall ({diff.toFixed(3)} kg)
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

      {/* Packages Editor Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-ink">
            Packages ({packages.length})
          </h2>
          {canWrite && (
            <Button variant="outline" onClick={addPackage} disabled={pending}>
              + Add package
            </Button>
          )}
        </div>

        {packages.length === 0 ? (
          <div className="rounded border border-dashed border-edge p-8 text-center text-muted">
            <p className="text-sm">No packages created yet.</p>
            <Button variant="primary" onClick={addPackage} className="mt-3">
              Add first package
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {packages.map((pkg, pkgIdx) => {
              const gross = parseFloat(String(pkg.grossKg)) || 0;
              const tare = parseFloat(String(pkg.tareKg)) || 0;
              const pkgLineSum = pkg.lines.reduce(
                (sum, l) => sum + (parseFloat(String(l.quantityKg)) || 0),
                0,
              );

              return (
                <div
                  key={pkgIdx}
                  className="rounded border border-edge bg-surface shadow-xs overflow-hidden"
                >
                  {/* Package Header Row */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge bg-faint/80 px-3.5 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1.5 font-semibold text-ink text-[13px]">
                        <span className="font-num text-primary">#{pkg.packageNo}</span>
                      </span>
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-muted">Type:</span>
                        <input
                          type="text"
                          list="package-type-suggestions"
                          value={pkg.packageType}
                          onChange={(e) => updatePackage(pkgIdx, "packageType", e.target.value)}
                          className="w-24 rounded border border-edge bg-surface px-2 py-0.5 text-xs text-ink focus:border-primary focus:outline-none"
                          placeholder="e.g. carton"
                        />
                        <datalist id="package-type-suggestions">
                          {PACKAGE_TYPES.map((t) => (
                            <option key={t} value={t} />
                          ))}
                        </datalist>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="text-muted">Tare:</span>
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={pkg.tareKg}
                          onChange={(e) => updatePackage(pkgIdx, "tareKg", e.target.value)}
                          className="w-20 rounded border border-edge bg-surface px-2 py-0.5 text-right font-num text-xs text-ink focus:border-primary focus:outline-none"
                        />
                        <span className="text-muted">kg</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-muted">Gross:</span>
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={pkg.grossKg}
                          onChange={(e) => updatePackage(pkgIdx, "grossKg", e.target.value)}
                          className="w-24 rounded border border-edge bg-surface px-2 py-0.5 text-right font-num font-semibold text-ink focus:border-primary focus:outline-none"
                          placeholder="0.000"
                        />
                        <span className="text-muted">kg</span>
                      </div>

                      <div className="text-muted pl-2 border-l border-edge/60">
                        Net: <span className="font-num font-semibold text-ink">{pkgLineSum.toFixed(3)} kg</span>
                      </div>

                      {canWrite && packages.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePackage(pkgIdx)}
                          className="ml-2 text-danger hover:text-danger-text p-1 text-xs"
                          title="Remove package"
                        >
                          <IconClose size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Package Contents / Lines */}
                  <div className="p-3.5 space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Package Contents
                    </div>

                    {pkg.lines.map((l, lIdx) => {
                      // Calculate remaining unpacked kg for this challan line (ignoring this line's current entry)
                      const currentPackedWithoutThis =
                        (linePackedTotals.get(l.challanLineId) || 0) - (parseFloat(String(l.quantityKg)) || 0);
                      const targetLine = challanLines.find((cl) => cl.id === l.challanLineId);
                      const remainingAvailable = targetLine
                        ? Math.max(0, targetLine.quantityKg - currentPackedWithoutThis)
                        : 0;

                      return (
                        <div key={lIdx} className="flex items-center gap-2">
                          {/* Dropdown to pick challan line */}
                          <div className="flex-1">
                            <select
                              value={l.challanLineId}
                              onChange={(e) => updatePackageLine(pkgIdx, lIdx, "challanLineId", e.target.value)}
                              className="w-full rounded border border-edge bg-surface px-2.5 py-1 text-xs text-ink focus:border-primary focus:outline-none"
                            >
                              {challanLines.map((cl) => {
                                const packedSoFar =
                                  (linePackedTotals.get(cl.id) || 0) -
                                  (cl.id === l.challanLineId ? parseFloat(String(l.quantityKg)) || 0 : 0);
                                const rem = Math.max(0, cl.quantityKg - packedSoFar);
                                return (
                                  <option key={cl.id} value={cl.id}>
                                    Line #{cl.lineNo}: {cl.itemName} ({cl.batchNo ?? "no batch"}) — {rem.toFixed(3)} kg remaining (total {kgPlain(cl.quantityKg)})
                                  </option>
                                );
                              })}
                            </select>
                          </div>

                          {/* Quantity input */}
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              placeholder="kg"
                              value={l.quantityKg}
                              onChange={(e) => updatePackageLine(pkgIdx, lIdx, "quantityKg", e.target.value)}
                              className="w-24 rounded border border-edge bg-surface px-2.5 py-1 text-right font-num text-xs text-ink focus:border-primary focus:outline-none"
                            />
                            <span className="text-xs text-muted">kg</span>
                          </div>

                          {/* Quick autofill remaining button */}
                          {remainingAvailable > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                updatePackageLine(pkgIdx, lIdx, "quantityKg", remainingAvailable.toFixed(3))
                              }
                              className="rounded border border-edge px-1.5 py-1 text-[10px] text-muted hover:text-ink hover:bg-faint"
                              title="Fill remaining unpacked kg"
                            >
                              Max ({remainingAvailable.toFixed(3)})
                            </button>
                          )}

                          {/* Remove line */}
                          {canWrite && pkg.lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLineFromPackage(pkgIdx, lIdx)}
                              className="p-1 text-muted hover:text-danger"
                              title="Remove item line"
                            >
                              <IconClose size={12} />
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {canWrite && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => addLineToPackage(pkgIdx)}
                          className="text-[11.5px] font-medium text-primary hover:underline"
                        >
                          + Add item to this package
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Controls */}
      {canWrite && (
        <div className="flex items-center justify-between border-t border-edge pt-4">
          <div className="text-xs text-muted">
            {allLinesPacked ? (
              <span className="text-success-text font-medium">
                ✓ Ready to finalize: All challan lines are fully accounted for.
              </span>
            ) : (
              <span>Finalizing requires all challan lines to be fully packed.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => startTransition(handleSave)}
            >
              {pending ? "Saving…" : "Save packages"}
            </Button>
            <Button
              variant="primary"
              disabled={pending || !allLinesPacked}
              onClick={() => startTransition(handleFinalize)}
            >
              {pending ? "Finalizing…" : "Finalize packing list"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
