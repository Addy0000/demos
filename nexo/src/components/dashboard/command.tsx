"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { compactInr } from "@/lib/format";
import { IconChevronRight } from "@/components/icons";

/**
 * The command board's moving parts.
 *
 * KpiStrip: the five or six figures that say how the business is doing, set as
 * one ruled row. Each counts up from zero the first time it is seen, so the eye
 * lands on the numbers in the order they are read.
 *
 * LensBoard: everything else, behind lenses (Sell, Buy, Stock, Money for a
 * manufacturer; Delivery, People, Money for a services firm). Panels sit in
 * numbered slots, and each slot carries a view-transition name: switching lens
 * morphs slot into slot, so the grid visibly re-forms around the new question
 * instead of cutting to a different page. Without View Transitions the switch
 * is instant; under reduced motion, too.
 */

// ── Count-up ────────────────────────────────────────────────────────────────

export type KpiUnit = "inr" | "pct" | "days" | "count";

function format(unit: KpiUnit, v: number): string {
  if (unit === "inr") return compactInr(v).replace("₹ ", "₹");
  if (unit === "pct") return `${v.toFixed(1)}%`;
  if (unit === "days") return `${Math.round(v)}`;
  return Math.round(v).toLocaleString("en-IN");
}

const useIsoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

function CountUp({ value, unit, delay = 0 }: { value: number; unit: KpiUnit; delay?: number }) {
  const [shown, setShown] = useState(value);
  const [ready, setReady] = useState(false);

  useIsoLayout(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setReady(true);
      return;
    }
    let raf = 0;
    let start = 0;
    setShown(0);
    setReady(true);
    const dur = 900;
    const tick = (t: number) => {
      if (!start) start = t + delay;
      const p = Math.min(1, Math.max(0, (t - start) / dur));
      // Exponential ease-out: fast to near the figure, then settles.
      const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setShown(value * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, delay]);

  return (
    <span data-ready={ready || undefined} className="kpi-num">
      {format(unit, shown)}
    </span>
  );
}

// ── KPI strip ───────────────────────────────────────────────────────────────

export type Kpi = {
  key: string;
  label: string;
  value: number;
  unit: KpiUnit;
  /** Change against `against`, in `deltaUnit`. */
  delta?: number | null;
  deltaUnit?: "pct" | "pts" | "days" | "count";
  /** Which direction is good news. */
  good?: "up" | "down";
  against?: string;
  /** A short line instead of a delta. */
  note?: string;
  href?: string;
  /** Draw the figure in the act colour: somebody has to do something. */
  alert?: boolean;
  suffix?: string;
};

