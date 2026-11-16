"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { inspectSalesReturn } from "../../sales-actions";
import { safeAction } from "@/lib/safe-action";
import { Section } from "@/components/detail/record";
import { Button, Input, Textarea, Select } from "@/components/ui/form";
import { Chip, qcTone } from "@/components/ui/chip";
import { kgPlain, titleise } from "@/lib/format";
import { IconCheck, IconAlert, IconClose } from "@/components/icons";

type Line = {
  id: string; lineNo: number;
  projectId: string; projectName: string; projectCode: string; application: string;
  returnedKg: number; restockedKg: number; scrappedKg: number; resendKg: number;
  qcResult: string; qcRemark: string;
};

const RESULTS = ["PENDING", "PASS", "CONDITIONAL", "FAIL"];

/**
 * The inspection bench for material coming back from a customer.
 *
 * Same discipline as an inward receipt: nothing counts as stock until someone has
 * looked at it. Restocked quantity re-enters as a fresh batch tagged to this
 * return, so its history survives — a lot that has been out to a customer and
 * come back is not the same thing as one that never left.
 */
export function ReturnQcPanel({
  returnId,
  status,
  canInspect,
  defaultRemark,
  lines: initial,
}: {
  returnId: string;
  status: string;
  canInspect: boolean;
  defaultRemark: string;
  lines: Line[];
}) {
  const router = useRouter();
  const [lines, setLines] = useState(initial);
  const [remark, setRemark] = useState(defaultRemark);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const settled = !["PENDING_QC", "DRAFT"].includes(status);
  const editable = canInspect && !settled;

  const totals = useMemo(
    () => ({
      returned: lines.reduce((a, l) => a + l.returnedKg, 0),
      restocked: lines.reduce((a, l) => a + l.restockedKg, 0),
      scrapped: lines.reduce((a, l) => a + l.scrappedKg, 0),
      resend: lines.reduce((a, l) => a + (l.resendKg || 0), 0),
    }),
    [lines],
  );

  const invalid = lines.find((l) => l.restockedKg + l.scrappedKg > l.returnedKg + 0.001);
  const unaccounted = lines.find((l) => l.restockedKg + l.scrappedKg < l.returnedKg - 0.001);
  const invalidResend = lines.find((l) => (l.resendKg || 0) > l.restockedKg + l.scrappedKg + 0.001);

  function patch(id: string, next: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...next } : l)));
  }

  function submit() {
    if (invalid) {
      setNotice({
        tone: "err",
        text: `Line ${invalid.lineNo}: back to stock plus scrapped cannot exceed the ${kgPlain(invalid.returnedKg)} kg that came back.`,
      });
      return;
    }
    if (unaccounted) {
      setNotice({
        tone: "err",
        text: `Line ${unaccounted.lineNo}: ${kgPlain(unaccounted.returnedKg - unaccounted.restockedKg - unaccounted.scrappedKg)} kg is unaccounted for. Every kilo has to go back to stock or to scrap.`,
      });
      return;
    }
    if (invalidResend) {
      setNotice({
        tone: "err",
        text: `Line ${invalidResend.lineNo}: resend quantity (${kgPlain(invalidResend.resendKg)}) cannot exceed returned quantity (${kgPlain(invalidResend.restockedKg + invalidResend.scrappedKg)}).`,
      });
      return;
    }
    startTransition(async () => {
      const payload = JSON.stringify(
        lines.map((l) => ({
          lineId: l.id,
          restockedKg: l.restockedKg,
          scrappedKg: l.scrappedKg,
          resendKg: l.resendKg || 0,
          qcResult: l.qcResult === "PENDING" ? (l.restockedKg > 0 ? "PASS" : "FAIL") : l.qcResult,
          qcRemark: l.qcRemark,
        })),
      );
      const res = await safeAction(() => inspectSalesReturn(returnId, payload, remark));
      setNotice(res.error ? { tone: "err", text: res.error } : { tone: "ok", text: res.success! });
      if (!res.error) router.refresh();
    });
  }

  return (
    <Section
      title="Inspection"
      hint={
        settled
          ? "Settled — figures are locked"
          : editable
            ? "Split what came back into stock and scrap, specify resend qty, then settle"
            : "Read only"
      }
      padded={false}
      actions={
        editable ? (
          <Button variant="primary" disabled={pending} onClick={submit}>
            <IconCheck size={13} />
            {pending ? "Settling…" : "Settle return"}
          </Button>
        ) : null
      }
    >
      {notice && (
        <div
          className={`flex items-start gap-2 border-b px-3 py-2 text-[12px] ${
            notice.tone === "ok" ? "border-success/30 bg-success-bg" : "border-danger/30 bg-danger-bg"
          }`}
        >
          {notice.tone === "ok" ? (
            <IconCheck size={14} className="mt-px shrink-0 text-success" />
          ) : (
            <IconAlert size={14} className="mt-px shrink-0 text-danger" />
          )}
          <span className="flex-1 leading-relaxed text-ink">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="text-muted hover:text-ink">
            <IconClose size={11} />
          </button>
        </div>
      )}

      <div className="overflow-x-auto scroll-thin">
        <table className="w-full min-w-[960px]">
          <thead>
            <tr className="border-b border-edge bg-faint">
              {["#", "Compound", "Came back", "Back to stock", "Scrapped", "Resend", "QC", "Finding"].map((h, i) => (
                <th
                  key={h}
                  className={`px-2.5 py-1.5 text-[10.5px] font-semibold text-muted ${i >= 2 && i <= 5 ? "text-right" : "text-left"}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const over = l.restockedKg + l.scrappedKg > l.returnedKg + 0.001;
              const short = l.restockedKg + l.scrappedKg < l.returnedKg - 0.001;
              const overResend = (l.resendKg || 0) > l.restockedKg + l.scrappedKg + 0.001;
              return (
                <tr key={l.id} className="border-b border-edge/60 align-top last:border-b-0">
                  <td className="px-2.5 py-2 font-num text-[12px] text-muted">{l.lineNo}</td>
                  <td className="px-2.5 py-2">
                    <Link href={`/projects/${l.projectId}`} className="ref-link text-[12px]">
                      {l.projectName}
                    </Link>
                    <span className="block text-[11px] text-muted">
                      {l.projectCode} · {l.application}
                    </span>
                  </td>
                  <td className="px-2.5 py-2 text-right font-num text-[12px] tabular-nums">
                    {kgPlain(l.returnedKg)}
                    {short && editable && (
                      <span className="block text-[10.5px] text-warning">
                        {kgPlain(l.returnedKg - l.restockedKg - l.scrappedKg)} unaccounted
                      </span>
                    )}
                  </td>
                  <td className="w-[128px] px-2.5 py-2">
                    {editable ? (
                      <Input
                        type="number" min={0} step={0.001} value={l.restockedKg}
                        onChange={(e) => patch(l.id, { restockedKg: Number(e.target.value) || 0 })}
                        className={`text-right ${over ? "border-danger" : ""}`}
                      />
                    ) : (
                      <span className="block text-right font-num text-[12px] font-medium tabular-nums text-success-text">
                        {l.restockedKg > 0 ? kgPlain(l.restockedKg) : "—"}
                      </span>
                    )}
                  </td>
                  <td className="w-[128px] px-2.5 py-2">
                    {editable ? (
                      <Input
                        type="number" min={0} step={0.001} value={l.scrappedKg}
                        onChange={(e) => patch(l.id, { scrappedKg: Number(e.target.value) || 0 })}
                        className={`text-right ${over ? "border-danger" : ""}`}
                      />
                    ) : (
                      <span className={`block text-right font-num text-[12px] tabular-nums ${l.scrappedKg > 0 ? "text-danger-text" : "text-muted"}`}>
                        {l.scrappedKg > 0 ? kgPlain(l.scrappedKg) : "—"}
                      </span>
                    )}
                  </td>
                  <td className="w-[128px] px-2.5 py-2">
                    {editable ? (
                      <Input
                        type="number" min={0} step={0.001} value={l.resendKg || 0}
                        onChange={(e) => patch(l.id, { resendKg: Number(e.target.value) || 0 })}
                        className={`text-right ${overResend ? "border-danger" : ""}`}
                      />
                    ) : (
                      <span className="block text-right font-num text-[12px] font-medium tabular-nums text-primary-text">
                        {l.resendKg > 0 ? kgPlain(l.resendKg) : "—"}
                      </span>
                    )}
                  </td>
                  <td className="w-[136px] px-2.5 py-2">
                    {editable ? (
                      <Select value={l.qcResult} onChange={(e) => patch(l.id, { qcResult: e.target.value })}>
                        {RESULTS.map((r) => (
                          <option key={r} value={r}>{titleise(r)}</option>
                        ))}
                      </Select>
                    ) : (
                      <Chip tone={qcTone(l.qcResult)}>{titleise(l.qcResult)}</Chip>
                    )}
                  </td>
                  <td className="px-2.5 py-2">
                    {editable ? (
                      <Input
                        value={l.qcRemark}
                        onChange={(e) => patch(l.id, { qcRemark: e.target.value })}
                        placeholder="What did you find?"
                      />
                    ) : (
                      <span className="text-[11.5px] text-muted">{l.qcRemark || "—"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-edge bg-faint">
              <td colSpan={2} className="px-2.5 py-2 text-[11.5px] font-medium text-ink">Totals</td>
              <td className="px-2.5 py-2 text-right font-num text-[12px] tabular-nums">{kgPlain(totals.returned)}</td>
              <td className="px-2.5 py-2 text-right font-num text-[12px] font-semibold tabular-nums text-success-text">
                {kgPlain(totals.restocked)}
              </td>
              <td className="px-2.5 py-2 text-right font-num text-[12px] tabular-nums text-danger-text">
                {totals.scrapped > 0 ? kgPlain(totals.scrapped) : "—"}
              </td>
              <td className="px-2.5 py-2 text-right font-num text-[12px] font-semibold tabular-nums text-primary-text">
                {totals.resend > 0 ? kgPlain(totals.resend) : "—"}
              </td>
              <td colSpan={2} className="px-2.5 py-2 text-[11.5px] text-muted">
                {totals.returned > 0 && `${((totals.restocked / totals.returned) * 100).toFixed(0)}% recovered`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {editable && (
        <div className="border-t border-edge p-3">
          <label className="mb-1 block text-[11.5px] font-medium text-ink">Inspection remark</label>
          <Textarea
            rows={2}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="What was re-tested, and what the result was."
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            Settling creates a fresh batch for every restocked quantity, tagged to this return, and writes both
            the return and the scrap into the stock ledger. Scrapped material does not come back as stock.
          </p>
        </div>
      )}
    </Section>
  );
}
