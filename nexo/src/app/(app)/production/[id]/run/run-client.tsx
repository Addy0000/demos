"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Chip, Tone } from "@/components/ui/chip";
import { Button, Input, Field } from "@/components/ui/form";
import {
  startDirectManufacturingRun,
  completeDirectManufacturingRun,
  submitQcVerdict,
} from "../../actions";

type DmwoDetail = {
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
  materialName: string;
  materialCode: string;
  processLog: string;
  metrics: { label: string; value: string }[];
  createdAt: string;
  qcPlaceholder?: {
    id: string;
    status: string;
    verdictByName?: string | null;
    verdictAt?: string | null;
    notes?: string | null;
  } | null;
  batch?: {
    batchNo: string;
    status: string;
    availableQtyKg: number;
    receivedQtyKg: number;
    warehouseName: string;
  } | null;
};

export function RunClient({ dmwo }: { dmwo: DmwoDetail }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Worksheet State
  const [actualQtyKg, setActualQtyKg] = useState(dmwo.actualQtyKg?.toString() ?? dmwo.targetQtyKg.toString());
  const [processLog, setProcessLog] = useState(dmwo.processLog);
  const [metrics, setMetrics] = useState<{ label: string; value: string }[]>(dmwo.metrics);

  // QC Review State
  const [qcNotes, setQcNotes] = useState(dmwo.qcPlaceholder?.notes ?? "");

  const handleStartRun = () => {
    setError(null);
    setSuccessMessage(null);

    startTransition(async () => {
      try {
        await startDirectManufacturingRun(dmwo.id);
        setSuccessMessage("Production run successfully started! Process sheet activated.");
        router.refresh();
      } catch (err: any) {
        setError(err.message ?? "Failed to start run.");
      }
    });
  };

  const handleCompleteRun = () => {
    setError(null);
    setSuccessMessage(null);

    // Validate inputs
    const actual = parseFloat(actualQtyKg);
    if (isNaN(actual) || actual <= 0) {
      setError("Please enter a valid actual yield quantity (greater than 0).");
      return;
    }

    // Validate metrics fields are not empty
    for (const m of metrics) {
      if (!m.label.trim() || !m.value.trim()) {
        setError("All custom metrics must have both a label and a value.");
        return;
      }
    }

    startTransition(async () => {
      try {
        const result = await completeDirectManufacturingRun({
          id: dmwo.id,
          actualQtyKg: actual,
          processLog,
          metrics,
        });

        setSuccessMessage(
          `Production run complete! Staged raw materials deducted from inventory, yield batch ${result.batchNo} created in quarantine.`
        );
        router.push("/production");
      } catch (err: any) {
        setError(err.message ?? "Failed to complete run.");
      }
    });
  };

  const handleQcVerdict = (verdict: "PASSED" | "FAILED") => {
    setError(null);
    setSuccessMessage(null);

    startTransition(async () => {
      try {
        await submitQcVerdict({
          dmwoId: dmwo.id,
          verdict,
          notes: qcNotes,
        });

        setSuccessMessage(
          verdict === "PASSED"
            ? `QC Verdict PASSED! Finished goods batch ${dmwo.batch?.batchNo ?? "B-CP-" + dmwo.code} released to AVAILABLE stock in ${dmwo.warehouseName}.`
            : `QC Verdict FAILED. Work order and finished goods batch ${dmwo.batch?.batchNo ?? "B-CP-" + dmwo.code} marked as REJECTED.`
        );
        router.refresh();
      } catch (err: any) {
        setError(err.message ?? "Failed to submit QC verdict.");
      }
    });
  };

  const handleAddMetric = () => {
    setMetrics([...metrics, { label: "", value: "" }]);
  };

  const handleRemoveMetric = (index: number) => {
    setMetrics(metrics.filter((_, i) => i !== index));
  };

  const handleMetricChange = (index: number, field: "label" | "value", val: string) => {
    const updated = [...metrics];
    updated[index][field] = val;
    setMetrics(updated);
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
      <div className="flex h-[42px] shrink-0 items-center gap-3 border-b border-edge bg-faint px-3">
        <button
          onClick={() => router.push("/production")}
          className="text-[11.5px] font-semibold text-primary hover:underline cursor-pointer"
        >
          &larr; Back to Dashboard
        </button>
        <span className="text-edge">|</span>
        <h1 className="shrink-0 text-[14px] font-semibold tracking-tight text-ink">
          Production Run Console — {dmwo.code}
        </h1>
        <Chip tone={statusTone(dmwo.status)}>{dmwo.status}</Chip>
      </div>

      {/* Banners */}
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

      {/* Main Workspace Panels */}
      <div className="flex-1 overflow-auto bg-canvas p-6 scroll-thin">
        <div className="max-w-xl mx-auto space-y-6">
          {/* Target Product Specification Card */}
          <div className="border border-edge rounded-sm p-4 bg-surface space-y-3">
            <div className="flex justify-between items-start border-b border-edge pb-2">
              <div>
                <h2 className="text-sm font-bold text-slate-800">{dmwo.materialName}</h2>
                <p className="text-[10.5px] text-muted mt-0.5">SKU: {dmwo.materialCode}</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-muted uppercase block">Target Staged</span>
                <span className="font-num text-sm font-bold text-slate-800">{dmwo.targetQtyKg.toLocaleString()} kg</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-[11.5px] text-muted">
              <div>
                <span>Line/Resource</span>
                <p className="font-semibold text-slate-700 mt-0.5">{dmwo.resourceName}</p>
              </div>
              <div>
                <span>Shift</span>
                <p className="font-semibold text-slate-700 mt-0.5">{dmwo.shift} Shift</p>
              </div>
              <div>
                <span>Assigned Operator</span>
                <p className="font-semibold text-slate-700 mt-0.5">{dmwo.operatorName}</p>
              </div>
            </div>
          </div>

          {/* DRAFT STATE: KICKOFF RUN */}
          {dmwo.status === "DRAFT" && (
            <div className="border border-dashed border-edge rounded-sm bg-surface p-8 text-center space-y-4">
              <h3 className="font-bold text-[13px] text-slate-800">Ready to Start Production Run</h3>
              <p className="text-xs text-muted max-w-sm mx-auto leading-relaxed">
                Clicking the button will change the job status to **IN PROGRESS** and activate the operator process worksheet metrics entry fields.
              </p>
              <Button
                disabled={isPending}
                onClick={handleStartRun}
                className="w-full max-w-[200px]"
              >
                Start Run
              </Button>
            </div>
          )}

          {/* IN_PROGRESS STATE: OPERATOR WORKSHEET FORM */}
          {dmwo.status === "IN_PROGRESS" && (
            <div className="border border-edge rounded-sm bg-surface p-5 space-y-5">
              <h3 className="font-bold text-[13px] text-slate-800 border-b border-edge pb-2">
                Production Run Worksheet
              </h3>

              {/* Actual Yield Input */}
              <Field label="Actual Yield Output (kg)" required>
                <Input
                  type="number"
                  placeholder="Enter finalized scale weight"
                  value={actualQtyKg}
                  onChange={(e) => setActualQtyKg(e.target.value)}
                  disabled={isPending}
                  required
                />
                <p className="text-[10px] text-muted mt-1 leading-normal">
                  Deductions of component raw material stocks will be scaled against target proportions based on this yield value.
                </p>
              </Field>

              {/* Operator notes (generic processLog) */}
              <Field label="Operator Process Observation Logs / Notes">
                <textarea
                  className="w-full rounded border border-edge p-2.5 text-xs text-slate-800 min-h-[90px] focus:outline-none focus:border-primary transition-colors bg-surface"
                  placeholder="Enter process observations, operational notes, or run remarks..."
                  value={processLog}
                  onChange={(e) => setProcessLog(e.target.value)}
                  disabled={isPending}
                />
              </Field>

              {/* Dynamic Metrics Builder (Fully Generic Key-Value Pairs) */}
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b border-edge pb-1.5">
                  <span className="font-bold text-[11px] text-slate-800 uppercase tracking-wider">
                    Process Parameters & Metrics
                  </span>
                  <button
                    type="button"
                    onClick={handleAddMetric}
                    className="text-primary hover:text-primary-hover font-semibold text-[11px]"
                  >
                    + Add Parameter Field
                  </button>
                </div>

                <p className="text-[10px] text-muted leading-relaxed">
                  Add dynamic metric rows to record process parameters (e.g. line speeds, process pressures, or operational readings) without hardcoded fields.
                </p>

                <div className="space-y-2">
                  {metrics.map((m, idx) => (
                    <div key={idx} className="flex gap-3 items-center">
                      <div className="flex-1">
                        <Input
                          placeholder="Parameter Name (e.g. Line Speed, Pressure)"
                          value={m.label}
                          onChange={(e) => handleMetricChange(idx, "label", e.target.value)}
                          disabled={isPending}
                          required
                        />
                      </div>
                      <div className="flex-1">
                        <Input
                          placeholder="Value (e.g. 185 C)"
                          value={m.value}
                          onChange={(e) => handleMetricChange(idx, "value", e.target.value)}
                          disabled={isPending}
                          required
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveMetric(idx)}
                        className="text-danger hover:text-danger-hover text-xs font-bold px-1"
                        title="Remove Parameter"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                  {metrics.length === 0 && (
                    <p className="text-xs text-muted italic py-1">No custom process parameters added yet.</p>
                  )}
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="flex gap-3 border-t border-edge pt-4">
                <Button
                  disabled={isPending}
                  onClick={handleCompleteRun}
                  className="flex-1"
                >
                  Complete Run & Send to QC
                </Button>
                <button
                  onClick={() => router.push("/production")}
                  className="flex-1 rounded border border-edge text-[11px] font-semibold py-1.5 hover:bg-faint text-slate-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* PENDING_QC STATE: QC VERDICT REVIEW & RELEASE SCREEN (PRD-4) */}
          {dmwo.status === "PENDING_QC" && (
            <div className="border border-info/30 rounded-sm bg-surface p-5 space-y-5 shadow-sm">
              <div className="flex justify-between items-center border-b border-edge pb-2.5">
                <div>
                  <h3 className="font-bold text-[13px] text-slate-900">
                    Quality Gate Inspection & Stock Release
                  </h3>
                  <p className="text-[11px] text-muted mt-0.5">
                    Review yield batch specs, operator process worksheet, and submit the final inspection verdict.
                  </p>
                </div>
                <span className="bg-info-bg text-info px-2 py-0.5 text-[10px] font-bold rounded uppercase">
                  Awaiting QC Verdict
                </span>
              </div>

              {/* Batch Staging Details */}
              <div className="border border-edge rounded bg-faint/30 p-3 space-y-2">
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">
                  Finished Goods Batch Staging
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-muted block text-[10.5px]">Batch Number</span>
                    <span className="font-num font-bold text-primary text-xs">
                      {dmwo.batch?.batchNo ?? `B-CP-${dmwo.code}`}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted block text-[10.5px]">Batch Quantity</span>
                    <span className="font-num font-bold text-slate-800 text-xs">
                      {dmwo.actualQtyKg?.toLocaleString()} kg
                    </span>
                  </div>
                  <div>
                    <span className="text-muted block text-[10.5px]">Current Status</span>
                    <span className="font-semibold text-warning-text bg-warning-bg/40 px-1.5 py-0.5 rounded text-[10px]">
                      {dmwo.batch?.status ?? "QUARANTINE"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted block text-[10.5px]">Destination Store</span>
                    <span className="font-semibold text-slate-800 text-xs">
                      {dmwo.warehouseName}
                    </span>
                  </div>
                </div>
              </div>

              {/* Operator Process Worksheet Review */}
              <div className="border border-edge rounded bg-surface p-3 space-y-3">
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider block border-b border-edge pb-1">
                  Manufacturing Process Entry Review
                </span>
                
                <div>
                  <span className="text-[11px] text-muted font-medium">Operator Observations / Notes:</span>
                  <p className="text-xs text-slate-800 bg-faint p-2.5 rounded border border-edge mt-1 whitespace-pre-wrap leading-relaxed">
                    {dmwo.processLog || "No operator process notes logged."}
                  </p>
                </div>

                <div>
                  <span className="text-[11px] text-muted font-medium block mb-1.5">Recorded Process Parameters:</span>
                  <div className="grid grid-cols-2 gap-2">
                    {dmwo.metrics.map((m, idx) => (
                      <div key={idx} className="flex justify-between items-center border border-edge p-2 bg-faint/30 rounded text-xs">
                        <span className="text-muted font-medium">{m.label}:</span>
                        <span className="font-semibold text-slate-800">{m.value}</span>
                      </div>
                    ))}
                    {dmwo.metrics.length === 0 && (
                      <p className="text-xs text-muted italic col-span-2">No custom process parameters recorded.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* QC Verdict Form Controls */}
              <div className="space-y-4 border-t border-edge pt-3">
                <Field label="QC Inspection Notes / Test Observations">
                  <textarea
                    className="w-full rounded border border-edge p-2.5 text-xs text-slate-800 min-h-[70px] focus:outline-none focus:border-primary transition-colors bg-surface"
                    placeholder="Enter inspection remarks, QA test results (e.g. visual, density, hardness), or rejection reasoning..."
                    value={qcNotes}
                    onChange={(e) => setQcNotes(e.target.value)}
                    disabled={isPending}
                  />
                </Field>

                <div className="flex flex-col sm:flex-row gap-3 pt-1">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleQcVerdict("PASSED")}
                    className="flex-1 rounded bg-[var(--primary)] text-white hover:bg-[var(--success-text)] py-2.5 px-4 text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <span className="text-sm font-black">✓</span> Pass QC & Release to Stock
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleQcVerdict("FAILED")}
                    className="flex-1 rounded border-2 border-danger text-danger hover:bg-danger-bg py-2.5 px-4 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <span className="text-sm font-black">✕</span> Reject Batch
                  </button>
                </div>
                <p className="text-[10px] text-muted text-center leading-normal">
                  Passing releases batch to <strong>AVAILABLE</strong> status in store. Rejecting sets status to <strong>REJECTED</strong>.
                </p>
              </div>
            </div>
          )}

          {/* COMPLETED OR REJECTED STATE: QC VERDICT RECORD & RUN SUMMARY */}
          {(dmwo.status === "COMPLETED" || dmwo.status === "REJECTED") && (
            <div className="space-y-5">
              {/* QC Inspection Certificate Card */}
              <div className={`border rounded-sm bg-surface p-5 space-y-4 ${
                dmwo.status === "COMPLETED" ? "border-success/30" : "border-danger/30"
              }`}>
                <div className="flex justify-between items-center border-b border-edge pb-2.5">
                  <div>
                    <h3 className="font-bold text-[13px] text-slate-900">
                      Quality Gate Inspection Record
                    </h3>
                    <p className="text-[11px] text-muted mt-0.5">
                      Formal quality inspection decision for this manufacturing run.
                    </p>
                  </div>
                  <Chip tone={statusTone(dmwo.status)}>
                    {dmwo.qcPlaceholder?.status ?? (dmwo.status === "COMPLETED" ? "PASSED" : "FAILED")}
                  </Chip>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-b border-edge pb-3">
                  <div>
                    <span className="text-muted block text-[10.5px]">Batch Number</span>
                    <span className="font-num font-bold text-primary text-xs">
                      {dmwo.batch?.batchNo ?? `B-CP-${dmwo.code}`}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted block text-[10.5px]">Batch State</span>
                    <span className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${
                      dmwo.status === "COMPLETED" ? "bg-success-bg text-success-text" : "bg-danger-bg text-danger"
                    }`}>
                      {dmwo.batch?.status ?? (dmwo.status === "COMPLETED" ? "AVAILABLE" : "REJECTED")}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted block text-[10.5px]">Inspected By</span>
                    <span className="font-semibold text-slate-800 text-xs">
                      {dmwo.qcPlaceholder?.verdictByName ?? "Admin Operator"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted block text-[10.5px]">Verdict Date</span>
                    <span className="font-semibold text-slate-800 text-xs">
                      {dmwo.qcPlaceholder?.verdictAt
                        ? new Date(dmwo.qcPlaceholder.verdictAt).toLocaleDateString()
                        : "—"}
                    </span>
                  </div>
                </div>

                {dmwo.qcPlaceholder?.notes && (
                  <div>
                    <span className="text-muted text-[11px] font-bold uppercase tracking-wider block mb-1">
                      Inspector Remarks:
                    </span>
                    <p className="text-xs text-slate-800 bg-faint p-2.5 rounded border border-edge whitespace-pre-wrap leading-relaxed">
                      {dmwo.qcPlaceholder.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Manufacturing Worksheet Log Summary */}
              <div className="border border-edge rounded-sm bg-surface p-5 space-y-4">
                <h3 className="font-bold text-[13px] text-slate-800 border-b border-edge pb-2">
                  Production Run Process Summary
                </h3>

                <div className="grid grid-cols-2 gap-4 text-xs text-slate-700 border-b border-edge pb-3">
                  <div>
                    <span className="text-muted block">Final Yield Output</span>
                    <span className="font-num font-bold text-slate-800 text-sm mt-0.5 inline-block">
                      {dmwo.actualQtyKg?.toLocaleString()} kg
                    </span>
                  </div>
                  <div>
                    <span className="text-muted block">Production Started</span>
                    <span className="font-semibold text-slate-800 mt-0.5 inline-block">
                      {new Date(dmwo.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Read-Only notes */}
                {dmwo.processLog && (
                  <div className="space-y-1">
                    <span className="text-muted text-[11px] font-bold uppercase tracking-wider">
                      Operator Observations / Notes
                    </span>
                    <p className="text-xs text-slate-800 bg-faint p-2.5 rounded border border-edge whitespace-pre-wrap leading-relaxed">
                      {dmwo.processLog}
                    </p>
                  </div>
                )}

                {/* Read-Only metrics */}
                <div className="space-y-2">
                  <span className="text-muted text-[11px] font-bold uppercase tracking-wider block">
                    Recorded Parameters & Metrics
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {dmwo.metrics.map((m, idx) => (
                      <div key={idx} className="flex justify-between items-center border border-edge p-2 bg-faint/30 rounded-sm text-xs">
                        <span className="text-muted font-medium">{m.label}:</span>
                        <span className="font-semibold text-slate-800">{m.value}</span>
                      </div>
                    ))}
                    {dmwo.metrics.length === 0 && (
                      <p className="text-xs text-muted italic col-span-2">No custom parameters logged.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
