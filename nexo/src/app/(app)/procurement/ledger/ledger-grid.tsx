"use client";

import { useRowHeight } from "@/components/appearance";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, movementTone } from "@/components/ui/chip";
import { kgPlain, amount, dateTime, titleise } from "@/lib/format";
import { IconColumnFilter, IconSortAsc, IconSortDesc } from "@/components/icons";

type Row = {
  id: string; kind: string; quantityKg: number; ratePerKg: number | null; value: number | null;
  reference: string; remark: string; occurredAt: string;
  materialId: string; materialCode: string; materialName: string; category: string;
  batchId: string | null; batchNo: string; user: string;
};

const WINDOW = 300;
const KINDS = [
  "GRN_RECEIPT", "GRN_REJECT", "ISSUE_TO_PRODUCTION", "ISSUE_TO_LAB", "RETURN_TO_STORE",
  "RETURN_TO_VENDOR", "ADJUSTMENT_POSITIVE", "ADJUSTMENT_NEGATIVE", "TRANSFER", "SCRAP",
];

const COLUMNS = [
  { key: "occurredAt", header: "When", width: 140, align: "left" as const, sortable: true },
  { key: "kind", header: "Movement", width: 170, align: "left" as const },
  { key: "materialCode", header: "Code", width: 84, align: "left" as const },
  { key: "materialName", header: "Material", width: 250, align: "left" as const },
  { key: "batchNo", header: "Batch", width: 130, align: "left" as const },
  { key: "quantityKg", header: "Quantity (kg)", width: 128, align: "right" as const },
  { key: "ratePerKg", header: "Rate ₹/kg", width: 100, align: "right" as const },
  { key: "value", header: "Value ₹", width: 128, align: "right" as const },
  { key: "reference", header: "Reference", width: 130, align: "left" as const },
  { key: "user", header: "By", width: 140, align: "left" as const },
  { key: "remark", header: "Remark", width: 260, align: "left" as const },
];

const TEMPLATE = COLUMNS.map((c) => `${c.width}px`).join(" ");
const TOTAL_W = COLUMNS.reduce((a, c) => a + c.width, 0);

/**
 * Windowed infinite grid over the whole stock ledger.
 *
 * Rows are fetched in slices as the virtualizer scrolls into them and cached by
 * index, so the browser holds only what has actually been looked at. Filter and
 * sort changes reset the cache and re-request from the server.
 */