export function KpiStrip({ items }: { items: Kpi[] }) {
  return (
    <section aria-label="Key figures" className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-edge bg-surface sm:grid-cols-3 xl:grid-cols-6">
      {items.map((k, i) => {
        const has = k.delta !== undefined && k.delta !== null && Number.isFinite(k.delta);
        const up = has && k.delta! > 0;
        const flat = has && Math.abs(k.delta!) < 0.05;
        const goodNews = has && !flat && (k.good === "down" ? !up : up);
        const deltaText = has
          ? `${up ? "+" : flat ? "±" : "−"}${Math.abs(k.delta!).toFixed(k.deltaUnit === "count" || k.deltaUnit === "days" ? 0 : 1)}${k.deltaUnit === "pct" ? "%" : k.deltaUnit === "pts" ? " pts" : k.deltaUnit === "days" ? " d" : ""}`
          : null;
        const body = (
          <>
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-[11.5px] font-medium text-muted">{k.label}</span>
              {k.href && <IconChevronRight size={13} className="shrink-0 text-muted/50 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />}
            </span>
            <span className={`mt-1.5 block font-num text-[26px] font-semibold leading-none tracking-[-0.03em] tabular-nums ${k.alert ? "text-danger-text" : "text-ink"}`}>
              <CountUp value={k.value} unit={k.unit} delay={i * 70} />
              {k.suffix && <span className="ml-1 text-[13px] font-medium tracking-normal text-muted">{k.suffix}</span>}
            </span>
            <span className="mt-2 flex min-h-[16px] items-center gap-1.5 text-[11px]">
              {deltaText && (
                <span
                  className={`inline-flex items-center gap-0.5 rounded-sm px-1 font-num font-semibold tabular-nums ${
                    flat ? "bg-faint text-muted" : goodNews ? "bg-success-bg text-success-text" : "bg-danger-bg text-danger-text"
                  }`}
                >
                  {!flat && (
                    <svg viewBox="0 0 10 10" className={`h-2 w-2 ${up ? "" : "rotate-180"}`} aria-hidden>
                      <path d="M5 1.5 9 7.5H1z" fill="currentColor" />
                    </svg>
                  )}
                  {deltaText}
                </span>
              )}
              <span className="truncate text-muted">{k.note ?? k.against}</span>
            </span>
          </>
        );
        const cell = "group relative block min-w-0 border-edge px-4 py-3.5 transition-colors duration-150 [&:not(:last-child)]:border-r max-xl:[&:nth-child(n+4)]:border-t max-sm:[&:nth-child(n+3)]:border-t max-sm:[&:nth-child(2n)]:border-r-0";
        return k.href ? (
          <Link key={k.key} href={k.href} className={`${cell} hover:bg-faint/60`}>
            {body}
          </Link>
        ) : (
          <div key={k.key} className={cell}>
            {body}
          </div>
        );
      })}
    </section>
  );
}

// ── Lens board ──────────────────────────────────────────────────────────────

export type LensPanel = { node: React.ReactNode; span: 4 | 6 | 8 | 12 };
export type Lens = { key: string; label: string; hint: string; attention?: number; panels: LensPanel[] };

const SPAN: Record<LensPanel["span"], string> = {
  4: "lg:col-span-4",
  6: "lg:col-span-6",
  8: "lg:col-span-8",
  12: "lg:col-span-12",
};

export function LensBoard({ lenses, storageKey }: { lenses: Lens[]; storageKey: string }) {
  const [active, setActive] = useState(lenses[0]?.key ?? "");
  const tabs = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);

  // The remembered lens, once mounted.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && lenses.some((l) => l.key === saved)) setActive(saved);
    } catch {
      /* storage unavailable: start on the first lens */
    }
  }, [storageKey, lenses]);

  // The underline slides to the active tab.
  useEffect(() => {
    const measure = () => {
      const el = tabs.current?.querySelector<HTMLElement>(`[data-lens="${active}"]`);
      if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active]);

  const choose = useCallback(
    (key: string) => {
      if (key === active) return;
      try {
        localStorage.setItem(storageKey, key);
      } catch {
        /* not remembered, still switched */
      }
      const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (doc.startViewTransition && !reduce) {
        document.documentElement.classList.add("lens-swapping");
        const vt = doc.startViewTransition(() => flushSync(() => setActive(key))) as unknown as { finished?: Promise<void> };
        vt.finished?.finally(() => document.documentElement.classList.remove("lens-swapping"));
      } else {
        setActive(key);
      }
    },
    [active, storageKey],
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = lenses.findIndex((l) => l.key === active);
    const next = lenses[(i + (e.key === "ArrowRight" ? 1 : -1) + lenses.length) % lenses.length]!;
    choose(next.key);
    tabs.current?.querySelector<HTMLElement>(`[data-lens="${next.key}"]`)?.focus();
  };

  const lens = lenses.find((l) => l.key === active) ?? lenses[0];
  if (!lens) return null;

  return (
    <section aria-label="Lenses" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b border-edge">
        <div ref={tabs} role="tablist" aria-label="Dashboard lens" onKeyDown={onKey} className="relative flex gap-1">
          {lenses.map((l) => {
            const on = l.key === active;
            return (
              <button
                key={l.key}
                type="button"
                role="tab"
                data-lens={l.key}
                aria-selected={on}
                aria-controls={`lens-${l.key}`}
                tabIndex={on ? 0 : -1}
                onClick={() => choose(l.key)}
                className={`relative flex items-center gap-2 px-3 pb-2.5 pt-1.5 text-[13px] font-semibold transition-colors duration-150 ${on ? "text-ink" : "text-muted hover:text-ink"}`}
              >
                {l.label}
                {l.attention ? (
                  <span className={`min-w-[18px] rounded-full px-1.5 py-px text-center font-num text-[10.5px] font-semibold tabular-nums ${on ? "bg-danger text-white" : "bg-danger-bg text-danger-text"}`}>
                    {l.attention}
                  </span>
                ) : null}
              </button>
            );
          })}
          {bar && (
            <span
              aria-hidden
              className="lens-bar absolute -bottom-px h-[2px] rounded-full bg-primary"
              style={{ left: bar.left + 10, width: Math.max(12, bar.width - 20) }}
            />
          )}
        </div>
        <p className="pb-2.5 text-[11.5px] text-muted">{lens.hint}</p>
      </div>

      <div id={`lens-${lens.key}`} role="tabpanel" aria-label={lens.label} className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {lens.panels.map((p, i) => (
          <div
            key={`${lens.key}-${i}`}
            className={`flex min-w-0 flex-col ${SPAN[p.span]} [&>*]:flex-1`}
            style={{ viewTransitionName: `lens-slot-${i}`, viewTransitionClass: "lens" } as React.CSSProperties}
          >
            {p.node}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Needs you ───────────────────────────────────────────────────────────────

export type Need = { key: string; label: string; detail: string; count?: number; value?: number; href: string; tone: "act" | "slow" | "ok" };

/** Everything with somebody's name on it, ranked: missing documents first, then late, then waiting. */
export function NeedsYou({ items, title = "Needs you" }: { items: Need[]; title?: string }) {
  const open = items.filter((n) => n.tone !== "ok");
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-[10px] border border-edge bg-surface">
      <header className="flex items-center gap-2 border-b border-edge/70 px-4 py-3">
        <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
        <span className={`rounded-full px-2 py-px font-num text-[11px] font-semibold tabular-nums ${open.length ? "bg-danger-bg text-danger-text" : "bg-success-bg text-success-text"}`}>
          {open.length ? `${open.length} open` : "all clear"}
        </span>
      </header>
      <ul className="flex-1 divide-y divide-edge/60 overflow-y-auto scroll-thin">
        {items.map((n) => (
          <li key={n.key}>
            <Link href={n.href} className="group flex items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-faint/70">
              <span
                className={`grid h-8 min-w-8 shrink-0 place-items-center rounded-[8px] px-1.5 font-num text-[13px] font-semibold tabular-nums ${
                  n.tone === "act" ? "bg-danger-bg text-danger-text" : n.tone === "slow" ? "bg-warning-bg text-warning-text" : "bg-success-bg text-success-text"
                }`}
              >
                {n.count ?? "!"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-ink">{n.label}</span>
                <span className="block truncate text-[11px] text-muted">{n.detail}</span>
              </span>
              {n.value !== undefined && n.value > 0 && (
                <span className={`shrink-0 font-num text-[12px] font-semibold tabular-nums ${n.tone === "act" ? "text-danger-text" : "text-ink"}`}>
                  {compactInr(n.value).replace("₹ ", "₹")}
                </span>
              )}
              <IconChevronRight size={13} className="shrink-0 text-muted/40 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Alerts ──────────────────────────────────────────────────────────────────

export type AlertGroup = { key: string; title: string; hint: string; tone: "act" | "slow" | "wait"; items: Need[] };

const GROUP_TONE = {
  act: { dot: "bg-danger", text: "text-danger-text", tint: "bg-danger-bg", ring: "border-danger/30 hover:bg-danger-bg/60" },
  slow: { dot: "bg-warning", text: "text-warning-text", tint: "bg-warning-bg", ring: "border-warning/40 hover:bg-warning-bg/60" },
  wait: { dot: "bg-info", text: "text-info-text", tint: "bg-info-bg", ring: "border-info/30 hover:bg-info-bg/60" },
} as const;

/**
 * Everything that needs somebody, sorted into three columns by how urgent it
 * is: a document that should exist and does not, work that is slow or late,
 * and decisions waiting on a signature. Each row is the queue that clears it.
 */
export function AlertsBoard({ groups }: { groups: AlertGroup[] }) {
  const open = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <section aria-label="Alerts" className="overflow-hidden rounded-[10px] border border-edge bg-surface">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-edge/70 px-4 py-3">
        <h2 className="text-[14px] font-semibold text-ink">Alerts</h2>
        <span className={`rounded-full px-2 py-px font-num text-[11px] font-semibold tabular-nums ${open ? "bg-danger-bg text-danger-text" : "bg-success-bg text-success-text"}`}>
          {open ? `${open} open` : "all clear"}
        </span>
        <span className="ml-auto text-[11.5px] text-muted">Each alert opens the queue that clears it</span>
      </header>
      <div className="grid divide-y divide-edge/70 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        {groups.map((g) => {
          const t = GROUP_TONE[g.tone];
          const value = g.items.reduce((s, n) => s + (n.value ?? 0), 0);
          return (
            <div key={g.key} className="flex min-w-0 flex-col">
              <div className="flex items-center gap-2 px-4 pb-2 pt-3">
                <span aria-hidden className={`h-2 w-2 rounded-full ${t.dot}`} />
                <h3 className="text-[12.5px] font-semibold text-ink">{g.title}</h3>
                <span className={`rounded-full px-1.5 py-px font-num text-[10.5px] font-semibold tabular-nums ${g.items.length ? `${t.tint} ${t.text}` : "bg-faint text-muted"}`}>
                  {g.items.length}
                </span>
                {value > 0 && <span className={`ml-auto font-num text-[12px] font-semibold tabular-nums ${t.text}`}>{compactInr(value).replace("₹ ", "₹")}</span>}
              </div>
              <p className="px-4 pb-2 text-[11px] text-muted">{g.hint}</p>
              {g.items.length === 0 ? (
                <p className="mx-4 mb-4 rounded-[8px] border border-dashed border-edge px-3 py-4 text-center text-[12px] text-muted">Nothing here. All clear.</p>
              ) : (
                <ul className="flex flex-col gap-1.5 px-3 pb-3">
                  {g.items.map((n) => (
                    <li key={n.key}>
                      <Link
                        href={n.href}
                        className={`group flex items-center gap-3 rounded-[8px] border bg-surface px-3 py-2.5 transition-[background-color,translate] duration-150 ease-out hover:-translate-y-px ${t.ring}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-medium text-ink">{n.label}</span>
                          <span className="block truncate text-[11px] text-muted">{n.detail}</span>
                        </span>
                        {n.value !== undefined && n.value > 0 ? (
                          <span className={`shrink-0 font-num text-[12.5px] font-semibold tabular-nums ${t.text}`}>{compactInr(n.value).replace("₹ ", "₹")}</span>
                        ) : n.count !== undefined ? (
                          <span className={`grid h-6 min-w-6 shrink-0 place-items-center rounded-full px-1.5 font-num text-[11.5px] font-semibold tabular-nums ${t.tint} ${t.text}`}>{n.count}</span>
                        ) : null}
                        <IconChevronRight size={13} className="shrink-0 text-muted/40 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
