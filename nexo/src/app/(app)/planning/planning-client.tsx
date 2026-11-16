"use client";

import { useTenant } from "@/components/appearance";

import { useState, useTransition } from "react";
import { Chip } from "@/components/ui/chip";
import { Button, Input, Select, Field, FormError } from "@/components/ui/form";
import {
  createPlanningWorkOrder,
  submitPlanningWorkOrderForApproval,
  approvePlanningWorkOrder,
  addPlanningMilestone,
  completePlanningMilestone,
  runStockAllocation,
  runStockDeallocation,
  runAdvanceMaterialPlanning,
} from "./actions";

type Milestone = {
  id: string;
  name: string;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
};

type Allocation = {
  batchNo: string;
  materialName: string;
  materialCode: string;
  quantityKg: number;
};

type Shortage = {
  materialName: string;
  materialCode: string;
  requiredQtyKg: number;
  allocatedQtyKg: number;
  shortageQtyKg: number;
};

type WorkOrder = {
  id: string;
  code: string;
  status: string;
  source: string;
  referenceNo: string;
  materialId: string;
  materialName: string;
  materialCode: string;
  quantityKg: number;
  orderBomCode: string | null;
  requestedByName: string;
  approvedByName: string | null;
  approvedAt: string | null;
  createdAt: string;
  milestones: Milestone[];
  allocations: Allocation[];
  shortages: Shortage[];
  isReadyForProduction: boolean;
  purchaseRequisitionCount: number;
  hasStoreIssueSlip: boolean;
};

type MaterialOption = {
  id: string;
  name: string;
  code: string;
};

type StandaloneRequisition = {
  id: string;
  materialName: string;
  materialCode: string;
  quantityKg: number;
  status: string;
  createdAt: string;
};

