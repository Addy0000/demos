"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Chip } from "@/components/ui/chip";
import { Button, Input, Select, Field, FormError } from "@/components/ui/form";
import {
  createOrderBom,
  submitBomAmendment,
  approveBomAmendment,
  rejectBomAmendment,
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

type Amendment = {
  id: string;
  code: string;
  status: string;
  requestedByName: string;
  approvedByName: string | null;
  approvedAt: string | null;
  createdAt: string;
  lines: BomLine[];
};

type OrderBom = {
  id: string;
  code: string;
  status: string;
  source: string;
  standardBomCode: string | null;
  standardBomMaterialName: string | null;
  createdAt: string;
  lines: BomLine[];
  amendments: Amendment[];
};

type ApprovedStandardBom = {
  id: string;
  code: string;
  materialName: string;
};

type AmdLineState = {
  materialId: string;
  materialCode?: string;
  materialName?: string;
  category?: string;
  uom?: string;
  quantityKg: string;
};

export function OrderClient({
  orderBoms,
  approvedStandardBoms,
  rawMaterials,
}: {
  orderBoms: OrderBom[];
  approvedStandardBoms: ApprovedStandardBom[];
  rawMaterials: ComponentItemOption[];
}) {
  const [selectedBomId, setSelectedBomId] = useState<string | null>(
    orderBoms[0]?.id ?? null
  );

  // Modal Open States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAmendmentOpen, setIsAmendmentOpen] = useState(false);
  const [isAddComponentOpen, setIsAddComponentOpen] = useState(false);
  const [availableMaterials, setAvailableMaterials] = useState<ComponentItemOption[]>(rawMaterials);
  const [activeTab, setActiveTab] = useState<"recipe" | "amendments">("recipe");

  // Create Order BOM form state
  const [newOrderCode, setNewOrderCode] = useState("");
  const [newStdBomId, setNewStdBomId] = useState(approvedStandardBoms[0]?.id ?? "");
  const [newSource, setNewSource] = useState("MAKE_TO_STOCK");

  // Create Amendment form state
  const [newAmdCode, setNewAmdCode] = useState("");
  const [newAmdLines, setNewAmdLines] = useState<AmdLineState[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedBom = orderBoms.find((b) => b.id === selectedBomId);

  // Status mapping to nexo tokens
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

  const getSourceBadgeClass = (source: string) => {
    return source === "MAKE_TO_ORDER"
      ? "bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-600/10"
      : "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/10";
  };

  // Open amendment dialog with copy of active lines
  const openAmendmentDrawer = () => {
    if (!selectedBom) return;
    setNewAmdCode(`BOM-AMD-${selectedBom.code}-${selectedBom.amendments.length + 1}`);
    setNewAmdLines(
      selectedBom.lines.map((l) => ({
        materialId: l.materialId,
        materialCode: l.materialCode,
        materialName: l.materialName,
        quantityKg: l.quantityKg.toString(),
      }))
    );
    setIsAmendmentOpen(true);
  };

  const removeAmdLine = (idx: number) => {
    setNewAmdLines(newAmdLines.filter((_, i) => i !== idx));
  };

  // Submit Order BOM
  const handleCreateOrder = () => {
    setError(null);
    if (!newOrderCode) {
      setError("Please specify an Order BOM Code.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await createOrderBom({
          code: newOrderCode,
          standardBomId: newStdBomId,
          source: newSource as any,
        });
        setSelectedBomId(result.id);
        setIsCreateOpen(false);
        setNewOrderCode("");
      } catch (err: any) {
        setError(err.message ?? "Failed to create Order BOM.");
      }
    });
  };

  // Submit Amendment
  const handleCreateAmendment = () => {
    setError(null);
    if (!selectedBomId || !newAmdCode) return;
    if (newAmdLines.length === 0) {
      setError("Please add at least one amendment line.");
      return;
    }

    startTransition(async () => {
      try {
        await submitBomAmendment({
          code: newAmdCode,
          orderBomId: selectedBomId,
          lines: newAmdLines.map((l) => ({
            materialId: l.materialId,
            quantityKg: parseFloat(l.quantityKg) || 0,
          })),
        });
        setIsAmendmentOpen(false);
        setActiveTab("amendments");
      } catch (err: any) {
        setError(err.message ?? "Failed to submit amendment.");
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
        <h1 className="shrink-0 text-[14px] font-semibold tracking-tight text-ink">Order BOMs</h1>
        <span className="shrink-0 rounded-sm bg-pastel px-1.5 py-px font-num text-[11px] font-medium text-primary">
          {orderBoms.length}
        </span>
        <span className="text-[11.5px] text-muted">
          Manage allocations and custom adjustments for active production demands
        </span>
        <div className="ml-auto">
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="text-[11px] h-[24px] px-2.5"
          >
            New Order BOM
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
          className="text-muted hover:text-ink py-2 cursor-pointer transition-colors"
        >
          Standard BOMs
        </Link>
        <Link
          href="/items/order"
          className="border-b-2 border-primary text-primary py-2 cursor-pointer"
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
        {/* Left Side: Table List of Order BOMs */}
        <div className="flex flex-1 flex-col min-h-0 border-r border-edge">
          <header className="flex h-[32px] shrink-0 items-center border-b border-edge bg-faint px-3">
            <h2 className="text-[11.5px] font-semibold text-ink">Active Order BOMs</h2>
          </header>
          <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-surface">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="grid-head">
                  <th className="px-3 py-2 text-left font-semibold">Order BOM No</th>
                  <th className="px-3 py-2 text-left font-semibold">Standard Baseline</th>
                  <th className="px-3 py-2 text-left font-semibold">Product / Item</th>
                  <th className="px-3 py-2 text-left font-semibold">Source</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-left font-semibold">Amendments</th>
                </tr>
              </thead>
              <tbody>
                {orderBoms.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[12.5px] text-muted">
                      No Order BOMs found. Select New Order BOM to instantiate one.
                    </td>
                  </tr>
                ) : (
                  orderBoms.map((bom) => (
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
                      <td className="grid-cell font-num text-muted">
                        {bom.standardBomCode ?? "—"}
                      </td>
                      <td className="grid-cell">
                        <span className="font-semibold text-slate-800">{bom.standardBomMaterialName ?? "—"}</span>
                      </td>
                      <td className="grid-cell">
                        <span className={`inline-flex items-center rounded-md px-1.5 py-px text-[9.5px] font-semibold ring-1 ring-inset ${getSourceBadgeClass(bom.source)}`}>
                          {bom.source.replace("MAKE_TO_", "")}
                        </span>
                      </td>
                      <td className="grid-cell">
                        <Chip tone={bomStatusTone(bom.status)}>{bom.status}</Chip>
                      </td>
                      <td className="grid-cell font-num text-muted text-center lg:text-left">
                        {bom.amendments.length}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Details Tab View */}
        <div className="w-full lg:w-[480px] shrink-0 flex flex-col border-t lg:border-t-0 border-edge bg-surface">
          <header className="flex h-[32px] shrink-0 items-center justify-between border-b border-edge bg-faint px-3">
            <h2 className="text-[11.5px] font-semibold text-ink">Order BOM Workspace</h2>
            {selectedBom && (
              <span className="font-num text-[11px] text-primary-hover font-bold">{selectedBom.code}</span>
            )}
          </header>

          {selectedBom ? (
            <div className="flex-1 overflow-auto p-4 scroll-thin space-y-4 flex flex-col">
              {/* Metadata block */}
              <div className="border border-edge rounded-sm p-3 bg-faint/50 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-[13px] font-bold text-ink">{selectedBom.standardBomMaterialName}</h3>
                    <p className="text-[11.0px] text-muted mt-0.5">Standard Baseline BOM: <span className="font-num font-semibold">{selectedBom.standardBomCode}</span></p>
                  </div>
                  <div className="flex gap-1">
                    <span className={`inline-flex items-center rounded-md px-1.5 py-px text-[9.5px] font-semibold ring-1 ring-inset ${getSourceBadgeClass(selectedBom.source)}`}>
                      {selectedBom.source.replace("MAKE_TO_", "")}
                    </span>
                    <Chip tone={bomStatusTone(selectedBom.status)}>{selectedBom.status}</Chip>
                  </div>
                </div>
              </div>

              {/* Action Trigger Panels */}
              <div className="flex gap-2">
                <Button
                  onClick={openAmendmentDrawer}
                  className="flex-1"
                >
                  Propose Amendment
                </Button>
              </div>

              {/* Tab navigation selectors */}
              <div className="flex border-b border-edge text-[11px] font-semibold text-muted shrink-0">
                <button
                  onClick={() => setActiveTab("recipe")}
                  className={`pb-1.5 border-b-2 px-1 ${
                    activeTab === "recipe"
                      ? "border-primary text-primary"
                      : "border-transparent hover:text-ink"
                  }`}
                >
                  Active BOM Component Lines
                </button>
                <button
                  onClick={() => setActiveTab("amendments")}
                  className={`ml-4 pb-1.5 border-b-2 px-1 ${
                    activeTab === "amendments"
                      ? "border-primary text-primary"
                      : "border-transparent hover:text-ink"
                  }`}
                >
                  Proposed Amendments ({selectedBom.amendments.length})
                </button>
              </div>

              {/* Tab Body contents */}
              <div className="flex-1 text-[11.5px] text-ink">
                {activeTab === "recipe" && (
                  <div>
                    <div className="overflow-hidden border border-edge rounded-sm">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-faint text-ink border-b border-edge">
                          <tr>
                            <th className="px-2.5 py-1.5 font-semibold">SKU Code</th>
                            <th className="px-2.5 py-1.5 font-semibold">Component</th>
                            <th className="px-2.5 py-1.5 text-right font-semibold">Quantity</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-edge bg-surface">
                          {selectedBom.lines.map((line, idx) => (
                            <tr key={idx} className="hover:bg-pastel/20">
                              <td className="px-2.5 py-1.5 font-num">{line.materialCode}</td>
                              <td className="px-2.5 py-1.5 font-medium">{line.materialName}</td>
                              <td className="px-2.5 py-1.5 text-right font-num font-semibold">{line.quantityKg.toLocaleString()} {formatUomDisplay(line.materialUom)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeTab === "amendments" && (
                  <div className="space-y-4">
                    {selectedBom.amendments.map((amd) => (
                      <div key={amd.id} className="border border-edge p-3 rounded-sm space-y-3 bg-faint/30">
                        <div className="flex items-center justify-between">
                          <span className="font-num font-bold text-primary">{amd.code}</span>
                          <Chip tone={amd.status === "APPROVED" ? "success" : amd.status === "PENDING_APPROVAL" ? "warning" : "danger"}>
                            {amd.status}
                          </Chip>
                        </div>

                        {/* Amendment Lines Table */}
                        <div className="overflow-hidden border border-edge rounded-sm">
                          <table className="w-full text-left text-[10.5px]">
                            <thead className="bg-faint text-ink border-b border-edge">
                              <tr>
                                <th className="px-2 py-1 font-semibold">Material</th>
                                <th className="px-2 py-1 text-right font-semibold">Staging Target</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-edge bg-surface">
                              {amd.lines.map((line, idx) => (
                                <tr key={idx}>
                                  <td className="px-2 py-1">
                                    <span className="font-semibold">{line.materialName}</span>
                                    <span className="font-num text-[9.5px] text-muted ml-1">({line.materialCode})</span>
                                  </td>
                                  <td className="px-2 py-1 text-right font-num font-semibold">{line.quantityKg.toLocaleString()} {formatUomDisplay(line.materialUom)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Audit Details */}
                        <div className="text-[10px] text-muted flex justify-between items-center pt-1 border-t border-edge/30">
                          <span>Proposer: {amd.requestedByName}</span>
                          <span>{new Date(amd.createdAt).toLocaleDateString()}</span>
                        </div>

                        {/* Approve/Reject Controls (Visible for pending amendments only) */}
                        {amd.status === "PENDING_APPROVAL" && (
                          <div className="flex gap-2 pt-1.5">
                            <button
                              disabled={isPending}
                              onClick={() => handleAction(approveBomAmendment, amd.id)}
                              className="flex-1 rounded bg-primary text-white text-[11px] font-semibold py-1 hover:bg-primary-hover"
                            >
                              Approve (Apply Overwrite)
                            </button>
                            <button
                              disabled={isPending}
                              onClick={() => handleAction(rejectBomAmendment, amd.id)}
                              className="flex-1 rounded border border-danger text-danger text-[11px] font-semibold py-1 hover:bg-danger-bg"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    {selectedBom.amendments.length === 0 && (
                      <div className="text-center py-8 text-muted border border-dashed border-edge rounded-sm">
                        No amendments proposed for this Order BOM.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Select an Order BOM to view lines and manage amendments.
            </div>
          )}
        </div>
      </div>

      {/* New Order BOM Modal overlay */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-sm">
          <div className="h-full w-full max-w-sm bg-surface p-6 shadow-pop flex flex-col border-l border-edge">
            <div className="flex items-center justify-between border-b border-edge pb-3">
              <h2 className="text-[13px] font-bold text-slate-900">Create Order BOM</h2>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4 text-xs text-slate-700 scroll-thin">
              <FormError message={null} />

              <Field label="Order BOM Code" required>
                <Input
                  type="text"
                  placeholder="e.g. BOM-ORD-SO-005"
                  value={newOrderCode}
                  onChange={(e) => setNewOrderCode(e.target.value)}
                  required
                />
              </Field>

              <Field label="Baseline Standard BOM" required>
                <Select
                  value={newStdBomId}
                  onChange={(e) => setNewStdBomId(e.target.value)}
                  required
                >
                  {approvedStandardBoms.map((std) => (
                    <option key={std.id} value={std.id}>
                      {std.code} ({std.materialName})
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Order Source" required>
                <div className="flex gap-4 pt-1">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="order-source"
                      value="MAKE_TO_STOCK"
                      checked={newSource === "MAKE_TO_STOCK"}
                      onChange={() => setNewSource("MAKE_TO_STOCK")}
                      className="accent-primary"
                    />
                    Make to Stock (MTS)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="order-source"
                      value="MAKE_TO_ORDER"
                      checked={newSource === "MAKE_TO_ORDER"}
                      onChange={() => setNewSource("MAKE_TO_ORDER")}
                      className="accent-primary"
                    />
                    Make to Order (MTO)
                  </label>
                </div>
              </Field>
            </div>

            <div className="border-t border-edge pt-4 flex gap-2">
              <Button
                disabled={isPending}
                onClick={handleCreateOrder}
                className="flex-1"
              >
                Create Order BOM
              </Button>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="flex-1 rounded border border-edge text-[11.5px] font-semibold py-1.5 hover:bg-faint transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Propose Amendment Modal Overlay */}
      {isAmendmentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-sm">
          <div className="h-full w-full max-w-md bg-surface p-6 shadow-xl flex flex-col border-l border-edge">
            <div className="flex items-center justify-between border-b border-edge pb-3">
              <div>
                <h2 className="text-sm font-bold text-ink">Propose BOM Amendment</h2>
                <p className="text-[11px] text-muted mt-0.5">Submit engineering revision for this Order BOM</p>
              </div>
              <button
                onClick={() => setIsAmendmentOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4 text-xs text-slate-700 scroll-thin">
              <FormError message={null} />

              <Field label="Amendment Code" required>
                <Input
                  type="text"
                  placeholder="e.g. BOM-AMD-001"
                  value={newAmdCode}
                  onChange={(e) => setNewAmdCode(e.target.value)}
                  required
                />
              </Field>

              <div className="border-t border-edge pt-4 mt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
                      Proposed Lines
                    </label>
                    <p className="text-[10.5px] text-muted font-num">
                      {newAmdLines.length} {newAmdLines.length === 1 ? "item added" : "items added"}
                    </p>
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

                {newAmdLines.length === 0 ? (
                  <div className="border border-dashed border-edge rounded-md p-6 text-center text-xs text-muted bg-faint/30">
                    <p className="font-medium text-slate-600">No component lines added.</p>
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
                    {newAmdLines.map((line, idx) => (
                      <div
                        key={idx}
                        className="group flex items-center justify-between gap-3 rounded-md border border-edge bg-surface p-2.5 shadow-2xs hover:border-slate-300 hover:shadow-xs transition-all"
                      >
                        {/* Material Info */}
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-900 text-xs truncate leading-tight">
                            {line.materialName ?? line.materialId}
                          </div>
                          {line.materialCode && (
                            <div className="mt-1 flex items-center gap-2 text-[10.5px]">
                              <span className="font-num font-semibold text-primary whitespace-nowrap bg-pastel/50 px-1.5 py-0.5 rounded text-[10.5px]">
                                {line.materialCode}
                              </span>
                            </div>
                          )}
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
                                const updated = [...newAmdLines];
                                updated[idx].quantityKg = e.target.value;
                                setNewAmdLines(updated);
                              }}
                              className="w-20 px-2 py-1 text-right text-xs font-num font-bold text-slate-900 focus:outline-none bg-transparent"
                            />
                            <span className="bg-faint px-2 py-1 text-[11px] font-medium text-slate-500 border-l border-edge select-none">
                              {formatUomDisplay(line.uom)}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeAmdLine(idx)}
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
                onClick={handleCreateAmendment}
                className="flex-1"
              >
                Submit Amendment
              </Button>
              <button
                onClick={() => setIsAmendmentOpen(false)}
                className="flex-1 rounded border border-edge text-[11.5px] font-semibold py-1.5 hover:bg-faint transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Two-Tab Add Component Modal for Order BOM Amendments */}
      <AddComponentModal
        isOpen={isAddComponentOpen}
        onClose={() => setIsAddComponentOpen(false)}
        availableItems={availableMaterials}
        onItemCreated={(newItem) => {
          setAvailableMaterials((prev) => [newItem, ...prev]);
        }}
        onAddComponent={(item, quantityKg) => {
          setNewAmdLines((prev) => {
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
