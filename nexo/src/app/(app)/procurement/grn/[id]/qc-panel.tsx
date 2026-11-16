"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { postGoodsReceipt } from "../../actions";
import { Section } from "@/components/detail/record";
import { Button, Input, Textarea, Select } from "@/components/ui/form";
import { Chip, qcTone, batchStatusTone } from "@/components/ui/chip";
import { kgPlain, amount, titleise } from "@/lib/format";
import { IconCheck, IconAlert, IconClose } from "@/components/icons";

type Line = {
  id: string; lineNo: number; materialId: string; materialCode: string; materialName: string;
  grade: string; orderedKg: number; challanKg: number; receivedKg: number;
  acceptedKg: number; rejectedKg: number; rate: number;
  qcResult: string; qcRemark: string;
  batchId: string | null; batchNo: string | null; batchStatus: string | null;
  debitNote?: { id: string; number: string; quantityKg: number } | null;
};

const RESULTS = ["PENDING", "PASS", "CONDITIONAL", "FAIL"];

/**
 * The inspection bench. Accepted quantity here becomes a traceable batch and a
 * ledger movement — so the numbers are editable until the receipt is posted,
 * and locked afterwards.
 */
export function QcPanel({
  grnId,
  status,
  canInspect,
  defaultRemark,
  lines: initial,
}: {
  grnId: string;
  status: string;
  canInspect: boolean;
  defaultRemark: string;
  lines: Line[];
}) {
  const [lines, setLines] = useState(initial);
  const [remark, setRemark] = useState(defaultRemark);
  const [notice, setNotice] = useState<{ tone: "ok" | "err" | "warn"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const posted = status === "POSTED";

  const totals = useMemo(
    () => ({
      challan: lines.reduce((a, l) => a + l.challanKg, 0),
      received: lines.reduce((a, l) => a + l.receivedKg, 0),
      accepted: lines.reduce((a, l) => a + l.acceptedKg, 0),
      rejected: lines.reduce((a, l) => a + l.rejectedKg, 0),
      value: lines.reduce((a, l) => a + l.acceptedKg * l.rate, 0),
    }),
    [lines],
  );

  const invalid = lines.find((l) => l.acceptedKg + l.rejectedKg > l.receivedKg + 0.001);

  function patch(id: string, next: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...next } : l)));
  }

  function updateRejected(line: Line, rawValue: string) {
    if (notice?.tone === "err") setNotice(null);
    const num = rawValue === "" ? 0 : Math.max(0, parseFloat(rawValue) || 0);
    const clampedRejected = Math.min(line.receivedKg, num);
    const rejectedKg = Number(clampedRejected.toFixed(3));
    const acceptedKg = Number(Math.max(0, line.receivedKg - rejectedKg).toFixed(3));

    let qcResult = line.qcResult;
    if (rejectedKg >= line.receivedKg - 0.001) {
      qcResult = "FAIL";
    } else if (rejectedKg > 0 && acceptedKg > 0) {
      if (qcResult === "PASS" || qcResult === "PENDING") {
        qcResult = "CONDITIONAL";
      }
    } else if (rejectedKg === 0) {
      if (qcResult === "FAIL" || qcResult === "CONDITIONAL") {
        qcResult = "PASS";
      }
    }

    patch(line.id, {
      rejectedKg,
      acceptedKg,
      qcResult,
    });
  }

  function updateAccepted(line: Line, rawValue: string) {
    if (notice?.tone === "err") setNotice(null);
    const num = rawValue === "" ? 0 : Math.max(0, parseFloat(rawValue) || 0);
    const clampedAccepted = Math.min(line.receivedKg, num);
    const acceptedKg = Number(clampedAccepted.toFixed(3));
    const rejectedKg = Number(Math.max(0, line.receivedKg - acceptedKg).toFixed(3));

    let qcResult = line.qcResult;
    if (acceptedKg >= line.receivedKg - 0.001) {
      qcResult = "PASS";
    } else if (acceptedKg === 0) {
      qcResult = "FAIL";
    } else if (acceptedKg > 0 && rejectedKg > 0) {
      if (qcResult === "PASS" || qcResult === "PENDING") {
        qcResult = "CONDITIONAL";
      }
    }

    patch(line.id, {
      acceptedKg,
      rejectedKg,
      qcResult,
    });
  }

  function updateQcResult(line: Line, nextResult: string) {
    if (notice?.tone === "err") setNotice(null);
    if (nextResult === "PASS") {
      patch(line.id, {
        qcResult: "PASS",
        acceptedKg: line.receivedKg,
        rejectedKg: 0,
      });
    } else if (nextResult === "FAIL") {
      patch(line.id, {
        qcResult: "FAIL",
        acceptedKg: 0,
        rejectedKg: line.receivedKg,
      });
    } else if (nextResult === "CONDITIONAL") {
      patch(line.id, {
        qcResult: "CONDITIONAL",
      });
    } else {
      patch(line.id, {
        qcResult: nextResult,
      });
    }
  }

  function post() {
    if (invalid) {
      setNotice({
        tone: "err",
        text: `Line ${invalid.lineNo}: accepted plus rejected cannot exceed the ${kgPlain(invalid.receivedKg)} kg weighed in.`,
      });
      return;
    }
    startTransition(async () => {
      const payload = JSON.stringify(
        lines.map((l) => ({
          lineId: l.id,
          acceptedQtyKg: l.acceptedKg,
          rejectedQtyKg: l.rejectedKg,
          qcResult: l.qcResult === "PENDING" ? "PASS" : l.qcResult,
          qcRemark: l.qcRemark,
        })),
      );
      const res = await postGoodsReceipt(grnId, payload, remark);
      if (res.error) {
        setNotice({ tone: "err", text: res.error });
      } else if (res.warning) {
        setNotice({ tone: "warn", text: `${res.success ? `${res.success} ` : ""}${res.warning}` });
      } else {
        setNotice({ tone: "ok", text: res.success! });
      }
    });
  }

  return (
    <Section
      title="Inspection & posting"
      hint={posted ? "Posted to stock — figures are locked" : canInspect ? "Enter the QC outcome, then post to stock" : "Read only"}
      padded={false}
      actions={
        canInspect && !posted ? (
          <Button variant="primary" disabled={pending} onClick={post}>
            <IconCheck size={13} />
            {pending ? "Posting…" : "Post to stock"}
          </Button>
        ) : null
      }
    >
      {notice && (
        <div
          className={`flex items-start gap-2 border-b px-3 py-2 text-[12px] ${
            notice.tone === "ok"
              ? "border-success/30 bg-success-bg"
              : notice.tone === "warn"
                ? "border-warning/30 bg-warning-bg"
                : "border-danger/30 bg-danger-bg"
          }`}
        >
          {notice.tone === "ok" ? (
            <IconCheck size={14} className="mt-px shrink-0 text-success" />
          ) : (
            <IconAlert size={14} className={`mt-px shrink-0 ${notice.tone === "warn" ? "text-warning" : "text-danger"}`} />
          )}
          <span className="flex-1 text-ink">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="text-muted hover:text-ink">
            <IconClose size={11} />
          </button>
        </div>
      )}

      <div className="overflow-x-auto scroll-thin">
        <table className="w-full min-w-[1000px]">
          <thead>
            <tr className="border-b border-edge bg-faint">
              {["#", "Material", "Ordered", "Challan", "Weighed", "Accepted", "Rejected", "QC", "Batch", "Value"].map((h, i) => (
                <th
                  key={h}
                  className={`px-2.5 py-1.5 text-[10.5px] font-semibold text-muted ${i >= 2 && i <= 6 || i === 9 ? "text-right" : "text-left"}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const shortfall = l.challanKg - l.receivedKg;
              const over = l.acceptedKg + l.rejectedKg > l.receivedKg + 0.001;
              return (
                <tr key={l.id} className="border-b border-edge/60 last:border-b-0 align-top">
                  <td className="px-2.5 py-2 font-num text-[12px] text-muted">{l.lineNo}</td>
                  <td className="px-2.5 py-2">
                    <Link href={`/procurement/materials/${l.materialId}`} className="ref-link text-[12px]">
                      {l.materialName}
                    </Link>
                    <span className="block font-num text-[11px] text-muted">
                      {l.materialCode}{l.grade && ` · ${l.grade}`}
                    </span>
                  </td>
                  <td className="px-2.5 py-2 text-right font-num text-[12px] tabular-nums text-muted">{kgPlain(l.orderedKg)}</td>
                  <td className="px-2.5 py-2 text-right font-num text-[12px] tabular-nums text-muted">{kgPlain(l.challanKg)}</td>
                  <td className="px-2.5 py-2 text-right font-num text-[12px] tabular-nums">
                    {kgPlain(l.receivedKg)}
                    {shortfall > 0.001 && (
                      <span className="block text-[10.5px] text-warning">−{kgPlain(shortfall)} short</span>
                    )}
                  </td>
                  <td className="w-[128px] px-2.5 py-2">
                    {posted || !canInspect ? (
                      <span className="block text-right font-num text-[12px] font-medium tabular-nums text-success">
                        {kgPlain(l.acceptedKg)}
                      </span>
                    ) : (
                      <Input
                        type="number" min={0} max={l.receivedKg} step="any" value={l.acceptedKg}
                        onChange={(e) => updateAccepted(l, e.target.value)}
                        className={`text-right ${over ? "border-danger" : ""}`}
                      />
                    )}
                  </td>
                  <td className="w-[128px] px-2.5 py-2">
                    {posted || !canInspect ? (
                      <div>
                        <span className={`block text-right font-num text-[12px] tabular-nums ${l.rejectedKg > 0 ? "text-danger" : "text-muted"}`}>
                          {l.rejectedKg > 0 ? kgPlain(l.rejectedKg) : "—"}
                        </span>
                        {l.debitNote && (
                          <Link
                            href={`/purchase/debit-notes/${l.debitNote.id}`}
                            className="ref-link block text-right font-num text-[10.5px] text-amber-700 hover:text-amber-800"
                            title={`Debit note ${l.debitNote.number} (${kgPlain(l.debitNote.quantityKg)})`}
                          >
                            {l.debitNote.number} →
                          </Link>
                        )}
                      </div>
                    ) : (
                      <>
                        <Input
                          type="number" min={0} max={l.receivedKg} step="any" value={l.rejectedKg}
                          onChange={(e) => updateRejected(l, e.target.value)}
                          className={`text-right ${over ? "border-danger" : ""}`}
                        />
                        {l.debitNote && (
                          <Link
                            href={`/purchase/debit-notes/${l.debitNote.id}`}
                            className="ref-link block text-right font-num text-[10.5px] text-amber-700 hover:text-amber-800 mt-0.5"
                          >
                            {l.debitNote.number} →
                          </Link>
                        )}
                      </>
                    )}
                  </td>
                  <td className="w-[140px] px-2.5 py-2">
                    {posted || !canInspect ? (
                      <Chip tone={qcTone(l.qcResult)}>{titleise(l.qcResult)}</Chip>
                    ) : (
                      <>
                        <Select value={l.qcResult} onChange={(e) => updateQcResult(l, e.target.value)}>
                          {RESULTS.map((r) => (
                            <option key={r} value={r}>{titleise(r)}</option>
                          ))}
                        </Select>
                        {(l.qcResult === "CONDITIONAL" || l.qcResult === "FAIL") && (
                          <Input
                            value={l.qcRemark}
                            onChange={(e) => patch(l.id, { qcRemark: e.target.value })}
                            placeholder="What failed?"
                            className="mt-1"
                          />
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-2.5 py-2">
                    {l.batchId ? (
                      <>
                        <Link href={`/procurement/inventory/${l.batchId}`} className="ref-link font-num text-[11.5px]">
                          {l.batchNo}
                        </Link>
                        {l.batchStatus && (
                          <span className="mt-0.5 block">
                            <Chip tone={batchStatusTone(l.batchStatus)}>{titleise(l.batchStatus)}</Chip>
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[11.5px] text-muted">On posting</span>
                    )}
                  </td>
                  <td className="px-2.5 py-2 text-right font-num text-[12px] tabular-nums">
                    {amount(l.acceptedKg * l.rate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-edge bg-faint">
              <td colSpan={2} className="px-2.5 py-2 text-[11.5px] font-medium text-ink">Totals</td>
              <td className="px-2.5 py-2 text-right font-num text-[12px] tabular-nums text-muted">—</td>
              <td className="px-2.5 py-2 text-right font-num text-[12px] tabular-nums text-muted">{kgPlain(totals.challan)}</td>
              <td className="px-2.5 py-2 text-right font-num text-[12px] tabular-nums">{kgPlain(totals.received)}</td>
              <td className="px-2.5 py-2 text-right font-num text-[12px] font-semibold tabular-nums text-success">{kgPlain(totals.accepted)}</td>
              <td className="px-2.5 py-2 text-right font-num text-[12px] tabular-nums text-danger">
                {totals.rejected > 0 ? kgPlain(totals.rejected) : "—"}
              </td>
              <td colSpan={2} />
              <td className="px-2.5 py-2 text-right font-num text-[12.5px] font-semibold tabular-nums text-ink">
                {amount(totals.value)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {canInspect && !posted && (
        <div className="border-t border-edge p-3">
          <label className="mb-1 block text-[11.5px] font-medium text-ink">Inspection remark</label>
          <Textarea
            rows={2}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="Moisture, bulk density, appearance — whatever the sampling plan called for."
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            Posting creates a traceable batch for every accepted quantity, writes a GRN receipt into the
            stock ledger, and moves the purchase order's received total. A line marked Fail posts nothing
            to available stock.
          </p>
        </div>
      )}
    </Section>
  );
}