export function PlanningClient({
  workOrders,
  compoundMaterials,
  standaloneRequisitions,
}: {
  workOrders: WorkOrder[];
  compoundMaterials: MaterialOption[];
  standaloneRequisitions: StandaloneRequisition[];
}) {
  const noun = useTenant().noun;
  const [selectedPwoId, setSelectedPwoId] = useState<string | null>(
    workOrders[0]?.id ?? null
  );

  // Modal Open States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAdvanceOpen, setIsAdvanceOpen] = useState(false);
  const [isAddMilestoneOpen, setIsAddMilestoneOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"reconciliation" | "allocations" | "shortages" | "milestones" | "downstream">("reconciliation");

  // Create PWO Form State
  const [newCode, setNewCode] = useState("");
  const [newMaterialId, setNewMaterialId] = useState(compoundMaterials[0]?.id ?? "");
  const [newQty, setNewQty] = useState("1000");
  const [newSource, setNewSource] = useState("MAKE_TO_STOCK");
  const [newRefNo, setNewRefNo] = useState("");

  // Standalone Advance Planning Form State
  const [advMaterialId, setAdvMaterialId] = useState(compoundMaterials[0]?.id ?? "");
  const [advQty, setAdvQty] = useState("500");

  // Milestone Form State
  const [newMilestoneName, setNewMilestoneName] = useState("");
  const [newMilestoneDate, setNewMilestoneDate] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedPwo = workOrders.find((w) => w.id === selectedPwoId);

  // Status Tones mappings to matching nexo tokens
  const pwoStatusTone = (status: string) => {
    switch (status) {
      case "APPROVED":
        return "success";
      case "IN_PROGRESS":
        return "info";
      case "PENDING_APPROVAL":
        return "warning";
      case "REJECTED":
        return "danger";
      case "COMPLETED":
        return "success";
      case "CANCELLED":
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

  // Submit PWO Creation
  const handleCreate = () => {
    setError(null);
    setSuccessMessage(null);
    if (!newCode) {
      setError("Please specify a Planning Work Order Code.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await createPlanningWorkOrder({
          code: newCode,
          source: newSource as any,
          referenceNo: newRefNo,
          materialId: newMaterialId,
          quantityKg: parseFloat(newQty) || 0,
        });
        setSelectedPwoId(result.id);
        setIsCreateOpen(false);
        setNewCode("");
        setNewRefNo("");
      } catch (err: any) {
        setError(err.message ?? "Failed to create Planning Work Order.");
      }
    });
  };

  // Submit Standalone Advance Planning (GAP 1)
  const handleAdvancePlanning = () => {
    setError(null);
    setSuccessMessage(null);
    startTransition(async () => {
      try {
        const result = await runAdvanceMaterialPlanning({
          materialId: advMaterialId,
          quantityKg: parseFloat(advQty) || 0,
        });
        if (result.shortageQtyKg > 0) {
          setSuccessMessage(
            `Advance staging complete: ${result.allocatedQtyKg.toLocaleString()} kg staged from inventory, ${result.shortageQtyKg.toLocaleString()} kg requisitioned.`
          );
        } else {
          setSuccessMessage(
            `Advance staging complete: ${result.allocatedQtyKg.toLocaleString()} kg staged fully from inventory.`
          );
        }
        setIsAdvanceOpen(false);
      } catch (err: any) {
        setError(err.message ?? "Failed to run Advance Material Planning.");
      }
    });
  };

  // Submit Milestone
  const handleAddMilestone = () => {
    setError(null);
    setSuccessMessage(null);
    if (!selectedPwoId || !newMilestoneName) return;

    startTransition(async () => {
      try {
        await addPlanningMilestone({
          pwoId: selectedPwoId,
          name: newMilestoneName,
          dueDate: newMilestoneDate ? new Date(newMilestoneDate) : undefined,
        });
        setIsAddMilestoneOpen(false);
        setNewMilestoneName("");
        setNewMilestoneDate("");
      } catch (err: any) {
        setError(err.message ?? "Failed to add milestone.");
      }
    });
  };

  // Handle general transition action
  const handleAction = (action: (id: string) => Promise<any>, id: string) => {
    setError(null);
    setSuccessMessage(null);
    startTransition(async () => {
      try {
        await action(id);
      } catch (err: any) {
        setError(err.message ?? "Action execution failed.");
      }
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header (aligned with nav chrome) */}
      <div className="flex h-[42px] shrink-0 items-center gap-3 border-b border-edge bg-faint px-3">
        <h1 className="shrink-0 text-[14px] font-semibold tracking-tight text-ink">Planning work orders</h1>
        <span className="shrink-0 rounded-sm bg-pastel px-1.5 py-px font-num text-[11px] font-medium text-primary">
          {workOrders.length}
        </span>
        <span className="text-[11.5px] text-muted">
          Schedule, authorize, and allocate stock batches for manufacturing campaigns
        </span>
        <div className="ml-auto flex gap-2">
          <Button
            onClick={() => setIsAdvanceOpen(true)}
            className="text-[11px] h-[24px] px-2.5 bg-accent hover:bg-accent-soft border-b border-accent/20"
          >
            Advance Staging
          </Button>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="text-[11px] h-[24px] px-2.5"
          >
            New Work Order
          </Button>
        </div>
      </div>

      {error && (
        <div className="border-b border-danger bg-danger-bg px-3 py-1.5 text-[11.5px] text-danger-text">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="border-b border-success bg-success-bg px-3 py-1.5 text-[11.5px] text-success-text">
          {successMessage}
        </div>
      )}

      {/* Main split dashboard section */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row bg-canvas">
        {/* Left Side: Table list of PWOs */}
        <div className="flex flex-1 flex-col min-h-0 border-r border-edge">
          <header className="flex h-[32px] shrink-0 items-center border-b border-edge bg-faint px-3">
            <h2 className="text-[11.5px] font-semibold text-ink">Active schedules</h2>
          </header>
          <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-surface">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="grid-head">
                  <th className="px-3 py-2 text-left font-semibold">Work Order No</th>
                  <th className="px-3 py-2 text-left font-semibold">{noun.one}</th>
                  <th className="px-3 py-2 text-right font-semibold">Quantity</th>
                  <th className="px-3 py-2 text-left font-semibold">Source</th>
                  <th className="px-3 py-2 text-left font-semibold">Reference</th>
                  <th className="px-3 py-2 text-left font-semibold">Requester</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {workOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[12.5px] text-muted">
                      No Planning Work Orders found. Register one to start allocation.
                    </td>
                  </tr>
                ) : (
                  workOrders.map((wo) => (
                    <tr
                      key={wo.id}
                      onClick={() => setSelectedPwoId(wo.id)}
                      className={`grid-row hover:bg-pastel transition-colors duration-150 cursor-pointer ${
                        selectedPwoId === wo.id ? "bg-pastel/60" : ""
                      }`}
                    >
                      <td className="grid-cell font-num font-semibold text-primary-hover">
                        {wo.code}
                      </td>
                      <td className="grid-cell">
                        <span className="font-semibold text-slate-800">{wo.materialName}</span>
                        <span className="font-num text-[10.5px] text-muted ml-2">({wo.materialCode})</span>
                      </td>
                      <td className="grid-cell text-right font-num font-semibold">
                        {wo.quantityKg.toLocaleString()} kg
                      </td>
                      <td className="grid-cell text-muted">
                        {wo.source.replace("MAKE_TO_", "")}
                      </td>
                      <td className="grid-cell font-num text-muted">
                        {wo.referenceNo}
                      </td>
                      <td className="grid-cell text-muted">
                        {wo.requestedByName}
                      </td>
                      <td className="grid-cell">
                        <Chip tone={pwoStatusTone(wo.status)}>{wo.status.replace("_", " ")}</Chip>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Tab panel and detailing */}
        <div className="w-full lg:w-[460px] shrink-0 flex flex-col border-t lg:border-t-0 border-edge bg-surface">
          <header className="flex h-[32px] shrink-0 items-center justify-between border-b border-edge bg-faint px-3">
            <h2 className="text-[11.5px] font-semibold text-ink">Staging & details workspace</h2>
            {selectedPwo && (
              <span className="font-num text-[11px] text-primary-hover font-bold">{selectedPwo.code}</span>
            )}
          </header>

          {selectedPwo ? (
            <div className="flex-1 overflow-auto p-4 scroll-thin space-y-4 flex flex-col">
              {/* Material Details Card info */}
              <div className="border border-edge rounded-sm p-3 bg-faint/50 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-[13px] font-bold text-ink">{selectedPwo.materialName}</h3>
                    <p className="text-[11px] text-muted font-num mt-0.5">{selectedPwo.materialCode}</p>
                  </div>
                  <Chip tone={pwoStatusTone(selectedPwo.status)}>{selectedPwo.status}</Chip>
                </div>
                
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2 border-t border-edge/50 text-[11.5px] text-muted">
                  <div>
                    <span>Staging Target:</span>
                    <p className="font-num font-semibold text-ink mt-0.5">{selectedPwo.quantityKg.toLocaleString()} kg</p>
                  </div>
                  <div>
                    <span>Standard Template:</span>
                    <p className="font-num font-semibold text-ink mt-0.5">{selectedPwo.orderBomCode ?? "—"}</p>
                  </div>
                  <div className="col-span-2 mt-1">
                    <span>Approved By:</span>
                    <p className="font-medium text-ink mt-0.5">
                      {selectedPwo.approvedByName ?? "—"} {selectedPwo.approvedAt ? `on ${new Date(selectedPwo.approvedAt).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons Panel */}
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  {selectedPwo.status === "DRAFT" && (
                    <Button
                      disabled={isPending}
                      onClick={() => handleAction(submitPlanningWorkOrderForApproval, selectedPwo.id)}
                      className="flex-1"
                    >
                      Submit for Approval
                    </Button>
                  )}
                  {selectedPwo.status === "PENDING_APPROVAL" && (
                    <Button
                      disabled={isPending}
                      onClick={() => handleAction(approvePlanningWorkOrder, selectedPwo.id)}
                      className="flex-1"
                    >
                      Approve (Authorize)
                    </Button>
                  )}
                  {selectedPwo.status === "APPROVED" && (
                    <Button
                      disabled={isPending}
                      onClick={() => handleAction(runStockAllocation, selectedPwo.id)}
                      className="flex-1 animate-pulse"
                    >
                      Run Stock Allocation
                    </Button>
                  )}
                  {selectedPwo.status === "IN_PROGRESS" && (
                    <button
                      disabled={isPending}
                      onClick={() => handleAction(runStockDeallocation, selectedPwo.id)}
                      className="flex-1 rounded border border-danger text-danger text-[11.5px] font-semibold py-1.5 hover:bg-danger-bg transition-colors"
                    >
                      Release Allocations
                    </button>
                  )}
                </div>
              </div>

              {/* Tab Selector Chrome */}
              <div className="flex border-b border-edge text-[11px] font-semibold text-muted shrink-0">
                <button
                  onClick={() => setActiveTab("reconciliation")}
                  className={`pb-1.5 border-b-2 px-1 ${
                    activeTab === "reconciliation"
                      ? "border-primary text-primary"
                      : "border-transparent hover:text-ink"
                  }`}
                >
                  OBOM Analysis
                </button>
                <button
                  onClick={() => setActiveTab("allocations")}
                  className={`ml-4 pb-1.5 border-b-2 px-1 ${
                    activeTab === "allocations"
                      ? "border-primary text-primary"
                      : "border-transparent hover:text-ink"
                  }`}
                >
                  Staged ({selectedPwo.allocations.length})
                </button>
                <button
                  onClick={() => setActiveTab("shortages")}
                  className={`ml-4 pb-1.5 border-b-2 px-1 ${
                    activeTab === "shortages"
                      ? "border-primary text-primary"
                      : "border-transparent hover:text-ink"
                  }`}
                >
                  Shortages ({selectedPwo.shortages.length})
                </button>
                <button
                  onClick={() => setActiveTab("milestones")}
                  className={`ml-4 pb-1.5 border-b-2 px-1 ${
                    activeTab === "milestones"
                      ? "border-primary text-primary"
                      : "border-transparent hover:text-ink"
                  }`}
                >
                  Milestones ({selectedPwo.milestones.length})
                </button>
                <button
                  onClick={() => setActiveTab("downstream")}
                  className={`ml-4 pb-1.5 border-b-2 px-1 ${
                    activeTab === "downstream"
                      ? "border-primary text-primary"
                      : "border-transparent hover:text-ink"
                  }`}
                >
                  Stubs
                </button>
              </div>

              {/* Tab Body Contents */}
              <div className="flex-1 text-[11.5px] text-ink">
                {activeTab === "reconciliation" && (
                  <div className="space-y-3">
                    <div className="overflow-hidden border border-edge rounded-sm">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-faint text-ink border-b border-edge">
                          <tr>
                            <th className="px-2.5 py-1.5 font-semibold">Component</th>
                            <th className="px-2.5 py-1.5 text-right font-semibold">Required</th>
                            <th className="px-2.5 py-1.5 text-right font-semibold">Staged</th>
                            <th className="px-2.5 py-1.5 text-right font-semibold text-danger">Shortage</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-edge bg-surface">
                          {selectedPwo.orderBomCode ? (
                            selectedPwo.allocations.length > 0 || selectedPwo.shortages.length > 0 ? (
                              <>
                                {selectedPwo.allocations.map((a, idx) => (
                                  <tr key={`alloc-${idx}`} className="hover:bg-pastel/20">
                                    <td className="px-2.5 py-1.5">
                                      <span className="font-semibold">{a.materialName}</span>
                                      <p className="font-num text-[10px] text-muted">{a.materialCode}</p>
                                    </td>
                                    <td className="px-2.5 py-1.5 text-right text-muted">—</td>
                                    <td className="px-2.5 py-1.5 text-right font-num font-semibold text-success-text">{a.quantityKg.toLocaleString()} kg</td>
                                    <td className="px-2.5 py-1.5 text-right text-muted">—</td>
                                  </tr>
                                ))}
                                {selectedPwo.shortages.map((s, idx) => (
                                  <tr key={`short-${idx}`} className="bg-danger-bg/20 hover:bg-danger-bg/40">
                                    <td className="px-2.5 py-1.5">
                                      <span className="font-semibold">{s.materialName}</span>
                                      <p className="font-num text-[10px] text-muted">{s.materialCode}</p>
                                    </td>
                                    <td className="px-2.5 py-1.5 text-right font-num text-muted">{s.requiredQtyKg.toLocaleString()} kg</td>
                                    <td className="px-2.5 py-1.5 text-right text-muted">—</td>
                                    <td className="px-2.5 py-1.5 text-right font-num font-semibold text-danger-text">{s.shortageQtyKg.toLocaleString()} kg</td>
                                  </tr>
                                ))}
                              </>
                            ) : (
                              <tr>
                                <td colSpan={4} className="text-center py-6 text-muted">
                                  Run Stock Allocation to analyze quantities against inventory.
                                </td>
                              </tr>
                            )
                          ) : (
                            <tr>
                              <td colSpan={4} className="text-center py-6 text-muted">
                                No Order BOM linked yet. Run stock allocation to check availability.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeTab === "allocations" && (
                  <div className="space-y-2">
                    {selectedPwo.allocations.map((a, idx) => (
                      <div key={idx} className="flex justify-between items-center border border-edge p-2.5 rounded-sm bg-faint/30">
                        <div>
                          <span className="font-num font-bold text-slate-800">{a.batchNo}</span>
                          <p className="text-[10px] text-muted mt-0.5">{a.materialName} ({a.materialCode})</p>
                        </div>
                        <span className="font-num font-semibold">{a.quantityKg.toLocaleString()} kg</span>
                      </div>
                    ))}
                    {selectedPwo.allocations.length === 0 && (
                      <div className="text-center py-6 text-muted border border-dashed border-edge rounded-sm">
                        No active stock allocations committed.
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "shortages" && (
                  <div className="space-y-2">
                    {selectedPwo.shortages.map((s, idx) => (
                      <div key={idx} className="border border-danger/10 p-2.5 rounded-sm bg-danger-bg/20 flex justify-between items-center">
                        <div>
                          <span className="font-semibold text-ink">{s.materialName}</span>
                          <p className="font-num text-[10px] text-muted mt-0.5">{s.materialCode}</p>
                        </div>
                        <div className="text-right">
                          <span className="font-num font-bold text-danger-text text-[12px]">{s.shortageQtyKg.toLocaleString()} kg short</span>
                          <p className="text-[10px] text-muted mt-0.5 font-num">Required: {s.requiredQtyKg.toLocaleString()} kg</p>
                        </div>
                      </div>
                    ))}
                    {selectedPwo.shortages.length === 0 && (
                      <div className="text-center py-6 text-muted border border-dashed border-edge rounded-sm">
                        No raw material shortages detected.
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "milestones" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-edge/60 pb-1">
                      <span className="font-bold text-[10.5px] uppercase tracking-wider text-muted">Progress checklists</span>
                      <button
                        onClick={() => setIsAddMilestoneOpen(true)}
                        className="text-primary hover:text-primary-hover font-bold text-[11px]"
                      >
                        + Add Target
                      </button>
                    </div>

                    <div className="space-y-2">
                      {selectedPwo.milestones.map((m) => (
                        <div key={m.id} className="flex justify-between items-center border border-edge p-2.5 bg-faint/30 rounded-sm">
                          <div>
                            <span className={`font-semibold ${m.status === "COMPLETED" ? "line-through text-muted" : "text-slate-700"}`}>
                              {m.name}
                            </span>
                            {m.dueDate && (
                              <p className="text-[10px] text-muted font-num mt-0.5">Due: {m.dueDate}</p>
                            )}
                          </div>
                          {m.status === "PENDING" ? (
                            <button
                              disabled={isPending}
                              onClick={() => handleAction(completePlanningMilestone, m.id)}
                              className="rounded bg-primary px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-primary-hover"
                            >
                              Complete
                            </button>
                          ) : (
                            <span className="text-[9.5px] text-success-text font-semibold bg-success-bg px-2 py-0.5 rounded border border-success/10 font-num">
                              {m.completedAt ? new Date(m.completedAt).toLocaleDateString() : "Done"}
                            </span>
                          )}
                        </div>
                      ))}

                      {selectedPwo.milestones.length === 0 && (
                        <div className="text-center py-6 text-muted border border-dashed border-edge rounded-sm">
                          No targets defined. Click Add Target to schedule checks.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === "downstream" && (
                  <div className="space-y-4">
                    <div className="space-y-3 border-b border-edge pb-4">
                      <h4 className="font-bold text-[10px] uppercase text-muted tracking-wider">Work Order Stubs</h4>
                      {/* Store Slip */}
                      <div className="border border-edge p-3 rounded-sm bg-faint/30 flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-slate-800">Store Staging slip placeholder (STO)</h4>
                          <p className="text-muted text-[10px] mt-1">
                            Directs the store module to stage FIFO component batches.
                          </p>
                          <span className="font-num text-[9.5px] bg-pastel px-1.5 py-0.5 rounded text-primary font-semibold mt-2 inline-block">
                            TODO: Connect STO issue logic
                          </span>
                        </div>
                        <Chip tone={selectedPwo.hasStoreIssueSlip ? "success" : "neutral"}>
                          {selectedPwo.hasStoreIssueSlip ? "SLIP CREATED" : "NOT READY"}
                        </Chip>
                      </div>

                      {/* Production Order */}
                      <div className="border border-edge p-3 rounded-sm bg-faint/30 flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-slate-800">Production Work Order placeholder (PRD)</h4>
                          <p className="text-muted text-[10px] mt-1">
                            Authorises compounding start once all materials are staged.
                          </p>
                          <span className="font-num text-[9.5px] bg-pastel px-1.5 py-0.5 rounded text-primary font-semibold mt-2 inline-block">
                            TODO: Connect PRD workorder logic
                          </span>
                        </div>
                        <Chip tone={selectedPwo.isReadyForProduction ? "success" : "neutral"}>
                          {selectedPwo.isReadyForProduction ? "READY" : "SHORTAGE"}
                        </Chip>
                      </div>

                      {/* Requisitions */}
                      <div className="border border-edge p-3 rounded-sm bg-faint/30 flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-slate-800">Purchase Requisition stubs (PUR)</h4>
                          <p className="text-muted text-[10px] mt-1">
                            Triggers purchasing requisitions for resolved shortages.
                          </p>
                          <span className="font-num text-[9.5px] bg-pastel px-1.5 py-0.5 rounded text-primary font-semibold mt-2 inline-block">
                            TODO: Connect PUR requisition logic
                          </span>
                        </div>
                        <Chip tone={selectedPwo.purchaseRequisitionCount > 0 ? "warning" : "neutral"}>
                          {selectedPwo.purchaseRequisitionCount > 0 ? `${selectedPwo.purchaseRequisitionCount} REQS` : "NO REQS"}
                        </Chip>
                      </div>
                    </div>

                    {/* Standalone Advance Requisitions List (GAP 1) */}
                    <div className="space-y-3">
                      <h4 className="font-bold text-[10px] uppercase text-muted tracking-wider">
                        Standalone Advance Material Requisitions
                      </h4>
                      <div className="space-y-2 max-h-[220px] overflow-y-auto scroll-thin">
                        {standaloneRequisitions.map((req) => (
                          <div key={req.id} className="flex justify-between items-center border border-edge p-2.5 rounded-sm bg-faint/20 hover:bg-faint/45">
                            <div>
                              <span className="font-semibold text-slate-800">{req.materialName}</span>
                              <p className="font-num text-[9.5px] text-muted mt-0.5">{req.materialCode}</p>
                            </div>
                            <div className="text-right">
                              <span className="font-num font-semibold text-ink">{req.quantityKg.toLocaleString()} kg</span>
                              <p className="text-[9.5px] text-success-text mt-0.5 font-bold uppercase">{req.status}</p>
                            </div>
                          </div>
                        ))}

                        {standaloneRequisitions.length === 0 && (
                          <div className="text-center py-6 text-muted border border-dashed border-edge rounded-sm">
                            No standalone advance purchase requisitions generated.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Select a Planning Work Order to view allocation schedules.
            </div>
          )}
        </div>
      </div>

      {/* Create Work Order Modal overlay (renders floating, uses pop shadow) */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-sm">
          <div className="h-full w-full max-w-sm bg-surface p-6 shadow-pop flex flex-col border-l border-edge">
            <div className="flex items-center justify-between border-b border-edge pb-3">
              <h2 className="text-[13px] font-bold text-slate-900">Create Planning Work Order</h2>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-500 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4 text-xs text-slate-700 scroll-thin">
              <Field label="Work Order Code" required>
                <Input
                  type="text"
                  placeholder="e.g. PWO-2026-0001"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  required
                />
              </Field>

              <Field label={noun.one} required>
                <Select
                  value={newMaterialId}
                  onChange={(e) => setNewMaterialId(e.target.value)}
                  required
                >
                  {compoundMaterials.map((cm) => (
                    <option key={cm.id} value={cm.id}>
                      {cm.name} ({cm.code})
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Target Quantity (kg)" required>
                <Input
                  type="number"
                  placeholder="1000"
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  required
                />
              </Field>

              <Field label="Planning Source" required>
                <div className="flex gap-4 pt-1">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="source"
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
                      name="source"
                      value="MAKE_TO_ORDER"
                      checked={newSource === "MAKE_TO_ORDER"}
                      onChange={() => setNewSource("MAKE_TO_ORDER")}
                      className="accent-primary"
                    />
                    Make to Order (MTO)
                  </label>
                </div>
              </Field>

              <Field label="Reference Sales Order / Forecast ID">
                <Input
                  type="text"
                  placeholder="e.g. SO-2026-0005"
                  value={newRefNo}
                  onChange={(e) => setNewRefNo(e.target.value)}
                />
              </Field>
            </div>

            <div className="border-t border-edge pt-4 flex gap-2">
              <Button
                disabled={isPending}
                onClick={handleCreate}
                className="flex-1"
              >
                Create PWO
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

      {/* Advance Material Planning Overlay Modal (GAP 1) */}
      {isAdvanceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-sm">
          <div className="h-full w-full max-w-sm bg-surface p-6 shadow-pop flex flex-col border-l border-edge">
            <div className="flex items-center justify-between border-b border-edge pb-3">
              <h2 className="text-[13px] font-bold text-slate-900">Advance Material Planning</h2>
              <button
                onClick={() => setIsAdvanceOpen(false)}
                className="text-slate-400 hover:text-slate-500 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4 text-xs text-slate-700 scroll-thin">
              <p className="text-[11.5px] text-muted leading-relaxed">
                Generate advance purchase requisitions to stage raw materials ahead of production forecasts.
              </p>

              <Field label="Raw Material Component" required>
                <Select
                  value={advMaterialId}
                  onChange={(e) => setAdvMaterialId(e.target.value)}
                  required
                >
                  {compoundMaterials.map((cm) => (
                    <option key={cm.id} value={cm.id}>
                      {cm.name} ({cm.code})
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Advance Quantity to Stage (kg)" required>
                <Input
                  type="number"
                  placeholder="500"
                  value={advQty}
                  onChange={(e) => setAdvQty(e.target.value)}
                  required
                />
              </Field>
            </div>

            <div className="border-t border-edge pt-4 flex gap-2">
              <Button
                disabled={isPending}
                onClick={handleAdvancePlanning}
                className="flex-1 bg-accent hover:bg-accent-soft border-b border-accent/20"
              >
                Generate Requisition
              </Button>
              <button
                onClick={() => setIsAdvanceOpen(false)}
                className="flex-1 rounded border border-edge text-[11.5px] font-semibold py-1.5 hover:bg-faint transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Milestone Dialog Modal */}
      {isAddMilestoneOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-xs bg-surface p-5 shadow-pop rounded-sm border border-edge">
            <h3 className="text-[12.5px] font-bold text-ink mb-3 border-b border-edge pb-2">Add Planning Target</h3>
            
            <div className="space-y-3 text-xs">
              <Field label="Milestone Target Name" required>
                <Input
                  type="text"
                  placeholder="e.g. Staging materials complete"
                  value={newMilestoneName}
                  onChange={(e) => setNewMilestoneName(e.target.value)}
                  required
                />
              </Field>

              <Field label="Due Target Date">
                <Input
                  type="date"
                  value={newMilestoneDate}
                  onChange={(e) => setNewMilestoneDate(e.target.value)}
                />
              </Field>
            </div>

            <div className="mt-5 flex gap-2">
              <Button
                disabled={isPending}
                onClick={handleAddMilestone}
                className="flex-1"
              >
                Save
              </Button>
              <button
                onClick={() => setIsAddMilestoneOpen(false)}
                className="flex-1 rounded border border-edge text-[11px] font-semibold py-1.5 hover:bg-faint"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
