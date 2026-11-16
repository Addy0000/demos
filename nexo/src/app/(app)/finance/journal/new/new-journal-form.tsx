"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Select, Field, FormError } from "@/components/ui/form";
import { money } from "@/lib/format";
import { IconPlus, IconClose } from "@/components/icons";

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
};

type Party = {
  id: string;
  name: string;
  code: string;
};

type FormLine = {
  id: number;
  accountCode: string;
  side: "DEBIT" | "CREDIT";
  amount: string;
  customerId: string;
  vendorId: string;
  remark: string;
};

function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function NewJournalForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const maxDate = todayIso();

  const [dateVal, setDateVal] = useState<string>(maxDate);
  const [narration, setNarration] = useState<string>("");
  const [lines, setLines] = useState<FormLine[]>([
    { id: 1, accountCode: "", side: "DEBIT", amount: "", customerId: "", vendorId: "", remark: "" },
    { id: 2, accountCode: "", side: "CREDIT", amount: "", customerId: "", vendorId: "", remark: "" },
  ]);
  const [nextId, setNextId] = useState(3);

  const [customers, setCustomers] = useState<Party[]>([]);
  const [vendors, setVendors] = useState<Party[]>([]);
  const [loadingParties, setLoadingParties] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/customers").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/vendors").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([custList, vendList]) => {
        if (!active) return;
        setCustomers(Array.isArray(custList) ? custList : []);
        setVendors(Array.isArray(vendList) ? vendList : []);
      })
      .catch((err) => console.error("Failed to load parties:", err))
      .finally(() => {
        if (active) setLoadingParties(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { id: nextId, accountCode: "", side: "DEBIT", amount: "", customerId: "", vendorId: "", remark: "" },
    ]);
    setNextId((id) => id + 1);
  };

  const removeLine = (id: number) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLine = (id: number, patch: Partial<FormLine>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, ...patch };
        // Reset party fields when changing away from 1100 / 2000
        if (patch.accountCode !== undefined) {
          if (patch.accountCode !== "1100") updated.customerId = "";
          if (patch.accountCode !== "2000") updated.vendorId = "";
        }
        return updated;
      })
    );
  };

  // Convert amount string to integer paise
  const toPaise = (val: string): number => {
    if (!val) return 0;
    const num = Number(val);
    if (isNaN(num) || num <= 0) return 0;
    return Math.round(num * 100);
  };

  // Live totals calculation in integer paise
  const { totalDebitPaise, totalCreditPaise, diffPaise } = useMemo(() => {
    let debitPaise = 0;
    let creditPaise = 0;
    for (const l of lines) {
      const p = toPaise(l.amount);
      if (l.side === "DEBIT") debitPaise += p;
      else if (l.side === "CREDIT") creditPaise += p;
    }
    return {
      totalDebitPaise: debitPaise,
      totalCreditPaise: creditPaise,
      diffPaise: debitPaise - creditPaise,
    };
  }, [lines]);

  // Validation
  const isValid = useMemo(() => {
    if (submitting) return false;
    if (!dateVal) return false;
    if (dateVal > maxDate) return false;
    if (narration.trim().length < 5) return false;
    if (lines.length < 2) return false;

    const uniqueAccounts = new Set<string>();

    for (const l of lines) {
      if (!l.accountCode) return false;
      uniqueAccounts.add(l.accountCode);
      const paise = toPaise(l.amount);
      if (paise <= 0) return false;

      if (l.accountCode === "1100" && !l.customerId) return false;
      if (l.accountCode === "2000" && !l.vendorId) return false;
    }

    if (uniqueAccounts.size < 2) return false;
    if (totalDebitPaise <= 0 || totalCreditPaise <= 0) return false;
    if (diffPaise !== 0) return false;

    return true;
  }, [submitting, dateVal, maxDate, narration, lines, totalDebitPaise, totalCreditPaise, diffPaise]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        series: "JV",
        remark: narration.trim(),
        postedAt: new Date(dateVal).toISOString(),
        lines: lines.map((l) => ({
          accountCode: l.accountCode,
          side: l.side,
          amount: toPaise(l.amount) / 100,
          customerId: l.accountCode === "1100" ? l.customerId || null : null,
          vendorId: l.accountCode === "2000" ? l.vendorId || null : null,
          remark: l.remark.trim() || undefined,
        })),
      };

      const res = await fetch("/api/finance/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to post journal voucher");
      }

      router.push(`/finance/journal?created=${encodeURIComponent(data.voucherNo)}`);
    } catch (err: any) {
      setFormError(err.message || "Failed to post journal voucher");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
      {/* Top Header Bar */}
      <div className="flex h-[42px] shrink-0 items-center gap-3 border-b border-edge bg-faint px-3">
        <h1 className="flex-1 text-[14px] font-semibold tracking-tight text-ink">New Journal Voucher</h1>
        <div className="flex items-center gap-4 text-[12px]">
          <span className="text-muted">
            Total Debit:{" "}
            <strong className="font-mono text-ink font-semibold tabular-nums">
              {money(totalDebitPaise / 100, 2)}
            </strong>
          </span>
          <span className="text-muted">
            Total Credit:{" "}
            <strong className="font-mono text-ink font-semibold tabular-nums">
              {money(totalCreditPaise / 100, 2)}
            </strong>
          </span>
          <span className="text-muted">
            Difference:{" "}
            <strong
              className={`font-mono font-semibold tabular-nums ${
                diffPaise === 0 ? "text-success" : "text-danger"
              }`}
            >
              {money(Math.abs(diffPaise) / 100, 2)} {diffPaise === 0 ? "✓" : diffPaise > 0 ? "DR" : "CR"}
            </strong>
          </span>
        </div>
        <Link
          href="/finance/journal"
          className="inline-flex h-[26px] items-center rounded px-2.5 text-[12px] text-muted transition-colors duration-150 hover:bg-pastel hover:text-primary"
        >
          Cancel
        </Link>
        <Button
          type="submit"
          variant="primary"
          className="h-[26px] px-3 text-[12px]"
          disabled={!isValid || submitting}
        >
          {submitting ? "Posting…" : "Post Voucher"}
        </Button>
      </div>

      {formError && (
        <div className="border-b border-edge bg-surface px-3 py-2">
          <FormError message={formError} />
        </div>
      )}

      {/* Main Body */}
      <div className="min-h-0 flex-1 overflow-auto scroll-thin p-4 space-y-4">
        {/* Header Fields Section */}
        <div className="rounded border border-edge bg-surface p-3.5 space-y-3">
          <h2 className="text-[12px] font-semibold text-ink uppercase tracking-wider">Voucher Details</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="Posting Date" required hint="Default today, cannot be in future">
              <Input
                type="date"
                value={dateVal}
                max={maxDate}
                onChange={(e) => setDateVal(e.target.value)}
                required
              />
            </Field>
            <div className="sm:col-span-3">
              <Field label="Narration / Remark" required hint="Minimum 5 characters describing the transaction">
                <Input
                  type="text"
                  placeholder="e.g. Month-end depreciation adjustment or accrual"
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  required
                />
              </Field>
            </div>
          </div>
        </div>

        {/* Lines Section */}
        <div className="rounded border border-edge bg-surface p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[12px] font-semibold text-ink uppercase tracking-wider">Voucher Lines</h2>
              <p className="text-[11px] text-muted">Minimum 2 lines required. Debits and credits must balance exactly.</p>
            </div>
            <Button type="button" variant="outline" className="h-[24px] gap-1 px-2 text-[11px]" onClick={addLine}>
              <IconPlus size={12} />
              <span>Add Line</span>
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-edge bg-faint text-left font-semibold text-muted text-[11px] uppercase tracking-wider">
                  <th className="px-2 py-1.5 w-10 text-center">#</th>
                  <th className="px-2 py-1.5 w-64">Account</th>
                  <th className="px-2 py-1.5 w-28">Side</th>
                  <th className="px-2 py-1.5 w-36 text-right">Amount (₹)</th>
                  <th className="px-2 py-1.5 w-52">Party (1100 Cust / 2000 Vend)</th>
                  <th className="px-2 py-1.5">Line Remark</th>
                  <th className="px-2 py-1.5 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {lines.map((line, idx) => (
                  <tr key={line.id} className="hover:bg-faint/40">
                    <td className="px-2 py-2 text-center text-muted font-num">{idx + 1}</td>
                    <td className="px-2 py-2">
                      <Select
                        value={line.accountCode}
                        onChange={(e) => updateLine(line.id, { accountCode: e.target.value })}
                        className="h-[28px] text-[12px]"
                      >
                        <option value="">Select Account…</option>
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.code}>
                            {acc.code} - {acc.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-2 py-2">
                      <Select
                        value={line.side}
                        onChange={(e) => updateLine(line.id, { side: e.target.value as "DEBIT" | "CREDIT" })}
                        className="h-[28px] text-[12px]"
                      >
                        <option value="DEBIT">Debit</option>
                        <option value="CREDIT">Credit</option>
                      </Select>
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0.00"
                        value={line.amount}
                        onChange={(e) => updateLine(line.id, { amount: e.target.value })}
                        className="h-[28px] text-right font-mono text-[12px]"
                      />
                    </td>
                    <td className="px-2 py-2">
                      {line.accountCode === "1100" ? (
                        <Select
                          value={line.customerId}
                          onChange={(e) => updateLine(line.id, { customerId: e.target.value })}
                          className="h-[28px] text-[12px] border-primary/50"
                          disabled={loadingParties}
                          required
                        >
                          <option value="">Select Customer *</option>
                          {customers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.code ? `[${c.code}] ` : ""}{c.name}
                            </option>
                          ))}
                        </Select>
                      ) : line.accountCode === "2000" ? (
                        <Select
                          value={line.vendorId}
                          onChange={(e) => updateLine(line.id, { vendorId: e.target.value })}
                          className="h-[28px] text-[12px] border-primary/50"
                          disabled={loadingParties}
                          required
                        >
                          <option value="">Select Vendor *</option>
                          {vendors.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.code ? `[${v.code}] ` : ""}{v.name}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <span className="text-[11px] text-muted/60 pl-2">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="text"
                        placeholder="Optional note"
                        value={line.remark}
                        onChange={(e) => updateLine(line.id, { remark: e.target.value })}
                        className="h-[28px] text-[12px]"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        disabled={lines.length <= 2}
                        onClick={() => removeLine(line.id)}
                        className="rounded p-1 text-muted transition-colors hover:bg-danger-bg hover:text-danger disabled:pointer-events-none disabled:opacity-30"
                        title="Remove row"
                      >
                        <IconClose size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Running Live Totals Footer */}
          <div className="flex items-center justify-between border-t border-edge pt-3 text-[12px]">
            <div className="text-[11.5px] text-muted">
              {lines.length} lines &bull; All legs must sum to 0 difference.
            </div>
            <div className="flex items-center gap-6">
              <div>
                <span className="text-muted mr-1.5">Total Debit:</span>
                <span className="font-mono font-semibold text-ink">{money(totalDebitPaise / 100, 2)}</span>
              </div>
              <div>
                <span className="text-muted mr-1.5">Total Credit:</span>
                <span className="font-mono font-semibold text-ink">{money(totalCreditPaise / 100, 2)}</span>
              </div>
              <div className="rounded px-2 py-1 bg-faint border border-edge">
                <span className="text-muted mr-1.5">Difference:</span>
                <span
                  className={`font-mono font-bold ${
                    diffPaise === 0 ? "text-success" : "text-danger"
                  }`}
                >
                  {money(Math.abs(diffPaise) / 100, 2)} {diffPaise === 0 ? "Balanced" : diffPaise > 0 ? "Dr Excess" : "Cr Excess"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

