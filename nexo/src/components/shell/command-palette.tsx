"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconSearch, IconChevronRight } from "@/components/icons";

export type SearchHit = {
  id: string;
  label: string;
  sub: string;
  href: string;
  kind: string;
};

type NavTarget = { label: string; href: string; group: string };

/**
 * Cross-module search. Navigation targets resolve locally and instantly; record
 * hits stream from /api/search, debounced, with each response tagged by sequence
 * so a slow early query can never overwrite a fast later one.
 */
export function CommandPalette({
  open,
  onClose,
  navTargets,
}: {
  open: boolean;
  onClose: () => void;
  navTargets: NavTarget[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const q = query.trim();

  const navHits: SearchHit[] = useMemo(() => {
    if (!q) return navTargets.slice(0, 7).map((t) => ({ id: `nav:${t.href}`, label: t.label, sub: t.group, href: t.href, kind: "Go to" }));
    const lower = q.toLowerCase();
    return navTargets
      .filter((t) => t.label.toLowerCase().includes(lower) || t.group.toLowerCase().includes(lower))
      .slice(0, 5)
      .map((t) => ({ id: `nav:${t.href}`, label: t.label, sub: t.group, href: t.href, kind: "Go to" }));
  }, [q, navTargets]);

  const all = useMemo(() => [...navHits, ...hits], [navHits, hits]);

  // Reset each time it opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setHits([]);
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced record search.
  useEffect(() => {
    if (!open) return;
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as { hits: SearchHit[] };
        if (mine === seq.current) {
          setHits(data.hits ?? []);
          setCursor(0);
        }
      } catch {
        if (mine === seq.current) setHits([]);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 140);
    return () => clearTimeout(t);
  }, [q, open]);

  const go = useCallback(
    (hit: SearchHit) => {
      onClose();
      router.push(hit.href);
    },
    [onClose, router],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, all.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const hit = all[cursor];
        if (hit) go(hit);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, all, cursor, go, onClose]);

  // Keep the cursor row in view.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  const grouped = all.reduce<Record<string, { hit: SearchHit; idx: number }[]>>((acc, hit, idx) => {
    (acc[hit.kind] ??= []).push({ hit, idx });
    return acc;
  }, {});

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/25 px-4 pt-[12vh] backdrop-blur-[1px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <div className="animate-pop w-full max-w-[560px] overflow-hidden rounded-md border border-edge bg-surface shadow-pop">
        <div className="relative flex items-center gap-2.5 border-b border-edge px-3.5">
          <IconSearch size={16} className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customers, projects, materials, POs, GRNs, batches…"
            aria-label="Search all modules"
            className="h-12 flex-1 bg-transparent text-[13.5px] text-ink placeholder:text-muted/80 focus:outline-none"
          />
          <kbd className="shrink-0 rounded border border-edge bg-faint px-1.5 py-0.5 font-num text-[10.5px] text-muted">
            Esc
          </kbd>
          {loading && (
            <span className="absolute bottom-0 left-0 h-px w-1/4 overflow-hidden">
              <span className="animate-rail block h-px w-full bg-primary" />
            </span>
          )}
        </div>

        <div ref={listRef} className="max-h-[54vh] overflow-y-auto scroll-thin py-1.5">
          {all.length === 0 && (
            <p className="px-4 py-8 text-center text-[12.5px] text-muted">
              {q.length < 2 ? "Type at least two characters to search records." : `Nothing matches “${q}”.`}
            </p>
          )}

          {Object.entries(grouped).map(([kind, entries]) => (
            <div key={kind} className="mb-0.5">
              <p className="px-3.5 pb-1 pt-2 text-[10.5px] font-semibold text-muted">
                {kind}
              </p>
              {entries.map(({ hit, idx }) => (
                <button
                  key={hit.id}
                  data-idx={idx}
                  type="button"
                  onMouseEnter={() => setCursor(idx)}
                  onClick={() => go(hit)}
                  className={[
                    "flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors duration-100",
                    idx === cursor ? "bg-pastel" : "hover:bg-faint",
                  ].join(" ")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-ink">{hit.label}</span>
                    <span className="block truncate text-[11px] text-muted">{hit.sub}</span>
                  </span>
                  <IconChevronRight
                    size={14}
                    className={idx === cursor ? "shrink-0 text-primary" : "shrink-0 text-transparent"}
                  />
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-edge bg-faint px-3.5 py-2 text-[10.5px] text-muted">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-edge bg-surface px-1 py-px font-num">↑</kbd>
            <kbd className="rounded border border-edge bg-surface px-1 py-px font-num">↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-edge bg-surface px-1 py-px font-num">↵</kbd>
            open
          </span>
          <span className="ml-auto">Scoped to your role</span>
        </div>
      </div>
    </div>
  );
}
