"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Chip, Tone } from "@/components/ui/chip";
import { Button, Input, Select, Field } from "@/components/ui/form";
import {
  createDirectManufacturingWorkOrder,
  createProductionResource,
  toggleProductionResourceActive,
} from "./actions";

type Resource = {
  id: string;
  name: string;
  code: string;
  type: string;
  isActive: boolean;
};

type Placeholder = {
  id: string;
  pwoId: string;
  pwoCode: string;
  materialName: string;
  materialCode: string;
  quantityKg: number;
  orderBomCode: string;
  createdAt: string;
};

type WorkOrder = {
  id: string;
  code: string;
  status: string;
  targetQtyKg: number;
  actualQtyKg: number | null;
  resourceName: string;
  operatorName: string;
  shift: string;
  warehouseName: string;
  warehouseCode: string;
  createdByName: string;
  qcStatus: string;
  materialName: string;
  materialCode: string;
  createdAt: string;
};

type Operator = {
  id: string;
  name: string;
  role: string;
};

type WarehouseOption = {
  id: string;
  name: string;
  code: string;
};

export function ProductionClient({
  resources,
  placeholders,
  workOrders,
  operators,
  warehouses,
}: {
  resources: Resource[];
  placeholders: Placeholder[];
  workOrders: WorkOrder[];
  operators: Operator[];
  warehouses: WarehouseOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Scheduling Form State
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [selectedPlaceholder, setSelectedPlaceholder] = useState<Placeholder | null>(null);
  
  const [resourceId, setResourceId] = useState(resources.filter((r) => r.isActive)[0]?.id ?? "");
  const [shift, setShift] = useState("Day");
  const [operatorId, setOperatorId] = useState(operators[0]?.id ?? "");
  const [targetQty, setTargetQty] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");

  // Resource Management Form State
  const [isResourceManagerOpen, setIsResourceManagerOpen] = useState(false);
  const [newResName, setNewResName] = useState("");
  const [newResCode, setNewResCode] = useState("");
  const [newResType, setNewResType] = useState("LINE");

  const activeResources = resources.filter((r) => r.isActive);

  // Match active runs to resources dynamically (returns all active runs on the resource)
  const getActiveRunsForResource = (resName: string) => {
    return workOrders.filter(
      (w) => w.resourceName === resName && (w.status === "DRAFT" || w.status === "IN_PROGRESS" || w.status === "PENDING_QC")
    );
  };

  const handleOpenSchedule = (placeholder: Placeholder) => {
    setSelectedPlaceholder(placeholder);
    setTargetQty(placeholder.quantityKg.toString());
    
    // Ensure we reset to the first active resource
    const firstActive = resources.filter((r) => r.isActive)[0];
    if (firstActive) {
      setResourceId(firstActive.id);
    }
    setIsScheduleOpen(true);
  };

  const handleScheduleSubmit = () => {
    setError(null);
    setSuccessMessage(null);

    if (!selectedPlaceholder) return;
    if (!resourceId) {
      setError("Please select an active production resource.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await createDirectManufacturingWorkOrder({
          placeholderId: selectedPlaceholder.id,
          resourceId,
          operatorId,
          shift,
          targetQtyKg: parseFloat(targetQty) || 0,
          warehouseId,
        });

        setSuccessMessage(`Work Order ${res.code} scheduled successfully!`);
        setIsScheduleOpen(false);
        setSelectedPlaceholder(null);
        router.refresh();
      } catch (err: any) {
        setError(err.message ?? "Failed to schedule manufacturing run.");
      }
    });
  };

  const handleCreateResource = () => {
    setError(null);
    setSuccessMessage(null);

    if (!newResName.trim() || !newResCode.trim() || !newResType.trim()) {
      setError("Please fill in all production resource fields.");
      return;
    }

    startTransition(async () => {
      try {
        await createProductionResource({
          name: newResName,
          code: newResCode,
          type: newResType,
        });
        setSuccessMessage(`Production Resource "${newResName}" created successfully.`);
        setNewResName("");
        setNewResCode("");
        setNewResType("LINE");
        router.refresh();
      } catch (err: any) {
        setError(err.message ?? "Failed to create production resource.");
      }
    });
  };

  const handleToggleResource = (id: string, activeState: boolean) => {
    setError(null);
    setSuccessMessage(null);

    startTransition(async () => {
      try {
        await toggleProductionResourceActive(id, activeState);
        setSuccessMessage(`Production Resource status updated.`);
        router.refresh();
      } catch (err: any) {
        setError(err.message ?? "Failed to update resource status.");
      }
    });
  };

  const statusTone = (status: string): Tone => {
    switch (status) {
      case "DRAFT":
        return "neutral";
      case "IN_PROGRESS":
        return "warning";
      case "PENDING_QC":
        return "info";
      case "COMPLETED":
        return "success";
      case "REJECTED":
        return "danger";
      default:
        return "neutral";
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex h-[42px] shrink-0 items-center justify-between border-b border-edge bg-faint px-3">
        <div className="flex items-center gap-3">
          <h1 className="shrink-0 text-[14px] font-semibold tracking-tight text-ink">Production Console</h1>
          <span className="shrink-0 rounded-sm bg-pastel px-1.5 py-px font-num text-[11px] font-medium text-primary">
            {workOrders.length} Runs
          </span>
          <span className="text-[11.5px] text-muted">
            Manage runs, monitor process logs, and track output yields.
          </span>
        </div>
        <button
          onClick={() => setIsResourceManagerOpen(!isResourceManagerOpen)}
          className="text-[11.5px] text-primary hover:underline cursor-pointer font-semibold"
        >
          {isResourceManagerOpen ? "Close Master Config" : "Configure Resources"}
        </button>
      </div>

      {/* Banner Notifications */}
      {error && (
        <div className="border-b border-danger/10 bg-danger-bg px-4 py-2.5 text-xs font-semibold text-danger">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="border-b border-success/10 bg-success-bg/30 px-4 py-2.5 text-xs font-semibold text-success-text">
          {successMessage}
        </div>
      )}

      {/* Master Data resource Configurator (PRD-3.5 panel) */}
      {isResourceManagerOpen && (
        <div className="border-b border-edge bg-faint p-4 space-y-4">
          <div className="flex flex-col lg:flex-row gap-6 justify-between">
            {/* Left: Resource Creator Form */}
            <div className="w-full lg:w-1/3 space-y-3 bg-surface p-3.5 border border-edge rounded-sm">
              <h3 className="font-bold text-[12px] text-slate-800 uppercase tracking-wider">
                Add Production Resource
              </h3>
              <Field label="Resource Name" required>
                <Input
                  placeholder="e.g. Line 3"
                  value={newResName}
                  onChange={(e) => setNewResName(e.target.value)}
                  disabled={isPending}
                />
              </Field>
              <Field label="Resource Unique Code" required>
                <Input
                  placeholder="e.g. LINE-3"
                  value={newResCode}
                  onChange={(e) => setNewResCode(e.target.value)}
                  disabled={isPending}
                />
              </Field>
              <Field label="Resource Type" required>
                <Select
                  value={newResType}
                  onChange={(e) => setNewResType(e.target.value)}
                  disabled={isPending}
                >
                  <option value="LINE">Line (Formulation flow)</option>
                  <option value="MACHINE">Machine (Single stand)</option>
                  <option value="STATION">Station (Manual bench)</option>
                </Select>
              </Field>
              <Button
                disabled={isPending}
                onClick={handleCreateResource}
                className="w-full text-xs py-1"
              >
                Add Resource
              </Button>
            </div>

            {/* Right: Resources Grid list */}
            <div className="flex-1 space-y-2 bg-surface p-3.5 border border-edge rounded-sm overflow-auto max-h-[220px]">
              <h3 className="font-bold text-[12px] text-slate-800 uppercase tracking-wider">
                Configured Resource Centers
              </h3>
              <table className="w-full text-left text-[11.5px] border-collapse">
                <thead>
                  <tr className="border-b border-edge text-slate-700 font-semibold">
                    <th className="py-1">Code</th>
                    <th className="py-1">Name</th>
                    <th className="py-1">Type</th>
                    <th className="py-1">Status</th>
                    <th className="py-1 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {resources.map((res) => (
                    <tr key={res.id} className="text-slate-700">
                      <td className="py-1.5 font-semibold text-primary">{res.code}</td>
                      <td className="py-1.5">{res.name}</td>
                      <td className="py-1.5 text-muted text-[10px] uppercase font-semibold">{res.type}</td>
                      <td className="py-1.5">
                        <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded ${
                          res.isActive ? "bg-success-bg text-success-text" : "bg-pastel text-muted"
                        }`}>
                          {res.isActive ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </td>
                      <td className="py-1.5 text-right">
                        <button
                          disabled={isPending}
                          onClick={() => handleToggleResource(res.id, !res.isActive)}
                          className={`text-[10px] font-semibold hover:underline ${
                            res.isActive ? "text-danger" : "text-primary"
                          }`}
                        >
                          {res.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Main split dashboard section */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row bg-canvas p-4 gap-4 overflow-auto scroll-thin">
        {/* Left Side: Dynamic resources status cards and History list */}
        <div className="flex flex-1 flex-col gap-4 min-h-0">
          {/* Dynamic Resource Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeResources.map((res) => {
              const activeRuns = getActiveRunsForResource(res.name);
              return (
                <div key={res.id} className="border border-edge rounded-sm bg-surface p-4 flex flex-col justify-between min-h-[160px]">
                  <div className="flex justify-between items-start border-b border-edge/60 pb-2">
                    <div>
                      <h3 className="font-bold text-[13px] text-slate-800">{res.name}</h3>
                      <p className="text-[10px] text-muted uppercase mt-0.5 tracking-wider font-semibold">
                        Type: {res.type} ({res.code})
                      </p>
                    </div>
                    {activeRuns.length > 0 ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-pastel text-primary">
                        {activeRuns.length} Active {activeRuns.length === 1 ? "Job" : "Jobs"}
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold uppercase bg-pastel/55 text-muted px-2 py-0.5 rounded border border-edge">
                        Idle
                      </span>
                    )}
                  </div>

                  {activeRuns.length > 0 ? (
                    <div className="mt-2.5 space-y-2.5">
                      {activeRuns.map((run) => (
                        <div key={run.id} className="bg-faint/40 border border-edge/60 rounded p-2.5 flex flex-col gap-1 text-[11.5px] text-slate-700">
                          <div className="flex justify-between items-start">
                            <div>
                              <button
                                onClick={() => router.push(`/production/${run.id}/run`)}
                                className="font-semibold text-primary font-num hover:underline cursor-pointer"
                              >
                                {run.code}
                              </button>
                              <span className="text-[10px] text-muted ml-2 truncate">({run.materialName})</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-num font-bold text-xs">{run.targetQtyKg.toLocaleString()} kg</span>
                              <Chip tone={statusTone(run.status)}>{run.status}</Chip>
                            </div>
                          </div>
                          <div className="flex justify-between items-center text-[10.5px] text-muted pt-1 border-t border-edge/40">
                            <span>Op: {run.operatorName} | {run.shift}</span>
                            <button
                              onClick={() => router.push(`/production/${run.id}/run`)}
                              className={`hover:underline cursor-pointer font-semibold text-[11px] ${
                                run.status === "PENDING_QC" ? "text-info font-bold" : "text-primary"
                              }`}
                            >
                              {run.status === "PENDING_QC" ? "Inspect / Pass QC →" : "Open Worksheet →"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic py-4">Ready to accept a scheduled production run.</p>
                  )}
                </div>
              );
            })}

            {activeResources.length === 0 && (
              <div className="col-span-2 text-center py-8 border border-dashed border-edge rounded bg-surface text-muted text-xs italic">
                No active production resources configured. Please configure and activate resources first.
              </div>
            )}
          </div>

          {/* History log of all manufacturing runs */}
          <div className="border border-edge rounded-sm bg-surface flex flex-col min-h-[250px] overflow-hidden">
            <header className="flex h-[32px] shrink-0 items-center justify-between border-b border-edge bg-faint px-3">
              <h2 className="text-[11.5px] font-semibold text-ink">Manufacturing Run Log</h2>
            </header>
            <div className="flex-1 overflow-auto scroll-thin">
              <table className="w-full text-left text-[11.5px]">
                <thead className="bg-faint/40 border-b border-edge text-slate-700 font-semibold">
                  <tr>
                    <th className="px-3 py-2">Job No</th>
                    <th className="px-3 py-2">Product / SKU</th>
                    <th className="px-3 py-2 text-right">Target (kg)</th>
                    <th className="px-3 py-2 text-right">Actual (kg)</th>
                    <th className="px-3 py-2">Line/Resource</th>
                    <th className="px-3 py-2">Operator</th>
                    <th className="px-3 py-2">QC Gate</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {workOrders.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-muted italic">
                        No production runs logged yet.
                      </td>
                    </tr>
                  ) : (
                    workOrders.map((wo) => (
                      <tr key={wo.id} className="hover:bg-pastel/10 text-slate-700">
                        <td className="px-3 py-2">
                          <button
                            onClick={() => router.push(`/production/${wo.id}/run`)}
                            className="font-semibold text-primary hover:underline cursor-pointer text-left"
                          >
                            {wo.code}
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-semibold text-slate-800">{wo.materialName}</span>
                          <span className="text-[10px] text-muted ml-2 font-num">({wo.materialCode})</span>
                        </td>
                        <td className="px-3 py-2 text-right font-num">{wo.targetQtyKg.toLocaleString()} kg</td>
                        <td className="px-3 py-2 text-right font-num">
                          {wo.actualQtyKg ? `${wo.actualQtyKg.toLocaleString()} kg` : "—"}
                        </td>
                        <td className="px-3 py-2 text-muted">{wo.resourceName}</td>
                        <td className="px-3 py-2 text-muted">{wo.operatorName}</td>
                        <td className="px-3 py-2">
                          <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded ${
                            wo.qcStatus === "PASSED" ? "bg-success-bg text-success-text" :
                            wo.qcStatus === "FAILED" ? "bg-danger-bg text-danger" :
                            "bg-pastel/70 text-primary-hover"
                          }`}>
                            {wo.qcStatus}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <Chip tone={statusTone(wo.status)}>{wo.status}</Chip>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => router.push(`/production/${wo.id}/run`)}
                            className={`text-[11px] font-semibold hover:underline cursor-pointer px-2 py-0.5 rounded transition-colors ${
                              wo.status === "PENDING_QC"
                                ? "bg-info-bg text-info hover:bg-info/20 font-bold"
                                : wo.status === "IN_PROGRESS" || wo.status === "DRAFT"
                                ? "bg-pastel text-primary hover:bg-pastel/80"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            {wo.status === "PENDING_QC"
                              ? "Inspect & Pass QC →"
                              : wo.status === "IN_PROGRESS"
                              ? "Worksheet →"
                              : wo.status === "DRAFT"
                              ? "Start Run →"
                              : "View Details →"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Side: Staged Planning Stubs queue */}
        <div className="w-full lg:w-[350px] shrink-0 border border-edge rounded-sm bg-surface flex flex-col min-h-[300px]">
          <header className="flex h-[32px] shrink-0 items-center justify-between border-b border-edge bg-faint px-3">
            <h2 className="text-[11.5px] font-semibold text-ink">Staged Planning Queue</h2>
          </header>
          
          <div className="flex-1 overflow-auto p-3 space-y-3 scroll-thin">
            <p className="text-[11px] text-muted">
              These work orders have been fully staged in the store via FIFO. Select a campaigns stub to schedule its production run.
            </p>

            <div className="space-y-2">
              {placeholders.map((p) => (
                <div key={p.id} className="border border-edge p-3 rounded-sm bg-faint/30 flex flex-col justify-between gap-3 hover:bg-faint/50 transition-colors">
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-primary font-num text-xs">{p.pwoCode}</span>
                      <span className="font-num text-[11px] font-bold text-slate-800">{p.quantityKg.toLocaleString()} kg</span>
                    </div>
                    <h4 className="font-semibold text-slate-800 text-[12px] mt-1.5">{p.materialName}</h4>
                    <p className="font-num text-[10px] text-muted mt-0.5">SKU: {p.materialCode}</p>
                    <p className="text-[10px] text-muted mt-1">Order BOM: <span className="font-num font-semibold">{p.orderBomCode}</span></p>
                  </div>
                  <Button
                    onClick={() => handleOpenSchedule(p)}
                    className="text-[10.5px] py-1 h-auto"
                  >
                    Schedule Run
                  </Button>
                </div>
              ))}

              {placeholders.length === 0 && (
                <div className="text-center py-12 text-muted border border-dashed border-edge rounded-sm text-xs italic">
                  No staged planning work orders ready to schedule. Complete stock allocation first.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scheduling Form Modal Overlay */}
      {isScheduleOpen && selectedPlaceholder && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-sm">
          <div className="h-full w-full max-w-sm bg-surface p-6 shadow-pop flex flex-col border-l border-edge">
            <div className="flex items-center justify-between border-b border-edge pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Schedule Production Run</h3>
                <p className="text-[10.5px] text-muted mt-0.5">Assign configurations for {selectedPlaceholder.pwoCode}</p>
              </div>
              <button
                onClick={() => {
                  setIsScheduleOpen(false);
                  setSelectedPlaceholder(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4 text-xs text-slate-700 scroll-thin">
              <Field label="Selected Target Product">
                <Input value={`${selectedPlaceholder.materialName} (${selectedPlaceholder.materialCode})`} disabled />
              </Field>

              <Field label="Production Resource / Line" required>
                <Select value={resourceId} onChange={(e) => setResourceId(e.target.value)} required>
                  {activeResources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code})
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Work Shift" required>
                <Select value={shift} onChange={(e) => setShift(e.target.value)} required>
                  <option value="Day">Day Shift (08:00 - 20:00)</option>
                  <option value="Night">Night Shift (20:00 - 08:00)</option>
                </Select>
              </Field>

              <Field label="Assigned Operator" required>
                <Select value={operatorId} onChange={(e) => setOperatorId(e.target.value)} required>
                  {operators.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.name} ({op.role})
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Target Yield Quantity (kg)" required>
                <Input
                  type="number"
                  placeholder="Target weight in kg"
                  value={targetQty}
                  onChange={(e) => setTargetQty(e.target.value)}
                  required
                />
              </Field>

              <Field label="Target Warehouse Destination" required>
                <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name} ({wh.code})
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="flex gap-3 border-t border-edge pt-4 shrink-0">
              <Button
                disabled={isPending}
                onClick={handleScheduleSubmit}
                className="flex-1"
              >
                Schedule Run
              </Button>
              <button
                onClick={() => {
                  setIsScheduleOpen(false);
                  setSelectedPlaceholder(null);
                }}
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
