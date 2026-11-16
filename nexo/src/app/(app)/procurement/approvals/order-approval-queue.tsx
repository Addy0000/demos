"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { approvePurchaseOrder } from "../actions";
import { safeAction } from "@/lib/safe-action";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, vendorStatusTone } from "@/components/ui/chip";
import { Button } from "@/components/ui/form";
import { money, date, relative, titleise } from "@/lib/format";
import { IconApprove, IconAlert, IconCheck, IconClose, IconChevronRight } from "@/components/icons";

type Row = {
  id: string; code: string; value: number; tier: string;
  vendorId: string; vendorName: string; vendorRating: number; vendorStatus: string;
  orderedOn: string; expectedOn: string | null;
  raisedById: string | null; raisedBy: string; lineCount: number; firstMaterial: string;
  overRate: number; canApprove: boolean; blockedReason: string | null;
};

/**
 * The purchase approval queue.
 *
 * Orders above the signer's limit are shown rather than hidden — an approver
 * needs to know what is waiting on someone else, and hiding it makes the queue
 * look empty when the business is actually blocked.
 */
export function OrderApprovalQueue({
  rows,
  roleLabel,
  limit,
}: {
  rows: Row[];
  roleLabel: string;
  limit: number | null;
  currentUserId: string;
}) {
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [, startTransition] = useTransition();
  const [done, addDone] = useOptimistic<string[], string>([], (s, id) => [...s, id]);

  const filtered = useMemo(() => {
    let out = rows.filter((r) => !done.includes(r.id));
    if (tier) out = out.filter((r) => r.tier === tier);
    if (onlyMine) out = out.filter((r) => r.canApprove);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (r) =>
          r.code.toLowerCase().includes(q) ||
          r.vendorName.toLowerCase().includes(q) ||
          r.firstMaterial.toLowerCase().includes(q),
      );
    }
    return out;
  }, [rows, done, tier, onlyMine, search]);

  const mine = filtered.filter((r) => r.canApprove);
  const waiting = filtered.filter((r) => !r.canApprove);
  const mineValue = mine.reduce((a, r) => a + r.value, 0);

  function approve(id: string) {
    startTransition(async () => {
      addDone(id);
      const res = await safeAction(() => approvePurchaseOrder(id));
      setNotice(res.error ? { tone: "err", text: res.error } : { tone: "ok", text: res.success ?? "Approved." });
    });
  }

  const crumbs: Crumb[] = [{ label: "Status =", value: "Pending approval" }];
  if (tier) crumbs.push({ label: "Tier =", value: titleise(tier), onRemove: () => setTier("") });
  if (onlyMine) crumbs.push({ label: "Within", value: "my authority", onRemove: () => setOnlyMine(false) });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  return (
    <ListShell
      title="Order approvals"
      count={filtered.length}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search PO, vendor, material"
      crumbs={crumbs}
      onClearFilters={() => { setTier(""); setOnlyMine(false); setSearch(""); }}
      toolbarExtra={
        <>
          <FilterSelect
            label="Tier" value={tier} onChange={setTier}
            options={[
              { value: "HEAD", label: "Purchase Head" },
              { value: "MANAGEMENT", label: "Management" },
            ]}
          />
          <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12px] text-ink">
            <input
              type="checkbox"
              checked={onlyMine}
              onChange={(e) => setOnlyMine(e.target.checked)}
              className="h-[13px] w-[13px] accent-primary"
            />
            Within my authority
          </label>
          <span className="ml-1 shrink-0 whitespace-nowrap text-[11.5px] text-muted">
            You are <span className="font-medium text-ink">{roleLabel}</span>
            {limit === null ? (
              <span> · no value ceiling</span>
            ) : (
              <> · limit <span className="font-num font-semibold tabular-nums text-ink">{money(limit)}</span></>
            )}
          </span>
        </>
      }
    >
      {notice && (
        <div
          role="status"
          className={`flex shrink-0 items-center gap-2 border-b px-3 py-2 text-[12px] ${
            notice.tone === "ok" ? "border-success/30 bg-success-bg" : "border-danger/30 bg-danger-bg"
          }`}
        >
          {notice.tone === "ok" ? <IconCheck size={14} className="text-success" /> : <IconAlert size={14} className="text-danger" />}
          <span className="flex-1 text-ink">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="text-muted hover:text-ink">
            <IconClose size={12} />
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-canvas p-3">
        {filtered.length === 0 ? (
          <div className="grid place-items-center py-24 text-center">
            <div>
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-success-bg text-success">
                <IconCheck size={20} />
              </span>
              <p className="mt-3 text-[14px] font-medium text-ink">Nothing waiting on you</p>
              <p className="mt-1 text-[12.5px] text-muted">
                Every purchase order has been dealt with. New ones arrive here as they are raised.
              </p>
            </div>
          </div>
        ) : (
          <>
            {mine.length > 0 && (
              <>
                <p className="mb-2 flex items-baseline gap-2 text-[11.5px] font-semibold text-ink">
                  Awaiting your signature
                  <span className="font-num text-[11px] font-normal normal-case tracking-normal text-muted">
                    {mine.length} order{mine.length === 1 ? "" : "s"} · {money(mineValue)}
                  </span>
                </p>
                <ul className="mb-4 flex flex-col gap-2">
                  {mine.map((r) => <OrderCard key={r.id} row={r} onApprove={approve} />)}
                </ul>
              </>
            )}

            {waiting.length > 0 && (
              <>
                <p className="mb-2 text-[11.5px] font-semibold text-muted">
                  Waiting on someone else — {waiting.length}
                </p>
                <ul className="flex flex-col gap-2 opacity-70">
                  {waiting.map((r) => <OrderCard key={r.id} row={r} onApprove={approve} />)}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </ListShell>
  );
}

function OrderCard({ row, onApprove }: { row: Row; onApprove: (id: string) => void }) {
  const late = row.expectedOn && new Date(row.expectedOn) < new Date();

  return (
    <li className="panel">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <div className="min-w-[220px] flex-1">
          <Link href={`/procurement/orders/${row.id}`} className="ref-link text-[13px] font-medium">
            {row.code}
          </Link>
          <p className="mt-0.5 text-[11.5px] text-muted">
            <Link href={`/procurement/vendors/${row.vendorId}`} className="ref-link">{row.vendorName}</Link>
            <span className="ml-1.5">rating {row.vendorRating.toFixed(1)}</span>
            {row.vendorStatus !== "ACTIVE" && (
              <span className="ml-1.5"><Chip tone={vendorStatusTone(row.vendorStatus)}>{titleise(row.vendorStatus)}</Chip></span>
            )}
          </p>
          <p className="mt-1 truncate text-[11.5px] text-muted">
            {row.firstMaterial}
            {row.lineCount > 1 && ` +${row.lineCount - 1} more`}
            {" · raised by "}
            <span className="text-ink">{row.raisedBy}</span> {relative(row.orderedOn)}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[10.5px] text-muted">Order value</p>
          <p className="font-num text-[16px] font-semibold tabular-nums text-ink">{money(row.value)}</p>
          <p className="text-[10.5px] text-muted">
            {row.tier === "MANAGEMENT" ? "Management tier" : "Head tier"}
          </p>
        </div>

        <div className="shrink-0 border-l border-edge pl-3 text-right">
          <p className="text-[10.5px] text-muted">Expected</p>
          <p className={`text-[12px] ${late ? "font-medium text-danger" : "text-ink"}`}>{date(row.expectedOn)}</p>
          {row.overRate > 0 && (
            <p className="mt-0.5">
              <Chip tone="warning">
                {row.overRate} line{row.overRate === 1 ? "" : "s"} above approved rate
              </Chip>
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 self-center">
          {row.canApprove ? (
            <Button variant="success" onClick={() => onApprove(row.id)}>
              <IconApprove size={13} />
              Approve
            </Button>
          ) : (
            <span className="flex items-center gap-1.5 rounded border border-edge bg-faint px-2.5 py-1 text-[11.5px] text-muted">
              <IconAlert size={12} />
              {row.blockedReason}
            </span>
          )}
          <Link
            href={`/procurement/orders/${row.id}`}
            className="grid h-[28px] w-[28px] place-items-center rounded border border-edge bg-surface text-muted transition-colors duration-150 hover:bg-pastel hover:text-primary"
            aria-label={`Open ${row.code}`}
          >
            <IconChevronRight size={14} />
          </Link>
        </div>
      </div>
    </li>
  );
}
