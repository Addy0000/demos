"use client";

import { useMemo, useState } from "react";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, poStatusTone, grnStatusTone } from "@/components/ui/chip";
import { money, amount, kgPlain, date, titleise } from "@/lib/format";
import { IconChevronRight } from "@/components/icons";

type Line = {
  id: string; lineNo: number; material: string; code: string;
  quantityKg: number; receivedKg: number; ratePerKg: number; lineTotal: number;
};
type Receipt = { id: string; code: string; receivedOn: string; status: string };
type Row = {
  id: string; code: string; status: string; orderedOn: string; expectedOn: string | null;
  totalValue: number; deliveryTerms: string; paymentTerms: string;
  lines: Line[]; receipts: Receipt[];
};

const STATUSES = ["PENDING_APPROVAL", "APPROVED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "CANCELLED"];

/**
 * The vendor's order view. Expandable rather than a wide grid — a vendor cares
 * about what to dispatch next, not about scanning a hundred columns.
 */
export function VendorOrders({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState<string | null>(rows[0]?.id ?? null);

  const filtered = useMemo(() => {
    let out = rows;
    if (status) out = out.filter((r) => r.status === status);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (r) => r.code.toLowerCase().includes(q) || r.lines.some((l) => l.material.toLowerCase().includes(q)),
      );
    }
    return out;
  }, [rows, status, search]);

  const open = rows.filter((r) => ["APPROVED", "PARTIALLY_RECEIVED"].includes(r.status));
  const openValue = open.reduce((a, r) => a + r.totalValue, 0);

  const crumbs: Crumb[] = [{ label: "Orders placed with you" }];
  if (status) crumbs.push({ label: "Status =", value: titleise(status), onRemove: () => setStatus("") });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  return (
    <ListShell
      title="Purchase orders"
      count={filtered.length}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search PO number or material"
      crumbs={crumbs}
      onClearFilters={() => { setStatus(""); setSearch(""); }}
      toolbarExtra={
        <>
          <FilterSelect
            label="Status" value={status} onChange={setStatus}
            options={STATUSES.map((s) => ({ value: s, label: titleise(s) }))}
          />
          {open.length > 0 && (
            <span className="shrink-0 whitespace-nowrap text-[11.5px] text-muted">
              <span className="font-num font-semibold text-ink">{open.length}</span> open ·{" "}
              <span className="font-num font-semibold tabular-nums text-ink">{money(openValue)}</span> to dispatch
            </span>
          )}
        </>
      }
    >
      <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-canvas p-3">
        {filtered.length === 0 ? (
          <p className="py-20 text-center text-[12.5px] text-muted">
            No purchase orders match. Clear the filter to see everything placed with you.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((o) => {
              const expanded = openId === o.id;
              const orderedKg = o.lines.reduce((a, l) => a + l.quantityKg, 0);
              const receivedKg = o.lines.reduce((a, l) => a + l.receivedKg, 0);
              const pct = orderedKg > 0 ? (receivedKg / orderedKg) * 100 : 0;
              const late = o.expectedOn && new Date(o.expectedOn) < new Date() && pct < 99.9;

              return (
                <li key={o.id} className="panel">
                  <button
                    type="button"
                    onClick={() => setOpenId(expanded ? null : o.id)}
                    aria-expanded={expanded}
                    className="flex w-full flex-wrap items-center gap-3 p-3 text-left transition-colors duration-150 hover:bg-faint"
                  >
                    <IconChevronRight
                      size={14}
                      className={`shrink-0 text-nav-dim transition-transform duration-200 ease-out ${expanded ? "rotate-90" : ""}`}
                    />
                    <span className="font-num text-[13px] font-semibold text-ink">{o.code}</span>
                    <Chip tone={poStatusTone(o.status)}>{titleise(o.status)}</Chip>

                    <span className="min-w-0 flex-1 truncate text-[12px] text-muted">
                      {o.lines[0]?.material}
                      {o.lines.length > 1 && ` +${o.lines.length - 1} more`}
                    </span>

                    <span className="shrink-0 text-right text-[11.5px] text-muted">
                      Ordered {date(o.orderedOn)}
                    </span>
                    <span className={`shrink-0 text-right text-[11.5px] ${late ? "font-medium text-danger" : "text-muted"}`}>
                      Due {date(o.expectedOn)}
                    </span>

                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="font-num text-[11.5px] tabular-nums text-muted">{pct.toFixed(0)}%</span>
                      <span className="h-[5px] w-[52px] overflow-hidden rounded-sm bg-faint">
                        <span
                          className="block h-full rounded-sm bg-primary transition-[width] duration-500 ease-out"
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </span>
                    </span>

                    <span className="shrink-0 font-num text-[13px] font-semibold tabular-nums text-ink">
                      {money(o.totalValue)}
                    </span>
                  </button>

                  {expanded && (
                    <div className="animate-pop border-t border-edge">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-edge bg-faint">
                            {["#", "Material", "Ordered kg", "Received kg", "Pending kg", "Rate ₹/kg", "Line total"].map((h, i) => (
                              <th
                                key={h}
                                className={`px-2.5 py-1.5 text-[10.5px] font-semibold text-muted ${i >= 2 ? "text-right" : "text-left"}`}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {o.lines.map((l) => {
                            const outstanding = l.quantityKg - l.receivedKg;
                            return (
                              <tr key={l.id} className="border-b border-edge/60 last:border-b-0">
                                <td className="px-2.5 py-1.5 font-num text-[12px] text-muted">{l.lineNo}</td>
                                <td className="px-2.5 py-1.5 text-[12px] text-ink">
                                  {l.material}
                                  <span className="ml-1.5 font-num text-[11px] text-muted">{l.code}</span>
                                </td>
                                <td className="px-2.5 py-1.5 text-right font-num text-[12px] tabular-nums">{kgPlain(l.quantityKg)}</td>
                                <td className="px-2.5 py-1.5 text-right font-num text-[12px] tabular-nums text-success">{kgPlain(l.receivedKg)}</td>
                                <td className={`px-2.5 py-1.5 text-right font-num text-[12px] tabular-nums ${outstanding > 0.001 ? "font-medium text-warning" : "text-muted"}`}>
                                  {outstanding > 0.001 ? kgPlain(outstanding) : "—"}
                                </td>
                                <td className="px-2.5 py-1.5 text-right font-num text-[12px] tabular-nums text-muted">{amount(l.ratePerKg)}</td>
                                <td className="px-2.5 py-1.5 text-right font-num text-[12px] font-medium tabular-nums">{amount(l.lineTotal)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-edge bg-faint px-3 py-2 text-[11.5px] text-muted">
                        <span>Delivery <span className="text-ink">{o.deliveryTerms}</span></span>
                        <span>Payment <span className="text-ink">{o.paymentTerms}</span></span>
                        {o.receipts.length > 0 && (
                          <span className="flex items-center gap-1.5">
                            Received against:
                            {o.receipts.map((g) => (
                              <span key={g.id} className="flex items-center gap-1">
                                <span className="font-num text-ink">{g.code}</span>
                                <Chip tone={grnStatusTone(g.status)}>{titleise(g.status)}</Chip>
                                <span>{date(g.receivedOn)}</span>
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ListShell>
  );
}
