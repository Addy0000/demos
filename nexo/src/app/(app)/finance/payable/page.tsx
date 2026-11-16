"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Chip } from "@/components/ui/chip";
import { Button, Input, Select, Field, FormGrid, FormError, FormSuccess } from "@/components/ui/form";
import { money, date, titleise, amount as fmtAmount } from "@/lib/format";
import {
  getDebitableLinesForBill,
  raiseDebitNote,
  type DebitableLine,
} from "@/app/(app)/procurement/sourcing-actions";

type Bill = {
  id: string;
  code: string;
  status: string;
  basis: string;
  vendorId: string;
  vendor: { name: string; code: string };
  billNo: string | null;
  billDate: string;
  dueOn: string | null;
  subtotal: number;
  taxAmount: number;
  totalValue: number;
  paidAmount: number;
  debitedAmount: number;
  goodsReceiptId?: string | null;
};

type Vendor = {
  id: string;
  name: string;
  code: string;
};

const BASIS_OPTIONS = [
  { value: "PO", label: "Purchase Order (PO)" },
  { value: "GRN", label: "Goods Receipt (GRN)" },
  { value: "MANUAL", label: "Manual" },
];

export default function PayablePage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [vendorId, setVendorId] = useState("");
  const [basis, setBasis] = useState("MANUAL");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [goodsReceiptId, setGoodsReceiptId] = useState("");
  const [purchaseAccountCode, setPurchaseAccountCode] = useState("5000");
  const [amount, setAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [referenceNo, setReferenceNo] = useState("");

  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Payment State
  const [payingBill, setPayingBill] = useState<Bill | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");

  // Debit Note State
  const [debitingBill, setDebitingBill] = useState<Bill | null>(null);
  const [loadingDebitable, setLoadingDebitable] = useState(false);
  const [debitableInfo, setDebitableInfo] = useState<{
    bill: {
      id: string;
      code: string;
      billNo: string | null;
      totalValue: number;
      paidAmount: number;
      debitedAmount: number;
      openBalance: number;
      grnCode: string;
      grnId: string;
    } | null;
    lines: DebitableLine[];
    error?: string;
  } | null>(null);
  const [debitQuantities, setDebitQuantities] = useState<Record<string, string>>({});
  const [debitReason, setDebitReason] = useState("Debit note for rejected goods");
  const [debitError, setDebitError] = useState("");
  const [debitSuccess, setDebitSuccess] = useState<{ message: string; debitNoteId?: string; number?: string } | null>(null);
  const [raisingDebitNote, setRaisingDebitNote] = useState(false);

  const fetchBills = async () => {
    try {
      const res = await fetch("/api/finance/vendor-bills");
      if (res.ok) {
        const data = await res.json();
        setBills(data);
      }
    } catch (err) {
      console.error("Failed to fetch bills:", err);
    }
  };

  const fetchVendors = async () => {
    try {
      const res = await fetch("/api/vendors");
      if (res.ok) {
        const data = await res.json();
        setVendors(data);
        if (data.length > 0 && !vendorId) {
          setVendorId(data[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch vendors:", err);
    }
  };

  useEffect(() => {
    Promise.all([fetchBills(), fetchVendors()]).finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/finance/vendor-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId,
          basis,
          referenceNo: referenceNo.trim() || undefined,
          purchaseAccountCode: purchaseAccountCode.trim(),
          amount: parseFloat(amount),
          taxAmount: taxAmount ? parseFloat(taxAmount) : undefined,
          purchaseOrderId: basis === "PO" && purchaseOrderId.trim() ? purchaseOrderId.trim() : undefined,
          goodsReceiptId: basis === "GRN" && goodsReceiptId.trim() ? goodsReceiptId.trim() : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "Failed to register bill.");
      } else {
        setFormSuccess(`Successfully registered bill ${data.code}!`);
        setAmount("");
        setTaxAmount("");
        setReferenceNo("");
        setPurchaseOrderId("");
        setGoodsReceiptId("");
        fetchBills();
      }
    } catch (err) {
      setFormError("An unexpected error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDebitModal = async (bill: Bill) => {
    setDebitingBill(bill);
    setLoadingDebitable(true);
    setDebitableInfo(null);
    setDebitQuantities({});
    setDebitReason("Debit note for rejected goods");
    setDebitError("");
    setDebitSuccess(null);

    try {
      const res = await getDebitableLinesForBill(bill.id);
      if (res.error) {
        setDebitableInfo({ bill: null, lines: [], error: res.error });
      } else {
        setDebitableInfo(res as any);
        const initialQtys: Record<string, string> = {};
        for (const line of res.lines || []) {
          if (line.availableQtyKg > 0) {
            initialQtys[line.grnLineId] = String(line.availableQtyKg);
          }
        }
        setDebitQuantities(initialQtys);
      }
    } catch (err: any) {
      setDebitError(err?.message || "Failed to load debitable lines");
    } finally {
      setLoadingDebitable(false);
    }
  };

  const handleRaiseDebitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!debitingBill) return;
    setDebitError("");
    setDebitSuccess(null);

    const linesToSubmit = Object.entries(debitQuantities)
      .map(([grnLineId, qtyStr]) => ({
        grnLineId,
        quantityKg: parseFloat(qtyStr) || 0,
      }))
      .filter((l) => l.quantityKg > 0);

    if (linesToSubmit.length === 0) {
      setDebitError("Please specify at least one quantity to debit.");
      return;
    }

    setRaisingDebitNote(true);
    try {
      const res = await raiseDebitNote(
        debitingBill.id,
        linesToSubmit,
        debitReason.trim() || undefined
      );

      if (res.error) {
        setDebitError(res.error);
      } else {
        setDebitSuccess({
          message: `Debit note ${res.number} created successfully!`,
          debitNoteId: res.debitNoteId,
          number: res.number,
        });
        fetchBills();
      }
    } catch (err: any) {
      setDebitError(err?.message || "Failed to raise debit note.");
    } finally {
      setRaisingDebitNote(false);
    }
  };

  const handleApplyPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingBill) return;
    setPayError("");
    const parsedAmount = parseFloat(payAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setPayError("Enter a valid payment amount.");
      return;
    }
    const remaining = payingBill.totalValue - payingBill.paidAmount - (payingBill.debitedAmount || 0);
    if (parsedAmount > remaining + 0.01) {
      setPayError(`Payment cannot exceed the remaining balance of ${money(remaining)}.`);
      return;
    }

    setPaying(true);
    try {
      const res = await fetch(`/api/finance/payable/${payingBill.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parsedAmount }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPayError(data.error || "Failed to apply payment.");
      } else {
        setPayingBill(null);
        setPayAmount("");
        fetchBills();
      }
    } catch (err) {
      setPayError("An unexpected error occurred.");
    } finally {
      setPaying(false);
    }
  };

  const billStatusTone = (status: string) => {
    switch (status) {
      case "APPROVED":
        return "success";
      case "PAID":
        return "success";
      case "PENDING_APPROVAL":
        return "warning";
      case "PARTIALLY_PAID":
        return "warning";
      case "VOID":
        return "danger";
      case "CANCELLED":
        return "danger";
      case "DRAFT":
      default:
        return "neutral";
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex h-[42px] shrink-0 items-center gap-3 border-b border-edge bg-faint px-3">
        <h1 className="shrink-0 text-[14px] font-semibold tracking-tight text-ink">Accounts payable</h1>
        <span className="shrink-0 rounded-sm bg-pastel px-1.5 py-px font-num text-[11px] font-medium text-primary">
          {bills.length}
        </span>
        <span className="text-[11.5px] text-muted">
          Manage vendor invoices and general ledger postings
        </span>
      </div>

      {/* Main Section */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row bg-canvas">
        {/* Left Side: Table of existing bills */}
        <div className="flex flex-1 flex-col min-h-0 border-r border-edge">
          <header className="flex h-[32px] shrink-0 items-center border-b border-edge bg-faint px-3">
            <h2 className="text-[11.5px] font-semibold text-ink">Vendor bills</h2>
          </header>
          <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-surface">
            <table className="w-full min-w-[850px]">
              <thead>
                <tr className="grid-head">
                  <th className="px-3 py-2 text-left font-semibold">Bill No</th>
                  <th className="px-3 py-2 text-left font-semibold">Vendor</th>
                  <th className="px-3 py-2 text-left font-semibold">Basis</th>
                  <th className="px-3 py-2 text-left font-semibold">Ref No</th>
                  <th className="px-3 py-2 text-right font-semibold">Total</th>
                  <th className="px-3 py-2 text-right font-semibold">Paid</th>
                  <th className="px-3 py-2 text-right font-semibold">Debited</th>
                  <th className="px-3 py-2 text-right font-semibold">Balance Due</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-left font-semibold">Date</th>
                  <th className="px-3 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-[12.5px] text-muted">
                      Loading bills...
                    </td>
                  </tr>
                ) : bills.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-[12.5px] text-muted">
                      No vendor bills found. Register a new bill on the right.
                    </td>
                  </tr>
                ) : (
                  bills.map((bill) => (
                    <tr key={bill.id} className="grid-row hover:bg-pastel transition-colors duration-150">
                      <td className="grid-cell font-mono font-medium text-primary-hover">
                        <Link href={`/finance/payable/${bill.id}`} className="ref-link hover:underline">
                          {bill.code}
                        </Link>
                      </td>
                      <td className="grid-cell max-w-[200px]" title={bill.vendor.name}>
                        {bill.vendor.name}
                      </td>
                      <td className="grid-cell text-muted">
                        {titleise(bill.basis)}
                      </td>
                      <td className="grid-cell font-mono text-muted">
                        {bill.billNo || "—"}
                      </td>
                      <td className="grid-cell text-right font-mono font-semibold">
                        {money(bill.totalValue, 2)}
                      </td>
                      <td className="grid-cell text-right font-mono text-muted">
                        {money(bill.paidAmount, 2)}
                      </td>
                      <td className="grid-cell text-right font-mono text-muted">
                        {(bill.debitedAmount || 0) > 0 ? (
                          <span className="text-amber-700">-{money(bill.debitedAmount, 2)}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="grid-cell text-right font-mono font-semibold">
                        {(() => {
                          const bal = Math.max(0, bill.totalValue - bill.paidAmount - (bill.debitedAmount || 0));
                          return bal > 0 ? (
                            <span className="text-danger-text">{money(bal, 2)}</span>
                          ) : (
                            <span className="text-muted">₹0.00</span>
                          );
                        })()}
                      </td>
                      <td className="grid-cell">
                        <Chip tone={billStatusTone(bill.status)}>{titleise(bill.status)}</Chip>
                      </td>
                      <td className="grid-cell font-mono text-muted">
                        {date(bill.billDate)}
                      </td>
                      <td className="grid-cell text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {bill.status !== "VOID" && bill.status !== "CANCELLED" && (
                            <button
                              onClick={() => handleOpenDebitModal(bill)}
                              className="text-[11px] font-medium px-2 py-0.5 rounded border border-edge hover:bg-faint text-ink transition-colors"
                              title="Raise debit note for rejected GRN lines"
                            >
                              Raise debit note
                            </button>
                          )}
                          {(bill.status === "APPROVED" || bill.status === "PARTIALLY_PAID") && (
                            <button
                              onClick={() => {
                                setPayingBill(bill);
                                setPayAmount((bill.totalValue - bill.paidAmount - (bill.debitedAmount || 0)).toFixed(2));
                                setPayError("");
                              }}
                              className="text-[11px] font-medium px-2 py-0.5 rounded bg-primary text-white hover:bg-primary-hover transition-colors"
                            >
                              Pay
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Register a new bill */}
        <div className="w-full lg:w-[360px] shrink-0 flex flex-col border-t lg:border-t-0 border-edge">
          <header className="flex h-[32px] shrink-0 items-center border-b border-edge bg-faint px-3">
            <h2 className="text-[11.5px] font-semibold text-ink">Register new bill</h2>
          </header>
          <div className="flex-1 overflow-auto p-4 bg-faint scroll-thin">
            <form onSubmit={handleSubmit} className="space-y-4">
              <FormError message={formError} />
              <FormSuccess message={formSuccess} />

              <Field label="Vendor" required>
                <Select
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  required
                >
                  {vendors.length === 0 && !loading && (
                    <option value="">No active vendors found</option>
                  )}
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.code})
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Basis" required>
                <Select
                  value={basis}
                  onChange={(e) => setBasis(e.target.value)}
                  required
                >
                  {BASIS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>

              {basis === "PO" && (
                <Field label="Purchase Order ID" required>
                  <Input
                    value={purchaseOrderId}
                    onChange={(e) => setPurchaseOrderId(e.target.value)}
                    required
                    placeholder="po_..."
                  />
                </Field>
              )}

              {basis === "GRN" && (
                <Field label="Goods Receipt ID" required>
                  <Input
                    value={goodsReceiptId}
                    onChange={(e) => setGoodsReceiptId(e.target.value)}
                    required
                    placeholder="grn_..."
                  />
                </Field>
              )}

              <Field label="Purchase Account Code" hint="Seed values: 5000 (Purchases), 5100 (Jobwork), 5200 (Service), 9000 (General)" required>
                <Input
                  value={purchaseAccountCode}
                  onChange={(e) => setPurchaseAccountCode(e.target.value)}
                  required
                  placeholder="5000"
                />
              </Field>

              <Field label="Ref Number (Vendor Invoice No)">
                <Input
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder="INV/2026/001"
                />
              </Field>

              <FormGrid columns={2}>
                <Field label="Subtotal (₹)" required>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    placeholder="0.00"
                  />
                </Field>
                <Field label="Tax Amount (₹)">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={taxAmount}
                    onChange={(e) => setTaxAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </Field>
              </FormGrid>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full"
                >
                  {submitting ? "Registering..." : "Register Bill"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Payment Application Modal Dialog */}
      {payingBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
          <div className="w-[360px] rounded-lg bg-surface border border-edge p-6 shadow-lg bg-white space-y-4">
            <header className="border-b border-edge pb-2">
              <h3 className="text-sm font-semibold text-slate-800">Apply Payment to {payingBill.code}</h3>
            </header>

            {payError && <div className="text-xs text-red-600 font-medium">{payError}</div>}

            <div className="space-y-2 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Total bill value:</span>
                <span className="font-mono font-semibold text-slate-800">{money(payingBill.totalValue, 2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Already paid:</span>
                <span className="font-mono font-semibold text-slate-800">{money(payingBill.paidAmount, 2)}</span>
              </div>
              {(payingBill.debitedAmount || 0) > 0 && (
                <div className="flex justify-between">
                  <span>Debited (Debit notes):</span>
                  <span className="font-mono font-semibold text-amber-700">-{money(payingBill.debitedAmount, 2)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-edge pt-1.5 font-medium">
                <span>Remaining Balance:</span>
                <span className="font-mono font-semibold text-blue-600">{money(Math.max(0, payingBill.totalValue - payingBill.paidAmount - (payingBill.debitedAmount || 0)), 2)}</span>
              </div>
            </div>

            <form onSubmit={handleApplyPayment} className="space-y-4 pt-1">
              <Field label="Payment Amount (₹)" required>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={(payingBill.totalValue - payingBill.paidAmount - (payingBill.debitedAmount || 0)).toFixed(2)}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  autoFocus
                />
              </Field>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setPayingBill(null)}
                  className="px-3.5 py-1.5 text-xs font-semibold border border-slate-200 rounded text-slate-600 hover:text-slate-800 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paying}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {paying ? "Processing..." : "Confirm Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Debit Note Modal Dialog */}
      {debitingBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-lg bg-surface border border-edge p-6 shadow-xl bg-white space-y-4 my-auto">
            <div className="flex items-start justify-between border-b border-edge pb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">
                  Raise Debit Note — {debitingBill.code}
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Vendor: <span className="font-medium text-ink">{debitingBill.vendor.name}</span>
                  {debitingBill.billNo ? ` (Ref: ${debitingBill.billNo})` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDebitingBill(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold px-1"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded bg-faint p-2.5 text-xs text-slate-600 border border-edge">
              <div>
                <span className="text-muted block text-[11px]">Total Bill:</span>
                <span className="font-mono font-semibold text-slate-800">{money(debitingBill.totalValue, 2)}</span>
              </div>
              <div>
                <span className="text-muted block text-[11px]">Paid:</span>
                <span className="font-mono font-semibold text-slate-800">{money(debitingBill.paidAmount, 2)}</span>
              </div>
              <div>
                <span className="text-muted block text-[11px]">Debited:</span>
                <span className="font-mono font-semibold text-slate-800">{money(debitingBill.debitedAmount || 0, 2)}</span>
              </div>
              <div>
                <span className="text-muted block text-[11px]">Open Balance:</span>
                <span className="font-mono font-semibold text-primary">
                  {money(Math.max(0, debitingBill.totalValue - debitingBill.paidAmount - (debitingBill.debitedAmount || 0)), 2)}
                </span>
              </div>
            </div>

            {loadingDebitable ? (
              <div className="py-8 text-center text-xs text-muted">
                Checking rejected GRN lines and debitable quantities...
              </div>
            ) : debitableInfo?.error ? (
              <div className="space-y-3">
                <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <div className="font-semibold mb-0.5">Cannot raise debit note</div>
                  <div>{debitableInfo.error}</div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setDebitingBill(null)}
                    className="px-3.5 py-1.5 text-xs font-semibold border border-slate-200 rounded text-slate-600 hover:text-slate-800 hover:bg-slate-50 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : !debitableInfo?.lines || debitableInfo.lines.length === 0 ? (
              <div className="space-y-3">
                <div className="rounded border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 space-y-1">
                  <div className="font-semibold">Nothing to debit</div>
                  <p>
                    There are no rejected GRN lines available to debit for this bill. All rejected items have either already been debited, or the linked goods receipt has no rejected quantities.
                  </p>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setDebitingBill(null)}
                    className="px-3.5 py-1.5 text-xs font-semibold border border-slate-200 rounded text-slate-600 hover:text-slate-800 hover:bg-slate-50 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRaiseDebitNote} className="space-y-4">
                {debitError && <div className="text-xs text-red-600 font-medium">{debitError}</div>}

                {debitSuccess && (
                  <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                    <div className="font-semibold">{debitSuccess.message}</div>
                    {debitSuccess.debitNoteId && (
                      <div className="mt-1.5">
                        <Link
                          href={`/purchase/debit-notes/${debitSuccess.debitNoteId}`}
                          className="underline font-medium text-emerald-900 hover:text-emerald-950"
                        >
                          View / Print Debit Note {debitSuccess.number || ""} →
                        </Link>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-700">
                      Rejected GRN Lines Available for Debit
                    </label>
                    <span className="text-[11px] text-muted">
                      GRN: <span className="font-mono font-medium text-ink">{debitableInfo.bill?.grnCode}</span>
                    </span>
                  </div>
                  <div className="max-h-56 overflow-y-auto border border-edge rounded scroll-thin">
                    <table className="w-full text-xs">
                      <thead className="bg-faint text-slate-600 font-semibold border-b border-edge sticky top-0">
                        <tr>
                          <th className="p-2 text-left">Item</th>
                          <th className="p-2 text-right">Rejected</th>
                          <th className="p-2 text-right">Debited</th>
                          <th className="p-2 text-right">Available</th>
                          <th className="p-2 text-right">Rate</th>
                          <th className="p-2 text-right">Tax</th>
                          <th className="p-2 text-right w-28">Debit Qty (kg)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-edge">
                        {debitableInfo.lines.map((l) => (
                          <tr key={l.grnLineId} className="hover:bg-pastel/40">
                            <td className="p-2 font-medium text-ink max-w-[160px] truncate" title={l.materialName}>
                              {l.materialName} ({l.materialCode})
                            </td>
                            <td className="p-2 text-right font-mono text-muted">{fmtAmount(l.rejectedQtyKg)}</td>
                            <td className="p-2 text-right font-mono text-muted">{fmtAmount(l.debitedQtyKg)}</td>
                            <td className="p-2 text-right font-mono font-medium text-amber-700">{fmtAmount(l.availableQtyKg)}</td>
                            <td className="p-2 text-right font-mono">{money(l.ratePerKg, 2)}</td>
                            <td className="p-2 text-right font-mono">{l.taxPct}%</td>
                            <td className="p-2 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                max={l.availableQtyKg}
                                value={debitQuantities[l.grnLineId] ?? ""}
                                onChange={(e) =>
                                  setDebitQuantities({ ...debitQuantities, [l.grnLineId]: e.target.value })
                                }
                                disabled={raisingDebitNote || !!debitSuccess}
                                className="w-24 px-2 py-1 text-right font-mono text-xs border border-edge rounded focus:outline-none focus:border-primary disabled:bg-faint"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <Field label="Reason">
                  <Input
                    value={debitReason}
                    onChange={(e) => setDebitReason(e.target.value)}
                    disabled={raisingDebitNote || !!debitSuccess}
                    placeholder="Debit note for rejected goods"
                  />
                </Field>

                <div className="flex gap-2 justify-end pt-2 border-t border-edge">
                  <button
                    type="button"
                    onClick={() => setDebitingBill(null)}
                    className="px-3.5 py-1.5 text-xs font-semibold border border-slate-200 rounded text-slate-600 hover:text-slate-800 hover:bg-slate-50 transition-colors"
                  >
                    {debitSuccess ? "Done" : "Cancel"}
                  </button>
                  {!debitSuccess && (
                    <button
                      type="submit"
                      disabled={raisingDebitNote}
                      className="px-3.5 py-1.5 text-xs font-semibold bg-primary text-white rounded hover:bg-primary-hover disabled:opacity-50 transition-colors"
                    >
                      {raisingDebitNote ? "Raising Debit Note..." : "Raise Debit Note"}
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
