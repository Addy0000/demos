"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { usePathname } from "next/navigation";

/**
 * The document engine.
 *
 * Every screen can be turned into a paper record: a list becomes a
 * report of every row the current filter holds (not just the rows the
 * virtualiser happens to have mounted), and a record becomes a letterheaded
 * document. The engine does three things and nothing else:
 *
 *  1. Flips `printing` on synchronously before the browser lays out the print,
 *     so grids can swap their virtual window for a full, flat table.
 *  2. Stamps the letterhead with what is being printed, by whom, and when.
 *  3. Exports the same flat tables as CSV, so the PDF and the spreadsheet can
 *     never disagree about what the filter contained.
 *
 * It works off the page's own DOM (its h1 and its tables) on purpose: a page
 * needs no wiring to become printable, so nothing can be left out.
 */

export type DocKind = "report" | "document" | "page";

export type DocStamp = {
  kind: DocKind;
  title: string;
  code: string | null;
  number: string;
  generatedAt: Date;
  path: string;
  rowCount: number | null;
};

type Ctx = {
  printing: boolean;
  stamp: DocStamp | null;
  user: { name: string; roleLabel: string };
  /** Number of page-level Generate controls currently mounted (toolbar / record header). */
  localControls: number;
  registerLocal: () => () => void;
  printDocument: (kind: DocKind) => void;
  exportCsv: (kind: DocKind) => { ok: true; rows: number } | { ok: false; reason: string };
  hasTable: () => boolean;
};

const ReportCtx = createContext<Ctx | null>(null);

export function useReport(): Ctx {
  const c = useContext(ReportCtx);
  if (!c) throw new Error("useReport must be used inside <ReportProvider>");
  return c;
}

/** Same as useReport, but safe outside the shell (auth pages, tests). */
export function useReportOptional(): Ctx | null {
  return useContext(ReportCtx);
}

const PREFIX: Record<DocKind, string> = { report: "RPT", document: "DOC", page: "PRN" };

function docNumber(kind: DocKind, at: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${PREFIX[kind]}-${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}`;
}

function readTitle(): string {
  const h1 = document.querySelector<HTMLElement>("main h1");
  const t = h1?.textContent?.trim();
  if (t) return t;
  return document.title.replace(/\s*·\s*[^·]+$/, "").trim() || "Report";
}

function readCode(): string | null {
  return document.querySelector<HTMLElement>("main [data-doc-code]")?.textContent?.trim() || null;
}

/** The tables a generated document is made of: flat report tables first, then any table in the page. */
function readTables(): HTMLTableElement[] {
  const report = Array.from(document.querySelectorAll<HTMLTableElement>("main table[data-report-table]"));
  if (report.length) return report;
  return Array.from(document.querySelectorAll<HTMLTableElement>("main table"));
}

function csvCell(v: string): string {
  const s = v.replace(/\s+/g, " ").trim();
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "document";
}

export function ReportProvider({
  user,
  children,
}: {
  user: { name: string; roleLabel: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [printing, setPrinting] = useState(false);
  const [stamp, setStamp] = useState<DocStamp | null>(null);
  const [localControls, setLocalControls] = useState(0);
  const ownPrint = useRef(false);

  const registerLocal = useCallback(() => {
    setLocalControls((n) => n + 1);
    return () => setLocalControls((n) => Math.max(0, n - 1));
  }, []);

  const makeStamp = useCallback(
    (kind: DocKind): DocStamp => {
      const at = new Date();
      const rows = document.querySelectorAll("main table[data-report-table] tbody tr").length;
      return {
        kind,
        title: readTitle(),
        code: readCode(),
        number: docNumber(kind, at),
        generatedAt: at,
        path: pathname,
        rowCount: kind === "report" ? rows : null,
      };
    },
    [pathname],
  );

  // Ctrl+P from the browser still produces a proper document: stamp it and
  // flatten the grids before the print layout is taken.
  useEffect(() => {
    const before = () => {
      if (ownPrint.current) return;
      flushSync(() => setPrinting(true));
      const kind: DocKind = document.querySelector("main table[data-report-table]")
        ? "report"
        : document.querySelector("main [data-doc-code]")
          ? "document"
          : "page";
      flushSync(() => setStamp(makeStamp(kind)));
    };
    const after = () => {
      ownPrint.current = false;
      setPrinting(false);
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [makeStamp]);

  const printDocument = useCallback(
    (kind: DocKind) => {
      ownPrint.current = true;
      flushSync(() => setPrinting(true));
      const s = makeStamp(kind);
      flushSync(() => setStamp(s));
      const prevTitle = document.title;
      // The browser offers document.title as the PDF's file name.
      document.title = `${s.number} ${s.title}`;
      // Give fonts one frame to settle so the letterhead never prints in fallback metrics.
      requestAnimationFrame(() => {
        window.print();
        document.title = prevTitle;
      });
    },
    [makeStamp],
  );

  // Grids mark themselves as a report source; their flat table only mounts while printing.
  const hasTable = useCallback(
    () => document.querySelector("main table, main [data-report-source]") !== null,
    [],
  );

  const exportCsv = useCallback(
    (kind: DocKind) => {
      flushSync(() => setPrinting(true));
      const tables = readTables();
      const s = makeStamp(kind);
      setPrinting(false);
      if (tables.length === 0) return { ok: false as const, reason: "This screen has no table to export." };

      const lines: string[] = [];
      let rowCount = 0;
      tables.forEach((table, ti) => {
        if (ti > 0) lines.push("");
        const caption = table.caption?.textContent?.trim();
        if (tables.length > 1 && caption) lines.push(csvCell(caption));
        table.querySelectorAll("tr").forEach((tr) => {
          const cells = Array.from(tr.querySelectorAll<HTMLElement>("th, td")).filter(
            (c) => !c.hasAttribute("data-csv-skip"),
          );
          if (cells.length === 0) return;
          lines.push(cells.map((c) => csvCell(c.innerText || c.textContent || "")).join(","));
          if (tr.parentElement?.tagName === "TBODY") rowCount++;
        });
      });

      // BOM so Excel opens ₹ and other UTF-8 correctly.
      const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${s.number}_${slug(s.code ? `${s.code}-${s.title}` : s.title)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return { ok: true as const, rows: rowCount };
    },
    [makeStamp],
  );

  const value = useMemo<Ctx>(
    () => ({ printing, stamp, user, localControls, registerLocal, printDocument, exportCsv, hasTable }),
    [printing, stamp, user, localControls, registerLocal, printDocument, exportCsv, hasTable],
  );

  return <ReportCtx.Provider value={value}>{children}</ReportCtx.Provider>;
}
