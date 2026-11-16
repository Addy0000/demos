"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/form";
import { money, date } from "@/lib/format";
import { IconPlus, IconSearch, IconChevronLeft, IconChevronRight, IconClose } from "@/components/icons";

export type JournalRow = {
  voucherNo: string;
  date: string | null;
  narration: string | null;
  totalAmount: number | string;
  status: "POSTED" | "REVERSED";
  reversalOfVoucherNo: string | null;
  reversingVoucherNo: string | null;
  createdBy: string | null;
  legsCount: number;
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export function JournalGrid({ canWrite }: { canWrite: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [vouchers, setVouchers] = useState<JournalRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  // Notification for newly created voucher
  const createdParam = searchParams.get("created");
  const [successToast, setSuccessToast] = useState<string | null>(
    createdParam ? `Journal Voucher ${createdParam} posted successfully.` : null
  );

  const fetchVouchers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      if (search.trim()) params.set("search", search.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const res = await fetch(`/api/finance/journal?${params.toString()}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to load journal vouchers");
      }
      const data = await res.json();
      setVouchers(data.vouchers || []);
      setPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
    } catch (err: any) {
      setError(err.message || "Failed to load journal vouchers");
    } finally {
      setLoading(false);
    }
  }, [page, search, from, to]);

  useEffect(() => {
    fetchVouchers();
  }, [fetchVouchers]);

  const handleRowClick = (voucherNo: string) => {
    router.push(`/finance/journal/${encodeURIComponent(voucherNo)}`);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
      {/* Header Bar */}
      <div className="flex h-[42px] shrink-0 items-center gap-3 border-b border-edge bg-faint px-3">
        <h1 className="shrink-0 text-[14px] font-semibold tracking-tight text-ink">Journal Vouchers</h1>
        <span className="shrink-0 rounded-sm bg-pastel px-1.5 py-px font-num text-[11px] font-medium text-primary">
          {pagination.total}
        </span>
        <span className="text-[11.5px] text-muted">
          Manual journal vouchers, adjustments, and ledger adjustments
        </span>
        <div className="flex-1" />
        {canWrite && (
          <Link href="/finance/journal/new">
            <Button variant="primary" className="h-[26px] gap-1 px-2.5 text-[12px]">
              <IconPlus size={14} />
              <span>New Journal Voucher</span>
            </Button>
          </Link>
        )}
      </div>

      {/* Success Toast / Notification */}
      {successToast && (
        <div className="flex shrink-0 items-center justify-between border-b border-success/40 bg-success-bg px-3 py-2 text-[12px] text-success-text">
          <span>{successToast}</span>
          <button
            onClick={() => setSuccessToast(null)}
            className="rounded p-0.5 hover:bg-success/20 text-success-text"
            title="Dismiss"
          >
            <IconClose size={14} />
          </button>
        </div>
      )}

      {/* Filter / Search Bar */}
      <div className="flex h-[38px] shrink-0 items-center justify-between border-b border-edge bg-faint px-3 gap-2">
        <div className="flex items-center gap-2">
          <div className="relative">
            <IconSearch size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search voucher no..."
              className="h-[26px] rounded border border-edge bg-surface pl-7 pr-2 text-[11.5px] outline-none focus:border-primary w-48 text-ink placeholder:text-muted/70"
            />
          </div>
          <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
            <span>From:</span>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="h-[26px] rounded border border-edge bg-surface px-1.5 text-[11.5px] outline-none focus:border-primary text-ink"
            />
          </div>
          <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
            <span>To:</span>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className="h-[26px] rounded border border-edge bg-surface px-1.5 text-[11.5px] outline-none focus:border-primary text-ink"
            />
          </div>
          {(search || from || to) && (
            <button
              onClick={() => {
                setSearch("");
                setFrom("");
                setTo("");
                setPage(1);
              }}
              className="text-[11.5px] text-muted hover:text-ink underline ml-1"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Main Table Area */}
      <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-surface">
        {error ? (
          <div className="p-4 text-[12px] text-danger">{error}</div>
        ) : loading && vouchers.length === 0 ? (
          <div className="p-8 text-center text-[12.5px] text-muted">Loading journal vouchers...</div>
        ) : vouchers.length === 0 ? (
          <div className="p-8 text-center text-[12.5px] text-muted">No journal vouchers found.</div>
        ) : (
          <table className="w-full min-w-[750px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-edge bg-faint text-left font-semibold text-muted text-[11px] uppercase tracking-wider">
                <th className="px-3 py-2">Voucher No</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Narration</th>
                <th className="px-3 py-2 text-right">Total Amount</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {vouchers.map((v) => (
                <tr
                  key={v.voucherNo}
                  onClick={() => handleRowClick(v.voucherNo)}
                  className="cursor-pointer hover:bg-faint/60 transition-colors"
                >
                  <td className="px-3 py-2 font-mono font-medium text-primary hover:underline">
                    {v.voucherNo}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-ink">
                    {date(v.date)}
                  </td>
                  <td className="px-3 py-2 max-w-[280px] truncate text-ink" title={v.narration ?? ""}>
                    {v.narration || "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-medium tabular-nums text-ink">
                    {money(v.totalAmount, 2)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Chip tone={v.status === "POSTED" ? "success" : "danger"}>
                      {v.status}
                    </Chip>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted">
                    {v.createdBy || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      <div className="flex h-[36px] shrink-0 items-center justify-between border-t border-edge bg-faint px-3 text-[11.5px] text-muted">
        <div>
          Showing {pagination.total === 0 ? 0 : (page - 1) * pagination.limit + 1} to{" "}
          {Math.min(page * pagination.limit, pagination.total)} of {pagination.total} vouchers
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-[22px] px-2 text-[11px]"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <IconChevronLeft size={12} />
            <span>Prev</span>
          </Button>
          <span className="font-medium text-ink">
            Page {page} of {Math.max(1, pagination.totalPages)}
          </span>
          <Button
            variant="outline"
            className="h-[22px] px-2 text-[11px]"
            disabled={page >= pagination.totalPages || loading}
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
          >
            <span>Next</span>
            <IconChevronRight size={12} />
          </Button>
        </div>
      </div>
    </div>
  );
}