export function LedgerGrid({
  total: initialTotal,
  materials,
}: {
  total: number;
  materials: { id: string; code: string; name: string }[];
}) {
  const [cache, setCache] = useState<Map<number, Row>>(new Map());
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [cursor, setCursor] = useState(-1);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inflight = useRef<Set<number>>(new Set());

  /**
   * Responses are matched against the filter state they were requested under, so a
   * slow early query can never overwrite a fast later one. This is a value derived
   * from the filters rather than an incrementing counter: StrictMode mounts effects
   * twice in development, and a counter would bump itself past the only in-flight
   * request and discard it as stale.
   */
  const filterKey = `${kind}|${materialId}|${debouncedQ}|${dir}`;
  const liveKey = useRef(filterKey);
  liveKey.current = filterKey;
  const prevKey = useRef(filterKey);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 220);
    return () => clearTimeout(t);
  }, [q]);

  // Any real filter change invalidates every cached window.
  useEffect(() => {
    if (prevKey.current === filterKey) return;
    prevKey.current = filterKey;
    inflight.current.clear();
    setCache(new Map());
    setCursor(-1);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [filterKey]);

  const ROW_H = useRowHeight();
  const virtualizer = useVirtualizer({
    count: total,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 12,
  });
  // A style change moves --row-h; re-measure so rows sit on the new rhythm.
  useEffect(() => {
    virtualizer.measure();
  }, [ROW_H, virtualizer]);

  const items = virtualizer.getVirtualItems();

  const fetchWindow = useCallback(
    async (startIndex: number) => {
      const block = Math.floor(startIndex / WINDOW) * WINDOW;
      if (inflight.current.has(block)) return;
      if (cache.has(block)) return;

      inflight.current.add(block);
      const myKey = filterKey;
      setLoading(true);

      try {
        const params = new URLSearchParams({ skip: String(block), take: String(WINDOW), dir });
        if (kind) params.set("kind", kind);
        if (materialId) params.set("materialId", materialId);
        if (debouncedQ) params.set("q", debouncedQ);

        const res = await fetch(`/api/ledger?${params}`);
        if (!res.ok) return;
        const data = (await res.json()) as { rows: Row[]; total: number };

        if (liveKey.current !== myKey) return; // a newer filter won

        setTotal(data.total);
        setCache((prev) => {
          const next = new Map(prev);
          data.rows.forEach((row, i) => next.set(block + i, row));
          return next;
        });
      } finally {
        inflight.current.delete(block);
        setLoading(false);
      }
    },
    [cache, dir, kind, materialId, debouncedQ, filterKey],
  );

  // Request whatever window the viewport is about to need.
  useEffect(() => {
    if (items.length === 0) {
      void fetchWindow(0);
      return;
    }
    const first = items[0]!.index;
    const last = items[items.length - 1]!.index;
    void fetchWindow(first);
    if (Math.floor(last / WINDOW) !== Math.floor(first / WINDOW)) void fetchWindow(last);
  }, [items, fetchWindow]);

  // Keyboard: j/k move through the ledger without touching the mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const move = (d: number) => {
        e.preventDefault();
        setCursor((c) => {
          const next = Math.max(0, Math.min(total - 1, c < 0 ? 0 : c + d));
          virtualizer.scrollToIndex(next, { align: "auto" });
          return next;
        });
      };
      if (e.key === "j" || e.key === "ArrowDown") move(1);
      else if (e.key === "k" || e.key === "ArrowUp") move(-1);
      else if (e.key === "Escape") setCursor(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [total, virtualizer]);

  const crumbs: Crumb[] = [{ label: "All movements" }];
  if (kind) crumbs.push({ label: "Movement =", value: titleise(kind), onRemove: () => setKind("") });
  if (materialId) {
    const m = materials.find((x) => x.id === materialId);
    crumbs.push({ label: "Material =", value: m?.name ?? "", onRemove: () => setMaterialId("") });
  }
  if (debouncedQ) crumbs.push({ label: "Matching", value: `“${debouncedQ}”`, onRemove: () => setQ("") });

  const loadedCount = cache.size;

  return (
    <ListShell
      title="Stock ledger"
      count={total}
      search={q}
      onSearchChange={setQ}
      searchPlaceholder="Search material, batch, reference"
      crumbs={crumbs}
      onClearFilters={() => { setKind(""); setMaterialId(""); setQ(""); }}
      toolbarExtra={
        <>
          <FilterSelect
            label="Movement" value={kind} onChange={setKind}
            options={KINDS.map((k) => ({ value: k, label: titleise(k) }))}
          />
          <select
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
            aria-label="Filter by material"
            className="h-[26px] w-[190px] shrink-0 rounded border border-edge bg-surface px-1.5 text-[12px] text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/12"
          >
            <option value="">Material: all</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <span className="shrink-0 whitespace-nowrap font-num text-[11px] tabular-nums text-muted">
            {loadedCount.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")} loaded
          </span>
        </>
      }
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        {loading && (
          <span className="absolute left-0 right-0 top-0 z-30 h-[2px] overflow-hidden bg-transparent">
            <span className="animate-rail block h-[2px] w-1/4 bg-primary" />
          </span>
        )}

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto scroll-thin bg-surface">
          <div style={{ width: TOTAL_W, minWidth: "100%" }}>
            <div
              role="row"
              className="grid-head grid items-center"
              style={{ gridTemplateColumns: TEMPLATE, height: 30 }}
            >
              {COLUMNS.map((c) => (
                <div
                  key={c.key}
                  role="columnheader"
                  className={`flex h-full items-center gap-1 px-2.5 ${c.align === "right" ? "justify-end" : ""}`}
                >
                  <IconColumnFilter size={11} className="shrink-0 text-nav-dim" />
                  {c.sortable ? (
                    <button
                      type="button"
                      onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))}
                      className="flex min-w-0 items-center gap-0.5 truncate text-primary transition-colors duration-150 hover:text-primary-hover"
                      title="Toggle sort direction"
                    >
                      <span className="truncate">{c.header}</span>
                      {dir === "asc" ? <IconSortAsc size={12} /> : <IconSortDesc size={12} />}
                    </button>
                  ) : (
                    <span className="truncate">{c.header}</span>
                  )}
                </div>
              ))}
            </div>

            {total === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1.5 py-20 text-center">
                <p className="text-[14px] font-medium text-ink">No movements match</p>
                <p className="max-w-sm text-[12.5px] text-muted">
                  Clear the movement or material filter to see the whole ledger.
                </p>
              </div>
            ) : (
              <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                {items.map((v) => {
                  const row = cache.get(v.index);
                  const isCur = v.index === cursor;

                  if (!row) {
                    return (
                      <div
                        key={v.key}
                        className="grid-row grid items-center"
                        style={{
                          gridTemplateColumns: TEMPLATE,
                          position: "absolute", top: 0, left: 0,
                          transform: `translateY(${v.start}px)`, height: ROW_H, width: TOTAL_W,
                        }}
                      >
                        {COLUMNS.map((c) => (
                          <div key={c.key} className={`grid-cell ${c.align === "right" ? "flex justify-end" : ""}`}>
                            {/* Visible against the row, not a whisper on white. */}
                            <span
                              className="my-auto block h-[9px] animate-pulse rounded-sm bg-accent-soft/70"
                              style={{ width: `${45 + ((c.key.length * 7) % 35)}%` }}
                            />
                          </div>
                        ))}
                      </div>
                    );
                  }

                  const qty = row.quantityKg;
                  return (
                    <div
                      key={v.key}
                      role="row"
                      onClick={() => setCursor(v.index)}
                      className={`grid-row grid items-center ${isCur ? "ring-1 ring-inset ring-primary/45" : ""}`}
                      style={{
                        gridTemplateColumns: TEMPLATE,
                        position: "absolute", top: 0, left: 0,
                        transform: `translateY(${v.start}px)`, height: ROW_H, width: TOTAL_W,
                      }}
                    >
                      <div className="grid-cell tnum text-muted">{dateTime(row.occurredAt)}</div>
                      <div className="grid-cell">
                        <Chip tone={movementTone(row.kind)}>{titleise(row.kind)}</Chip>
                      </div>
                      <div className="grid-cell">
                        <Link href={`/procurement/materials/${row.materialId}`} className="ref-link font-num" onClick={(e) => e.stopPropagation()}>
                          {row.materialCode}
                        </Link>
                      </div>
                      <div className="grid-cell">
                        <Link href={`/procurement/materials/${row.materialId}`} className="ref-link" onClick={(e) => e.stopPropagation()}>
                          {row.materialName}
                        </Link>
                      </div>
                      <div className="grid-cell">
                        {row.batchId ? (
                          <Link href={`/procurement/inventory/${row.batchId}`} className="ref-link font-num" onClick={(e) => e.stopPropagation()}>
                            {row.batchNo}
                          </Link>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </div>
                      <div className={`grid-cell text-right tnum font-medium ${qty >= 0 ? "text-success" : "text-ink"}`}>
                        {qty >= 0 ? "+" : ""}{kgPlain(qty)}
                      </div>
                      <div className="grid-cell text-right tnum text-muted">
                        {row.ratePerKg ? amount(row.ratePerKg) : "—"}
                      </div>
                      <div className="grid-cell text-right tnum">
                        {row.value !== null ? amount(row.value) : "—"}
                      </div>
                      <div className="grid-cell text-muted">{row.reference}</div>
                      <div className="grid-cell text-muted">{row.user}</div>
                      <div className="grid-cell text-muted">{row.remark || "—"}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex h-[26px] shrink-0 items-center gap-3 border-t border-edge bg-faint px-3 text-[11px] text-muted">
          <span>
            Virtualized — {total.toLocaleString("en-IN")} rows, fetched in windows of {WINDOW} as you scroll
          </span>
          <span className="ml-auto flex items-center gap-1">
            <kbd className="rounded border border-edge bg-surface px-1 py-px font-num">j</kbd>
            <kbd className="rounded border border-edge bg-surface px-1 py-px font-num">k</kbd>
            to move
          </span>
        </div>
      </div>
    </ListShell>
  );
}
