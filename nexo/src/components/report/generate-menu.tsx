"use client";

import { useEffect, useRef, useState } from "react";
import { useReportOptional, type DocKind } from "@/components/report/report-context";
import { IconChevronDown, IconDownload, IconPrinter, IconDocument } from "@/components/icons";

const NOUN: Record<DocKind, string> = { report: "report", document: "document", page: "page" };

/**
 * The one Generate control. It sits in the page's own toolbar (list or record
 * header); the top bar carries a copy only on screens that have no toolbar of
 * their own, so a screen never shows two.
 */
export function GenerateMenu({
  kind,
  tone = "light",
  local = true,
}: {
  kind: DocKind;
  tone?: "light" | "dark";
  /** Page-level copies register so the top-bar fallback can step aside. */
  local?: boolean;
}) {
  const report = useReportOptional();
  const [open, setOpen] = useState(false);
  const [canCsv, setCanCsv] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "err" } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const firstItem = useRef<HTMLButtonElement>(null);

  const registerLocal = report?.registerLocal;
  useEffect(() => {
    if (!local || !registerLocal) return;
    return registerLocal();
  }, [local, registerLocal]);

  useEffect(() => {
    if (!open) return;
    firstItem.current?.focus();
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        wrap.current?.querySelector<HTMLButtonElement>("[data-generate-trigger]")?.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open, report]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  if (!report) return null;

  const noun = NOUN[kind];
  const trigger =
    tone === "dark"
      ? "h-8 gap-1.5 rounded border border-white/10 bg-white/[0.06] px-2.5 text-nav-text hover:border-white/20 hover:bg-white/[0.1] hover:text-white"
      : "h-[26px] gap-1 rounded border border-edge bg-surface px-2 text-ink hover:border-accent hover:bg-pastel/60";

  return (
    <div ref={wrap} className="relative shrink-0" data-print-hide>
      <button
        type="button"
        data-generate-trigger
        data-tour="generate"
        onClick={() => {
          if (!open) setCanCsv(report?.hasTable() ?? false);
          setOpen((o) => !o);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Generate ${noun} — PDF or CSV`}
        className={`flex items-center text-[12px] font-medium transition-colors duration-150 ${trigger}`}
        suppressHydrationWarning
      >
        <IconDocument size={14} className={tone === "dark" ? "text-nav-dim" : "text-primary"} />
        <span>Generate</span>
        <IconChevronDown
          size={12}
          className={`transition-transform duration-200 ease-out ${open ? "rotate-180" : ""} ${tone === "dark" ? "text-nav-dim" : "text-muted"}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={`Generate ${noun}`}
          className="animate-pop absolute right-0 top-[calc(100%+6px)] z-50 w-[272px] origin-top-right overflow-hidden rounded-md border border-edge bg-surface shadow-pop"
        >
          <div className="border-b border-edge bg-faint px-3 py-2">
            <p className="text-[12px] font-semibold text-ink">Generate this {noun}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted">
              {kind === "report"
                ? "Every row in the current filter, not only the rows on screen."
                : kind === "document"
                  ? "On letterhead, numbered and stamped with who generated it."
                  : "This screen on letterhead, numbered and timestamped."}
            </p>
          </div>

          <MenuItem
            ref={firstItem}
            icon={<IconPrinter size={16} />}
            label={`PDF ${noun}`}
            hint="Print, or choose Save as PDF · A4"
            onClick={() => {
              setOpen(false);
              report.printDocument(kind);
            }}
          />
          <MenuItem
            icon={<IconDownload size={16} />}
            label={kind === "report" ? "CSV spreadsheet" : "CSV of the tables"}
            hint={canCsv ? "Opens in Excel, Sheets or Numbers" : "No table on this screen to export"}
            disabled={!canCsv}
            onClick={() => {
              setOpen(false);
              const r = report.exportCsv(kind);
              setToast(
                r.ok
                  ? { text: `Exported ${r.rows.toLocaleString("en-IN")} row${r.rows === 1 ? "" : "s"} to CSV.`, tone: "ok" }
                  : { text: r.reason, tone: "err" },
              );
            }}
          />
        </div>
      )}

      {toast && (
        <div
          role="status"
          className={`animate-slide-in fixed bottom-4 right-4 z-[70] rounded-md border px-3 py-2 text-[12px] shadow-pop ${
            toast.tone === "ok"
              ? "border-success/40 bg-surface text-success-text"
              : "border-danger/40 bg-surface text-danger-text"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

const MenuItem = ({
  ref,
  icon,
  label,
  hint,
  onClick,
  disabled,
}: {
  ref?: React.Ref<HTMLButtonElement>;
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <button
    ref={ref}
    type="button"
    role="menuitem"
    onClick={onClick}
    disabled={disabled}
    className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-pastel/70 focus-visible:bg-pastel/70 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
  >
    <span className="mt-px shrink-0 text-primary">{icon}</span>
    <span className="min-w-0">
      <span className="block text-[12.5px] font-medium text-ink">{label}</span>
      <span className="block text-[11px] leading-snug text-muted">{hint}</span>
    </span>
  </button>
);
