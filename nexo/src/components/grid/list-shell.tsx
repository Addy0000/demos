"use client";

import { useState } from "react";
import Link from "next/link";
import { GenerateMenu } from "@/components/report/generate-menu";
import { IconSearch, IconPlus, IconFilter, IconClose, IconChevronsLeft, IconChevronsRight, IconChevronLeft, IconChevronRight, IconRefresh } from "@/components/icons";

export type Crumb = { label: string; value?: string; onRemove?: () => void };

/**
 * The list surface chrome: title, primary action, in-grid search, pagination and
 * the filter breadcrumb — arranged as in the pinned reference.
 */
export function ListShell({
  title,
  count,
  newHref,
  newLabel = "New",
  search,
  onSearchChange,
  searchPlaceholder = "Search",
  crumbs = [],
  onClearFilters,
  page,
  pageSize,
  total,
  onPageChange,
  toolbarExtra,
  children,
}: {
  title: string;
  count?: number;
  newHref?: string;
  newLabel?: string;
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  crumbs?: Crumb[];
  onClearFilters?: () => void;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  toolbarExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [refreshing, setRefreshing] = useState(false);

  const showPager = page !== undefined && pageSize !== undefined && total !== undefined && onPageChange;
  const from = showPager ? Math.min(page * pageSize + 1, total) : 0;
  const to = showPager ? Math.min((page + 1) * pageSize, total) : 0;
  const lastPage = showPager ? Math.max(0, Math.ceil(total / pageSize) - 1) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar */}
      <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-edge bg-faint px-3" data-tour="list-toolbar" data-print-hide>
        <h1 className="shrink-0 text-[14px] font-semibold tracking-tight text-ink">{title}</h1>
        {count !== undefined && (
          <span className="shrink-0 rounded-sm bg-pastel px-1.5 py-px font-num text-[11px] font-medium tabular-nums text-primary">
            {count.toLocaleString("en-IN")}
          </span>
        )}

        {newHref && (
          <Link
            href={newHref}
            data-tour="list-new"
            className="ml-1 flex h-[26px] shrink-0 items-center gap-1 rounded bg-primary px-2.5 text-[12px] font-medium text-white transition-colors duration-150 hover:bg-primary-hover"
          >
            <IconPlus size={13} />
            {newLabel}
          </Link>
        )}

        {onSearchChange && (
          <div className="relative ml-1 w-full max-w-[260px]">
            <IconSearch size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-[26px] w-full rounded border border-edge bg-surface pl-7 pr-7 text-[12px] text-ink placeholder:text-muted/75 transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/12"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-faint hover:text-ink"
              >
                <IconClose size={11} />
              </button>
            )}
          </div>
        )}

        {toolbarExtra}

        <div className="flex-1" />

        <GenerateMenu kind="report" />

        <button
          type="button"
          onClick={() => {
            setRefreshing(true);
            setTimeout(() => setRefreshing(false), 600);
            window.location.reload();
          }}
          aria-label="Refresh"
          title="Refresh"
          className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded text-muted transition-colors duration-150 hover:bg-pastel hover:text-primary"
        >
          <IconRefresh size={14} className={refreshing ? "animate-spin" : ""} />
        </button>

        {showPager && (
          <div className="flex shrink-0 items-center gap-0.5">
            <span className="mr-1.5 whitespace-nowrap font-num text-[11.5px] tabular-nums text-muted">
              {total === 0 ? "0" : `${from.toLocaleString("en-IN")}–${to.toLocaleString("en-IN")}`} of{" "}
              {total.toLocaleString("en-IN")}
            </span>
            <PagerBtn label="First page" disabled={page === 0} onClick={() => onPageChange(0)}>
              <IconChevronsLeft size={14} />
            </PagerBtn>
            <PagerBtn label="Previous page" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
              <IconChevronLeft size={14} />
            </PagerBtn>
            <PagerBtn label="Next page" disabled={page >= lastPage} onClick={() => onPageChange(page + 1)}>
              <IconChevronRight size={14} />
            </PagerBtn>
            <PagerBtn label="Last page" disabled={page >= lastPage} onClick={() => onPageChange(lastPage)}>
              <IconChevronsRight size={14} />
            </PagerBtn>
          </div>
        )}
      </div>

      {/* Filter breadcrumb */}
      {crumbs.length > 0 && (
        <div className="flex h-[30px] shrink-0 items-center gap-1.5 border-b border-edge bg-surface px-3">
          <IconFilter size={12} className="shrink-0 text-muted" />
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted/60">›</span>}
              <span className="flex items-center gap-1 rounded-sm bg-faint px-1.5 py-px text-[11.5px] text-ink">
                <span className="text-muted">{c.label}</span>
                {c.value && <span className="font-medium">{c.value}</span>}
                {c.onRemove && (
                  <button
                    type="button"
                    onClick={c.onRemove}
                    aria-label={`Remove filter ${c.label}`}
                    className="ml-0.5 grid h-3.5 w-3.5 place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-danger-bg hover:text-danger-text"
                  >
                    <IconClose size={9} />
                  </button>
                )}
              </span>
            </span>
          ))}
          {onClearFilters && crumbs.some((c) => c.onRemove) && (
            <button
              type="button"
              onClick={onClearFilters}
              className="ml-1 rounded px-1.5 py-px text-[11.5px] text-primary transition-colors duration-150 hover:bg-pastel"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {children}
    </div>
  );
}

function PagerBtn({
  children,
  disabled,
  onClick,
  label,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-[24px] w-[24px] place-items-center rounded text-muted transition-colors duration-150 hover:bg-pastel hover:text-primary disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** Dropdown used for status/category filters in list toolbars. */
export function FilterSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="h-[26px] shrink-0 rounded border border-edge bg-surface px-1.5 text-[12px] text-ink transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/12"
    >
      <option value="">{label}: all</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
