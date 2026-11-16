"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FormError } from "@/components/ui/form";
import { IconClose } from "@/components/icons";

export function ReverseVoucherButton({ voucherNo }: { voucherNo: string }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const isValid = reason.trim().length >= 5;

  const handleOpen = () => {
    setReason("");
    setError(null);
    setIsOpen(true);
  };

  const handleClose = () => {
    if (submitting) return;
    setIsOpen(false);
    setError(null);
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/finance/journal/${encodeURIComponent(voucherNo)}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to reverse journal voucher.");
      }

      setIsOpen(false);
      setToast(`Journal voucher ${voucherNo} was reversed successfully. New reversal voucher: ${data.voucherNo}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to reverse voucher.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Toast banner if reversal succeeded in current session */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 rounded border border-success/40 bg-success-bg px-4 py-3 shadow-lg text-[12.5px] text-success-text animate-in fade-in slide-in-from-top-2">
          <span>{toast}</span>
          <button
            onClick={() => setToast(null)}
            className="rounded p-0.5 hover:bg-success/20 text-success-text"
            title="Dismiss"
          >
            <IconClose size={14} />
          </button>
        </div>
      )}

      <Button
        variant="danger"
        onClick={handleOpen}
        className="print:hidden text-[12px] h-[28px] px-3 font-medium"
      >
        Reverse voucher
      </Button>

      {/* Confirmation Dialog Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 print:hidden">
          <div className="flex flex-col w-full max-w-lg bg-surface rounded-sm border border-edge shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-edge bg-faint px-4 py-3">
              <div>
                <h2 className="text-[13.5px] font-bold text-ink">Reverse Journal Voucher</h2>
                <p className="text-[11px] font-mono text-muted mt-0.5">{voucherNo}</p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold leading-none cursor-pointer disabled:opacity-50"
              >
                &times;
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleConfirm}>
              <div className="p-4 space-y-3.5">
                <p className="text-[12px] text-muted leading-relaxed">
                  Reversing will create mirror debit/credit postings in the general ledger.
                  The current voucher will be marked as <strong className="text-danger font-semibold">REVERSED</strong> and can no longer be edited or reversed again.
                </p>

                {error && <FormError message={error} />}

                <div>
                  <label className="mb-1 block text-[11.5px] font-medium text-ink">
                    Reversal Reason <span className="text-danger">*</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Provide a clear explanation for this reversal (min 5 characters)..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    disabled={submitting}
                    className="w-full rounded-[2px] border border-edge bg-surface px-2.5 py-2 text-[12.5px] text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/12 disabled:bg-faint"
                  />
                  <div className="flex justify-between mt-1 text-[11px] text-muted">
                    <span>
                      {reason.trim().length < 5
                        ? `${5 - reason.trim().length} more characters required`
                        : "Reason valid"}
                    </span>
                    <span>{reason.trim().length} chars</span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-edge bg-faint px-4 py-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={submitting}
                  className="rounded border border-edge px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-surface transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  variant="danger"
                  disabled={!isValid || submitting}
                  className="text-xs h-[30px] px-4 font-semibold"
                >
                  {submitting ? "Reversing..." : "Confirm Reversal"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

