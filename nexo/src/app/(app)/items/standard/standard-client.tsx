"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Chip } from "@/components/ui/chip";
import { Button, Input, Select, Field, FormError } from "@/components/ui/form";
import {
  createStandardBom,
  submitStandardBomForApproval,
  approveStandardBom,
  rejectStandardBom,
} from "../actions";
import { AddComponentModal, type ComponentItemOption } from "@/components/items/add-component-modal";
import { formatUomDisplay } from "@/lib/uom";

type BomLine = {
  materialId: string;
  materialName: string;
  materialCode: string;
  materialUom?: string;
  quantityKg: number;
};

type StandardBom = {
  id: string;
  code: string;
  status: string;
  materialId: string;
  materialName: string;
  materialCode: string;
  requestedByName: string;
  approvedByName: string | null;
  approvedAt: string | null;
  createdAt: string;
  lines: BomLine[];
};

type ItemOption = {
  id: string;
  name: string;
  code: string;
};

type ComponentLineState = {
  materialId: string;
  materialCode: string;
  materialName: string;
  category?: string;
  uom?: string;
  quantityKg: string;
};

export function StandardClient({
  standardBoms,
  targetProducts,
  componentMaterials,
}: {
  standardBoms: StandardBom[];
  targetProducts: ItemOption[];
  componentMaterials: ComponentItemOption[];
}) {
  const [selectedBomId, setSelectedBomId] = useState<string | null>(
    standardBoms[0]?.id ?? null
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newBomCode, setNewBomCode] = useState("");
  const [newBomMaterialId, setNewBomMaterialId] = useState(targetProducts[0]?.id ?? "");
  const [availableComponents, setAvailableComponents] = useState<ComponentItemOption[]>(componentMaterials);
  const [isAddComponentOpen, setIsAddComponentOpen] = useState(false);
  const [newLines, setNewLines] = useState<ComponentLineState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedBom = standardBoms.find((b) => b.id === selectedBomId);

  // Status color mappings to nexo tokens
  const bomStatusTone = (status: string) => {
    switch (status) {
      case "APPROVED":
        return "success";
      case "PENDING_APPROVAL":
        return "warning";
      case "REJECTED":
        return "danger";
      case "DRAFT":
      default:
        return "neutral";
    }
  };

  // Remove line from form
  const removeLine = (idx: number) => {
    setNewLines(newLines.filter((_, i) => i !== idx));
  };

  // Submit standard BOM
  const handleCreate = () => {
    setError(null);
    if (!newBomCode.trim()) {
      setError("Please specify a Standard BOM Code.");
      return;
    }
    if (!newBomMaterialId) {
      setError("Please select a target finished good or compound.");
      return;
    }
    if (newLines.length === 0) {
      setError("Please add at least one component line.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await createStandardBom({
          code: newBomCode.trim(),
          materialId: newBomMaterialId,
          lines: newLines.map((l) => ({
            materialId: l.materialId,
            quantityKg: parseFloat(l.quantityKg) || 0,
          })),
        });
        setSelectedBomId(result.id);
        setIsCreateOpen(false);
        setNewBomCode("");
        setNewLines([]);
      } catch (err: any) {
        setError(err.message ?? "Failed to create Standard BOM");
      }
    });
  };

  const handleAction = (action: (id: string) => Promise<any>, id: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await action(id);
      } catch (err: any) {
        setError(err.message ?? "Action failed");
      }
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top Header bar */}
      <div className="flex h-[42px] shrink-0 items-center gap-3 border-b border-edge bg-faint px-3">
        <h1 className="shrink-0 text-[14px] font-semibold tracking-tight text-ink">Standard Bill of Materials (BOM)</h1>
        <span className="shrink-0 rounded-sm bg-pastel px-1.5 py-px font-num text-[11px] font-medium text-primary">
          {standardBoms.length}
        </span>
        <span className="text-[11.5px] text-muted">
          Define and authorize standard manufacturing bill of materials
        </span>
        <div className="ml-auto">
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="text-[11px] h-[24px] px-2.5"
          >
            New Standard BOM
          </Button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex h-[34px] shrink-0 items-center gap-6 border-b border-edge bg-surface px-4 text-xs font-semibold">
        <Link
          href="/items"
          className="text-muted hover:text-ink py-2 cursor-pointer transition-colors"
        >
          Item Master
        </Link>
        <Link
          href="/items/standard"
          className="border-b-2 border-primary text-primary py-2 cursor-pointer"
        >
          Standard BOMs
        </Link>
        <Link
          href="/items/order"
          className="text-muted hover:text-ink py-2 cursor-pointer transition-colors"
        >
          Order BOMs
        </Link>
      </div>

      {error && (
        <div className="border-b border-danger bg-danger-bg px-3 py-1.5 text-[11.5px] text-danger-text">
          {error}
        </div>
      )}

      {/* Split dashboard workspace */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row bg-canvas">
        {/* Left Side: Table List of Standard BOMs */}
        <div className="flex flex-1 flex-col min-h-0 border-r border-edge">
          <header className="flex h-[32px] shrink-0 items-center border-b border-edge bg-faint px-3">
            <h2 className="text-[11.5px] font-semibold text-ink">Master BOMs</h2>
          </header>
          <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-surface">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="grid-head">
                  <th className="px-3 py-2 text-left font-semibold">BOM Code</th>
                  <th className="px-3 py-2 text-left font-semibold">Target Product / Item</th>
                  <th className="px-3 py-2 text-left font-semibold">Requester</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-left font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {standardBoms.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[12.5px] text-muted">
                      No Standard BOMs registered. Create a new Standard BOM to start.
                    </td>
                  </tr>
                ) : (
                  standardBoms.map((bom) => (
                    <tr
                      key={bom.id}
                      onClick={() => setSelectedBomId(bom.id)}
                      className={`grid-row hover:bg-pastel transition-colors duration-150 cursor-pointer ${
                        selectedBomId === bom.id ? "bg-pastel/60" : ""
                      }`}
                    >
                      <td className="grid-cell font-num font-semibold text-primary-hover">
                        {bom.code}
                      </td>
                      <td className="grid-cell">
                        <span className="font-semibold text-slate-800">{bom.materialName}</span>
                        <span className="font-num text-[10.5px] text-muted ml-2">({bom.materialCode})</span>
                      </td>
                      <td className="grid-cell text-muted">
                        {bom.requestedByName}
                      </td>
                      <td className="grid-cell">
                        <Chip tone={bomStatusTone(bom.status)}>{bom.status}</Chip>
                      </td>
                      <td className="grid-cell font-num text-muted">
                        {new Date(bom.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Details View */}
        <div className="w-full lg:w-[460px] shrink-0 flex flex-col border-t lg:border-t-0 border-edge bg-surface">
          <header className="flex h-[32px] shrink-0 items-center justify-between border-b border-edge bg-faint px-3">
            <h2 className="text-[11.5px] font-semibold text-ink">BOM Specification Workspace</h2>
            {selectedBom && (
              <span className="font-num text-[11px] text-primary-hover font-bold">{selectedBom.code}</span>
            )}
          </header>

          {selectedBom ? (
            <div className="flex-1 overflow-auto p-4 scroll-thin space-y-4 flex flex-col">
              {/* Material metadata card */}
              <div className="border border-edge rounded-sm p-3 bg-faint/50 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-[13px] font-bold text-ink">{selectedBom.materialName}</h3>
                    <p className="text-[11px] text-muted font-num mt-0.5">{selectedBom.materialCode}</p>
                  </div>
                  <Chip tone={bomStatusTone(selectedBom.status)}>{selectedBom.status}</Chip>
                </div>
                
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2 border-t border-edge/50 text-[11.5px] text-muted">
                  <div>
                    <span>Created By:</span>
                    <p className="font-medium text-ink mt-0.5">{selectedBom.requestedByName}</p>
                  </div>
                  <div>
                    <span>Approved By:</span>
                    <p className="font-medium text-ink mt-0.5">{selectedBom.approvedByName ?? "—"}</p>
                  </div>
                  {selectedBom.approvedAt && (
                    <div className="col-span-2">
                      <span>Authorized Date:</span>
                      <p className="font-num font-semibold text-ink mt-0.5">
                        {new Date(selectedBom.approvedAt).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Formulation Lines Table */}
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">
                  Bill of Materials Components
                </h3>
                <div className="overflow-hidden border border-edge rounded-sm">
                  <table className="w-full text-left text-[11px] text-slate-700">
                    <thead className="bg-faint text-ink border-b border-edge">
                      <tr>
                        <th className="px-2.5 py-1.5 font-semibold">Component Code</th>
                        <th className="px-2.5 py-1.5 font-semibold">Material</th>
                        <th className="px-2.5 py-1.5 text-right font-semibold">Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-edge bg-surface">
                      {selectedBom.lines.map((line, idx) => (
                        <tr key={idx} className="hover:bg-pastel/20">
                          <td className="px-2.5 py-1.5 font-num">{line.materialCode}</td>
                          <td className="px-2.5 py-1.5 font-medium">{line.materialName}</td>
                          <td className="px-2.5 py-1.5 text-right font-num font-semibold">
                            {line.quantityKg.toLocaleString()} {formatUomDisplay(line.materialUom)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action Buttons Panel */}
              <div className="pt-2">
                {selectedBom.status === "DRAFT" && (
                  <Button
                    disabled={isPending}
                    onClick={() => handleAction(submitStandardBomForApproval, selectedBom.id)}
                    className="w-full"
                  >
                    Submit for Approval
                  </Button>
                )}

                {selectedBom.status === "PENDING_APPROVAL" && (
                  <div className="flex gap-2">
                    <Button
                      disabled={isPending}
                      onClick={() => handleAction(approveStandardBom, selectedBom.id)}
                      className="flex-1"
                    >
                      Authorize (Approve)
                    </Button>
                    <button
                      disabled={isPending}
                      onClick={() => handleAction(rejectStandardBom, selectedBom.id)}
                      className="flex-1 rounded border border-danger text-danger text-[11.5px] font-semibold py-1.5 hover:bg-danger-bg transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Select a Standard BOM to view specification details.
            </div>
          )}
        </div>
      </div>

      {/* New Standard BOM Modal overlay */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-sm">
          <div className="h-full w-full max-w-md bg-surface p-6 shadow-xl flex flex-col border-l border-edge">
            <div className="flex items-center justify-between border-b border-edge pb-3">
              <div>
                <h2 className="text-sm font-bold text-ink">Create Standard BOM</h2>
                <p className="text-[11px] text-muted mt-0.5">Define master production recipe for finished products</p>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4 text-xs text-slate-700 scroll-thin">
              <FormError message={null} />

              <Field label="Standard BOM Code" required>
                <Input
                  type="text"
                  placeholder="e.g. BOM-STD-RESIN-01"
                  value={newBomCode}
                  onChange={(e) => setNewBomCode(e.target.value)}
                  required
                />
              </Field>

              <Field label="Target Product / Item" required>
                <Select
                  value={newBomMaterialId}
                  onChange={(e) => setNewBomMaterialId(e.target.value)}
                  required
                >
                  {targetProducts.length === 0 ? (
                    <option value="">No Finished Goods available (Create in Item Master)</option>
                  ) : (
                    targetProducts.map((tp) => (
                      <option key={tp.id} value={tp.id}>
                        {tp.name} ({tp.code})
                      </option>
                    ))
                  )}
                </Select>
              </Field>

              <div className="border-t border-edge pt-4 mt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
                      BOM Component Line Items
                    </label>
                    <span className="text-[10.5px] text-muted font-num">
                      {newLines.length} {newLines.length === 1 ? "item added" : "items added"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddComponentOpen(true)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-hover bg-pastel/80 hover:bg-pastel px-3 py-1.5 rounded border border-primary/30 transition-all cursor-pointer shadow-2xs active:scale-[0.98]"
                  >
                    <span className="text-sm font-bold leading-none">+</span>
                    <span>Add Component</span>
                  </button>
                </div>

                {newLines.length === 0 ? (
                  <div className="border border-dashed border-edge rounded-md p-6 text-center text-xs text-muted bg-faint/30">
                    <p className="font-medium text-slate-600">No component items added to this recipe yet.</p>
                    <p className="text-[11px] text-muted mt-1">Select raw materials from catalog or create new ones inline.</p>
                    <button
                      type="button"
                      onClick={() => setIsAddComponentOpen(true)}
                      className="mt-3 inline-flex items-center gap-1 text-primary font-bold hover:underline cursor-pointer text-xs"
                    >
                      + Click here to Add Component
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-64 overflow-y-auto scroll-thin pr-0.5">
                    {newLines.map((line, idx) => (
                      <div
                        key={idx}
                        className="group flex items-center justify-between gap-3 rounded-md border border-edge bg-surface p-2.5 shadow-2xs hover:border-slate-300 hover:shadow-xs transition-all"
                      >
                        {/* Material Info */}
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-900 text-xs truncate leading-tight">
                            {line.materialName}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[10.5px]">
                            <span className="font-num font-semibold text-primary whitespace-nowrap bg-pastel/50 px-1.5 py-0.5 rounded text-[10.5px]">
                              {line.materialCode}
                            </span>
                            {line.category && (
                              <span className="font-medium text-slate-500 bg-faint border border-edge px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide whitespace-nowrap">
                                {line.category.replace(/_/g, " ")}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Quantity input & Delete */}
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center rounded border border-edge bg-surface focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 overflow-hidden shadow-2xs transition-all">
                            <input
                              type="number"
                              step="any"
                              min="0.001"
                              value={line.quantityKg}
                              onChange={(e) => {
                                const updated = [...newLines];
                                updated[idx].quantityKg = e.target.value;
                                setNewLines(updated);
                              }}
                              className="w-20 px-2 py-1 text-right text-xs font-num font-bold text-slate-900 focus:outline-none bg-transparent"
                            />
                            <span className="bg-faint px-2 py-1 text-[11px] font-medium text-slate-500 border-l border-edge select-none">
                              {formatUomDisplay(line.uom)}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:text-danger hover:bg-danger-bg transition-colors cursor-pointer"
                            title="Remove component"
                          >
                            <span className="text-base font-bold leading-none">&times;</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-edge pt-4 flex gap-2">
              <Button
                disabled={isPending}
                onClick={handleCreate}
                className="flex-1"
              >
                Create BOM
              </Button>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="flex-1 rounded border border-edge text-[11.5px] font-semibold py-1.5 hover:bg-faint transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Two-Tab Add Component Modal */}
      <AddComponentModal
        isOpen={isAddComponentOpen}
        onClose={() => setIsAddComponentOpen(false)}
        availableItems={availableComponents}
        onItemCreated={(newItem) => {
          setAvailableComponents((prev) => [newItem, ...prev]);
        }}
        onAddComponent={(item, quantityKg) => {
          setNewLines((prev) => {
            const existingIdx = prev.findIndex((l) => l.materialId === item.id);
            if (existingIdx >= 0) {
              const updated = [...prev];
              updated[existingIdx].quantityKg = (
                parseFloat(updated[existingIdx].quantityKg || "0") + quantityKg
              ).toString();
              return updated;
            }
            return [
              ...prev,
              {
                materialId: item.id,
                materialCode: item.code,
                materialName: item.name,
                category: item.category,
                uom: item.uom,
                quantityKg: quantityKg.toString(),
              },
            ];
          });
        }}
      />
    </div>
  );
}
