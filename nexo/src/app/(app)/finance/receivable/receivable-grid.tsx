"use client";

import { useState, useEffect, useMemo } from "react";
import { Chip } from "@/components/ui/chip";
import { Button, Input, Select, Field, FormError, FormSuccess } from "@/components/ui/form";
import { money, date, titleise } from "@/lib/format";
import { isInvoiceOverdue } from "@/lib/invoice-overdue";

export type InvoiceRow = {
  id: string;
  code: string;
  status: string;
  customerId: string;
  customer: { id: string; name: string; code?: string };
  salesOrderId: string;
  salesOrder?: { id: string; code: string };
  challanId?: string | null;
  challan?: { id: string; code: string } | null;
  invoiceDate: string;
  dueOn: string | null;
  subtotal: number;
  taxAmount: number;
  totalValue: number;
  paidAmount: number;
  creditedAmount: number;
  remainingAmount: number;
  remark?: string | null;
};

export function ReceivableGrid({ initialInvoices = [] }: { initialInvoices?: InvoiceRow[] }) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>(initialInvoices);
  const [loading, setLoading] = useState(initialInvoices.length === 0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Selection for right-pane "Receive Payment" form
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const [receiveAmount, setReceiveAmount] = useState<string>("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchInvoices = async () => {
    try {
      const res = await fetch("/api/finance/receivable");
      if (res.ok) {
        const data = await res.json();
        setInvoices(data);
      }
    } catch (err) {
      console.error("Failed to fetch receivable invoices:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const selectedInvoice = useMemo(() => {
    return invoices.find((inv) => inv.id === selectedInvoiceId) ?? null;
  }, [invoices, selectedInvoiceId]);

  // When selected invoice changes, default receiveAmount to its remaining balance
  const handleSelectInvoice = (inv: InvoiceRow) => {
    setSelectedInvoiceId(inv.id);
    setReceiveAmount(inv.remainingAmount > 0 ? inv.remainingAmount.toFixed(2) : "");
    setFormError("");
    setFormSuccess("");
  };

  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    setFormError("");
    setFormSuccess("");

    const parsedAmount = parseFloat(receiveAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setFormError("Enter a valid payment amount greater than zero.");
      return;
    }

    if (parsedAmount > selectedInvoice.remainingAmount + 0.01) {
      setFormError(
        `Payment amount cannot exceed the remaining balance of ${money(selectedInvoice.remainingAmount)}.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/finance/receivable/${selectedInvoice.id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parsedAmount }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to record payment.");
      } else {
        setFormSuccess(`Successfully received ${money(parsedAmount)} against ${selectedInvoice.code}!`);
        setReceiveAmount("");
        await fetchInvoices();
      }
    } catch (err) {
      setFormError("An unexpected error occurred while processing receipt.");
    } finally {
      setSubmitting(false);
    }
  };

  const invoiceStatusTone = (status: string) => {
    switch (status) {
      case "PAID":
        return "success";
      case "PART_PAID":
      case "PARTIALLY_PAID":
        return "warning";
      case "RAISED":
      case "APPROVED":
        return "neutral";
      case "OVERDUE":
        return "danger";
      case "CANCELLED":
      case "VOID":
        return "danger";
      case "DRAFT":
      default:
        return "neutral";
    }
  };

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const overdue = isInvoiceOverdue(inv);
      const effectiveStatus = overdue ? "OVERDUE" : inv.status;

      if (statusFilter !== "ALL") {
        if (statusFilter === "OPEN") {
          if (inv.status !== "RAISED" && inv.status !== "PART_PAID" && !overdue) {
            return false;
          }
        } else if (statusFilter === "OVERDUE") {
          if (!overdue) return false;
        } else if (inv.status !== statusFilter) {
          return false;
        }
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          inv.code.toLowerCase().includes(q) ||
          inv.customer.name.toLowerCase().includes(q) ||
          (inv.salesOrder?.code && inv.salesOrder.code.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [invoices, statusFilter, search]);

  const totalInvoiced = useMemo(() => invoices.reduce((a, b) => a + b.totalValue, 0), [invoices]);
  const totalReceived = useMemo(() => invoices.reduce((a, b) => a + b.paidAmount, 0), [invoices]);
  const totalCredited = useMemo(() => invoices.reduce((a, b) => a + (b.creditedAmount || 0), 0), [invoices]);
  const totalOutstanding = useMemo(
    () => invoices.reduce((a, b) => a + b.remainingAmount, 0),
    [invoices]
  );
  const totalNetRevenue = useMemo(() => invoices.reduce((a, b) => a + (b.subtotal || 0), 0), [invoices]);
  const totalTaxInvoiced = useMemo(() => invoices.reduce((a, b) => a + (b.taxAmount || 0), 0), [invoices]);
  const totalTaxReceived = useMemo(
    () =>
      invoices.reduce((a, b) => {
        if (!b.totalValue || b.totalValue <= 0) return a;
        const ratio = Math.min(1, b.paidAmount / b.totalValue);
        return a + (b.taxAmount || 0) * ratio;
      }, 0),
    [invoices]
  );

  const openInvoices = useMemo(() => {
    return invoices.filter((i) => i.status === "RAISED" || i.status === "PART_PAID" || i.status === "OVERDUE");
  }, [invoices]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex h-[42px] shrink-0 items-center gap-3 border-b border-edge bg-faint px-3">
        <h1 className="shrink-0 text-[14px] font-semibold tracking-tight text-ink">Accounts receivable</h1>
        <span className="shrink-0 rounded-sm bg-pastel px-1.5 py-px font-num text-[11px] font-medium text-primary">
          {invoices.length}
        </span>
        <span className="text-[11.5px] text-muted">
          Manage customer billing, payment collections, and general ledger postings
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-4 text-[11.5px] text-muted">
          <span>
            Net Sales Revenue: <strong className="font-mono text-primary font-semibold">{money(totalNetRevenue)}</strong>
          </span>
          <span>
            GST (18%): <strong className="font-mono text-ink font-medium">{money(totalTaxInvoiced)}</strong>
          </span>
          <span>
            Gross Invoiced: <strong className="font-mono text-ink">{money(totalInvoiced)}</strong>
          </span>
          <span>
            Total Collected: <strong className="font-mono text-success">{money(totalReceived)}</strong>
          </span>
          <span>
            Total Credited: <strong className="font-mono text-warning-text">{money(totalCredited)}</strong>
          </span>
          <span>
            Outstanding: <strong className="font-mono text-danger-text">{money(totalOutstanding)}</strong>
          </span>
        </div>
      </div>

      {/* Main Section */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row bg-canvas">
        {/* Left Side: Table of sales invoices */}
        <div className="flex flex-1 flex-col min-h-0 border-r border-edge">
          <header className="flex h-[38px] shrink-0 items-center justify-between border-b border-edge bg-faint px-3 gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-[11.5px] font-semibold text-ink">Sales invoices</h2>
              <span className="text-xs text-muted">({filteredInvoices.length})</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search invoice or customer..."
                className="h-[24px] rounded border border-edge bg-surface px-2 text-[11.5px] outline-none focus:border-primary w-48"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-[24px] rounded border border-edge bg-surface px-1.5 text-[11.5px] outline-none focus:border-primary"
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">Open (Unsettled)</option>
                <option value="RAISED">Raised</option>
                <option value="PART_PAID">Partially Paid</option>
                <option value="PAID">Paid</option>
                <option value="OVERDUE">Overdue</option>
              </select>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-surface">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="grid-head">
                  <th className="px-3 py-2 text-left font-semibold">Invoice No</th>
                  <th className="px-3 py-2 text-left font-semibold">Customer</th>
                  <th className="px-3 py-2 text-left font-semibold">Order</th>
                  <th className="px-3 py-2 text-right font-semibold">Total</th>
                  <th className="px-3 py-2 text-right font-semibold">GST (18%)</th>
                  <th className="px-3 py-2 text-right font-semibold">Received</th>
                  <th className="px-3 py-2 text-right font-semibold">Credited</th>
                  <th className="px-3 py-2 text-right font-semibold">Balance</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-left font-semibold">Date</th>
                  <th className="px-3 py-2 text-left font-semibold">Due</th>
                  <th className="px-3 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-[12.5px] text-muted">
                      Loading sales invoices...
                    </td>
                  </tr>
                ) : filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-[12.5px] text-muted">
                      No sales invoices found matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => {
                    const isSelected = selectedInvoiceId === inv.id;
                    const canReceive =
                      inv.status === "RAISED" || inv.status === "PART_PAID" || inv.status === "OVERDUE";
                    return (
                      <tr
                        key={inv.id}
                        onClick={() => handleSelectInvoice(inv)}
                        className={`grid-row cursor-pointer transition-colors duration-150 ${
                          isSelected ? "bg-pastel/80" : "hover:bg-pastel/40"
                        }`}
                      >
                        <td className="grid-cell font-mono font-medium text-primary-hover">
                          {inv.code}
                        </td>
                        <td className="grid-cell max-w-[180px] truncate" title={inv.customer.name}>
                          {inv.customer.name}
                        </td>
                        <td className="grid-cell font-mono text-muted text-xs">
                          {inv.salesOrder?.code || "—"}
                        </td>
                        <td className="grid-cell text-right font-mono font-semibold">
                          {money(inv.totalValue, 2)}
                        </td>
                        <td className="grid-cell text-right font-mono text-muted text-xs">
                          {money(inv.taxAmount, 2)}
                        </td>
                        <td className="grid-cell text-right font-mono text-success">
                          {money(inv.paidAmount, 2)}
                        </td>
                        <td className="grid-cell text-right font-mono text-warning-text">
                          {money(inv.creditedAmount || 0, 2)}
                        </td>
                        <td className="grid-cell text-right font-mono font-medium text-danger-text">
                          {money(inv.remainingAmount, 2)}
                        </td>
                        <td className="grid-cell">
                          {isInvoiceOverdue(inv) ? (
                            <Chip tone="danger">Overdue</Chip>
                          ) : (
                            <Chip tone={invoiceStatusTone(inv.status)}>
                              {inv.status === "PART_PAID" ? "Part Paid" : titleise(inv.status)}
                            </Chip>
                          )}
                        </td>
                        <td className="grid-cell font-mono text-muted text-xs">
                          {date(inv.invoiceDate)}
                        </td>
                        <td className="grid-cell font-mono text-muted text-xs">
                          {inv.dueOn ? date(inv.dueOn) : "—"}
                        </td>
                        <td className="grid-cell text-right" onClick={(e) => e.stopPropagation()}>
                          {canReceive ? (
                            <button
                              onClick={() => handleSelectInvoice(inv)}
                              className="text-[11px] font-medium px-2 py-0.5 rounded bg-primary text-white hover:bg-primary-hover transition-colors"
                            >
                              Receive
                            </button>
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Receive Payment Form */}
        <div className="w-full lg:w-[380px] shrink-0 flex flex-col border-t lg:border-t-0 border-edge bg-faint">
          <header className="flex h-[38px] shrink-0 items-center border-b border-edge bg-faint px-3">
            <h2 className="text-[11.5px] font-semibold text-ink">Receive payment</h2>
          </header>

          <div className="flex-1 overflow-auto p-4 scroll-thin space-y-4">
            <FormError message={formError} />
            <FormSuccess message={formSuccess} />

            {/* Quick Invoice Picker if not selected or to change */}
            <Field label="Selected Invoice" required>
              <Select
                value={selectedInvoiceId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedInvoiceId(id);
                  const found = invoices.find((x) => x.id === id);
                  if (found) {
                    setReceiveAmount(found.remainingAmount > 0 ? found.remainingAmount.toFixed(2) : "");
                  } else {
                    setReceiveAmount("");
                  }
                  setFormError("");
                  setFormSuccess("");
                }}
              >
                <option value="">-- Choose an open invoice --</option>
                {openInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.code} - {inv.customer.name} ({money(inv.remainingAmount)} due)
                  </option>
                ))}
              </Select>
            </Field>

            {selectedInvoice ? (
              <form onSubmit={handleReceiveSubmit} className="space-y-4">
                {/* Invoice Summary Card with Tax Breakdown */}
                <div className="rounded border border-edge bg-surface p-3 space-y-2 text-xs">
                  <div className="flex justify-between border-b border-edge pb-1.5">
                    <span className="text-muted">Customer:</span>
                    <strong className="text-ink max-w-[200px] truncate text-right">
                      {selectedInvoice.customer.name}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Base Subtotal:</span>
                    <span className="font-mono text-ink">{money(selectedInvoice.subtotal, 2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">GST (18%):</span>
                    <span className="font-mono text-ink font-medium">{money(selectedInvoice.taxAmount, 2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-edge pt-1">
                    <span className="text-muted font-medium">Gross Total:</span>
                    <span className="font-mono font-semibold text-ink">{money(selectedInvoice.totalValue, 2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Total Collected:</span>
                    <span className="font-mono text-success font-medium">
                      {money(selectedInvoice.paidAmount, 2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Total Credited:</span>
                    <span className="font-mono text-warning-text font-medium">
                      {money(selectedInvoice.creditedAmount || 0, 2)}
                    </span>
                  </div>
                  <div className="flex justify-between bg-pastel/40 px-2 py-1 rounded border border-edge/40">
                    <span className="text-primary font-medium">GST Collected:</span>
                    <span className="font-mono text-primary font-semibold">
                      {money(
                        selectedInvoice.totalValue > 0
                          ? Math.min(
                              selectedInvoice.taxAmount,
                              (selectedInvoice.paidAmount / selectedInvoice.totalValue) * selectedInvoice.taxAmount
                            )
                          : 0,
                        2
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-edge pt-1.5 font-medium">
                    <span className="text-danger-text">Remaining Balance:</span>
                    <span className="font-mono font-semibold text-danger-text">
                      {money(selectedInvoice.remainingAmount, 2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] text-muted">
                    <span>(Pending GST portion):</span>
                    <span className="font-mono text-muted">
                      {money(
                        selectedInvoice.totalValue > 0
                          ? Math.max(
                              0,
                              selectedInvoice.taxAmount -
                                (selectedInvoice.paidAmount / selectedInvoice.totalValue) * selectedInvoice.taxAmount
                            )
                          : 0,
                        2
                      )}
                    </span>
                  </div>
                </div>

                <Field label="Amount to Receive (₹)" hint="Enter amount received via Bank / Wire transfer" required>
                  <div className="space-y-1.5">
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={selectedInvoice.remainingAmount.toFixed(2)}
                      value={receiveAmount}
                      onChange={(e) => setReceiveAmount(e.target.value)}
                      placeholder="0.00"
                      required
                    />
                    {selectedInvoice.remainingAmount > 0 && (
                      <button
                        type="button"
                        onClick={() => setReceiveAmount(selectedInvoice.remainingAmount.toFixed(2))}
                        className="text-[11px] text-primary hover:underline font-medium"
                      >
                        Receive full balance ({money(selectedInvoice.remainingAmount, 2)})
                      </button>
                    )}
                  </div>
                </Field>

                <div className="rounded bg-pastel/40 p-2 text-[11px] text-muted space-y-1 border border-edge/40">
                  <div className="font-medium text-ink">General Ledger Postings upon receipt:</div>
                  <div>• <strong>Debit 1000</strong> (Cash/Bank) — Increases bank asset</div>
                  <div>• <strong>Credit 1100</strong> (Accounts Receivable) — Decreases customer asset</div>
                  <div>• Decrements customer open credit exposure</div>
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={submitting || selectedInvoice.remainingAmount <= 0}
                    className="w-full"
                  >
                    {submitting ? "Processing Receipt..." : "Record Payment Receipt"}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="py-8 text-center text-xs text-muted border border-dashed border-edge rounded p-4">
                Select an invoice on the left or choose from the dropdown above to apply an incoming customer payment.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
