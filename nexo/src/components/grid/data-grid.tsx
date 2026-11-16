"use client";

import { useRowHeight } from "@/components/appearance";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useReportOptional } from "@/components/report/report-context";
import {
  IconColumnFilter,
  IconSortAsc,
  IconSortDesc,
  IconInfo,
  IconChevronRight,
} from "@/components/icons";

export type Column<T> = {
  key: string;
  header: string;
  /** Fixed px width — the grid is a real grid, so columns align across rows. */
  width: number;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  render: (row: T) => React.ReactNode;
  /** Plain-text value used by the in-grid quick filter. */
  text?: (row: T) => string;
};

export type GridRow = { id: string };

/** Below this, plain rendering wins — virtualization costs more than it saves. */
const VIRTUALIZE_ABOVE = 120;

export function DataGrid<T extends GridRow>({
  rows,
  columns,
  hrefFor,
  onInfo,
  sort,
  onSortChange,
  quickFilter,
  emptyTitle = "Nothing here yet",
  emptyBody = "No records match the current filter.",
  selectable = true,
  renderBulkBar,
}: {
  rows: T[];
  columns: Column<T>[];
  hrefFor?: (row: T) => string;
  onInfo?: (row: T) => void;
  sort?: { key: string; dir: "asc" | "desc" };
  onSortChange?: (key: string) => void;
  quickFilter?: string;
  emptyTitle?: string;
  emptyBody?: string;
  selectable?: boolean;
  renderBulkBar?: (selected: string[], clear: () => void) => React.ReactNode;
}) {
  const router = useRouter();
  const printing = useReportOptional()?.printing ?? false;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(-1);

  // Client-side quick filter across the columns that declare text().
  const filtered = useMemo(() => {
    const q = quickFilter?.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      columns.some((c) => c.text?.(r).toLowerCase().includes(q)),
    );
  }, [rows, columns, quickFilter]);

  const virtualize = filtered.length > VIRTUALIZE_ABOVE;

  const ROW_H = useRowHeight();
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 14,
    enabled: virtualize,
  });
  // A style change moves --row-h; re-measure so rows sit on the new rhythm.
  useEffect(() => {
    virtualizer.measure();
  }, [ROW_H, virtualizer]);

  const gridTemplate = useMemo(() => {
    const lead = `${selectable ? "34px " : ""}${onInfo ? "30px " : ""}`;
    return lead + columns.map((c) => `${c.width}px`).join(" ");
  }, [columns, selectable, onInfo]);

  const totalWidth = useMemo(
    () => (selectable ? 34 : 0) + (onInfo ? 30 : 0) + columns.reduce((a, c) => a + c.width, 0),
    [columns, selectable, onInfo],
  );

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const openRow = useCallback(
    (row: T) => {
      if (!hrefFor) return;
      const href = hrefFor(row);
      // View Transitions: the row's title morphs into the detail header.
      const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
      if (doc.startViewTransition) {
        doc.startViewTransition(() => router.push(href));
      } else {
        router.push(href);
      }
    },
    [hrefFor, router],
  );

  // Keyboard: j/k or arrows move, x selects, Enter opens, Esc clears.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (filtered.length === 0) return;

      const move = (delta: number) => {
        e.preventDefault();
        setCursor((c) => {
          const next = Math.max(0, Math.min(filtered.length - 1, c < 0 ? 0 : c + delta));
          if (virtualize) virtualizer.scrollToIndex(next, { align: "auto" });
          else
            scrollRef.current
              ?.querySelector<HTMLElement>(`[data-row-idx="${next}"]`)
              ?.scrollIntoView({ block: "nearest" });
          return next;
        });
      };

      if (e.key === "j" || e.key === "ArrowDown") move(1);
      else if (e.key === "k" || e.key === "ArrowUp") move(-1);
      else if (e.key === "x" && cursor >= 0) {
        e.preventDefault();
        const row = filtered[cursor];
        if (row) toggle(row.id);
      } else if (e.key === "Enter" && cursor >= 0) {
        e.preventDefault();
        const row = filtered[cursor];
        if (row) openRow(row);
      } else if (e.key === "Escape") {
        clearSelection();
        setCursor(-1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filtered, cursor, toggle, openRow, clearSelection, virtualize, virtualizer]);

  const allSelected = filtered.length > 0 && selected.size === filtered.length;

  if (filtered.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1.5 bg-surface px-6 py-20 text-center">
        <p className="text-[14px] font-medium text-ink">{emptyTitle}</p>
        <p className="max-w-sm text-[12.5px] leading-relaxed text-muted">{emptyBody}</p>
      </div>
    );
  }

  const items = virtualizer.getVirtualItems();

  const renderRow = (row: T, index: number, style?: React.CSSProperties) => {
    const isSel = selected.has(row.id);
    const isCur = index === cursor;
    return (
      <div
        key={row.id}
        role="row"
        data-row-idx={index}
        data-href={hrefFor ? hrefFor(row) : undefined}
        data-selected={isSel}
        style={{ ...style, gridTemplateColumns: gridTemplate, width: totalWidth }}
        onClick={() => setCursor(index)}
        onDoubleClick={() => openRow(row)}
        className={[
          "grid-row grid items-center",
          isCur ? "ring-1 ring-inset ring-primary/45" : "",
        ].join(" ")}
      >
        {selectable && (
          <div className="grid h-full place-items-center">
            <input
              type="checkbox"
              checked={isSel}
              onChange={() => toggle(row.id)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select row ${index + 1}`}
              className="h-[13px] w-[13px] cursor-pointer accent-primary"
            />
          </div>
        )}

        {onInfo && (
          <div className="grid h-full place-items-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onInfo(row);
              }}
              aria-label="Preview record"
              className="grid h-5 w-5 place-items-center rounded-full text-nav-dim transition-colors duration-150 hover:bg-pastel hover:text-primary"
            >
              <IconInfo size={14} />
            </button>
          </div>
        )}

        {columns.map((c) => (
          <div
            key={c.key}
            role="gridcell"
            className={[
              "grid-cell",
              c.align === "right" ? "text-right tnum" : c.align === "center" ? "text-center" : "",
            ].join(" ")}
          >
            {c.render(row)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-report-source data-tour="grid">
      {/* The flat report table: every filtered row, mounted only while a document is
          being generated so a 5,000-row list costs nothing on screen. */}
      {printing && (
        <table data-report-table className="report-table hidden print:table">
          <thead>
            <tr>
              <th className="report-idx">#</th>
              {columns.map((c) => (
                <th key={c.key} className={c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => (
              <tr key={row.id}>
                <td className="report-idx">{i + 1}</td>
                {columns.map((c) => (
                  <td key={c.key} className={c.align === "right" ? "text-right tnum" : c.align === "center" ? "text-center" : ""}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto scroll-thin bg-surface print:hidden">
        <div style={{ width: totalWidth, minWidth: "100%" }}>
          {/* Header */}
          <div
            role="row"
            className="grid-head grid items-center"
            style={{ gridTemplateColumns: gridTemplate, height: 30 }}
          >
            {selectable && (
              <div className="grid h-full place-items-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(allSelected ? new Set() : new Set(filtered.map((r) => r.id)))
                  }
                  aria-label="Select all rows"
                  className="h-[13px] w-[13px] cursor-pointer accent-primary"
                />
              </div>
            )}
            {onInfo && <div />}

            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <div
                  key={c.key}
                  role="columnheader"
                  aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
                  className={`flex h-full items-center gap-1 px-2.5 ${c.align === "right" ? "justify-end" : ""}`}
                >
                  <IconColumnFilter size={11} className="shrink-0 text-nav-dim" />
                  {c.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(c.key)}
                      className={`flex min-w-0 items-center gap-0.5 truncate transition-colors duration-150 hover:text-primary ${active ? "text-primary" : ""}`}
                      title={`Sort by ${c.header}`}
                    >
                      <span className="truncate">{c.header}</span>
                      {active &&
                        (sort!.dir === "asc" ? (
                          <IconSortAsc size={12} className="shrink-0" />
                        ) : (
                          <IconSortDesc size={12} className="shrink-0" />
                        ))}
                    </button>
                  ) : (
                    <span className="truncate">{c.header}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Rows */}
          {virtualize ? (
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {items.map((v) => {
                const row = filtered[v.index]!;
                return renderRow(row, v.index, {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  transform: `translateY(${v.start}px)`,
                  height: ROW_H,
                });
              })}
            </div>
          ) : (
            filtered.map((row, i) => renderRow(row, i))
          )}
        </div>
      </div>

      {/* Bulk action bar — appears only when a selection exists. */}
      {selected.size > 0 && (
        <div className="animate-slide-in absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-md border border-edge bg-surface px-3 py-2 shadow-pop">
          <span className="text-[12px] font-medium text-ink">
            {selected.size} selected
          </span>
          {renderBulkBar?.(Array.from(selected), clearSelection)}
          <button
            type="button"
            onClick={clearSelection}
            className="rounded px-2 py-1 text-[12px] text-muted transition-colors duration-150 hover:bg-faint hover:text-ink"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

/** Reference field — the underlined blue link from the source grid. */
export function RefLink({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
        if (doc.startViewTransition) doc.startViewTransition(() => router.push(href));
        else router.push(href);
      }}
      className="ref-link"
    >
      {children}
    </a>
  );
}

export function GridChevron() {
  return <IconChevronRight size={13} className="text-nav-dim" />;
}
