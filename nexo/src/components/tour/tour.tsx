"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CHAPTERS, STEPS_BY_TENANT, targetSelector, type TourStep } from "@/components/tour/tour-steps";
import { TENANTS, type TenantKey } from "@/lib/tenants";
import { useReport } from "@/components/report/report-context";
import { IconClose, IconRoute, IconPrinter, IconArrowRight, IconChevronLeft, IconCheck } from "@/components/icons";

const stateKey = (t: TenantKey) => `tour.v2.${t}`;
const seenKey = (t: TenantKey) => `tour.seen.v2.${t}`;

type Persisted = { active: boolean; id: string | null };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode — the tour still runs, it just won't resume after a reload */
  }
}

type TourCtx = { start: (fromId?: string) => void; active: boolean };
const Ctx = createContext<TourCtx | null>(null);
export function useTour(): TourCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTour must be used inside <TourProvider>");
  return c;
}

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

function visible(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

type Rect = { top: number; left: number; width: number; height: number };

export function TourProvider({
  tenant,
  allowedHrefs,
  children,
}: {
  tenant: TenantKey;
  allowedHrefs: string[];
  children: React.ReactNode;
}) {
  // The journey a role can actually walk: stops on screens it cannot open are dropped.
  const steps = useMemo(
    () => STEPS_BY_TENANT[tenant].filter((s) => !s.route || allowedHrefs.includes(s.route)),
    [allowedHrefs, tenant],
  );

  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [invite, setInvite] = useState(false);

  useEffect(() => {
    const p = load<Persisted>(stateKey(tenant), { active: false, id: null });
    if (p.active) {
      const i = steps.findIndex((s) => s.id === p.id);
      setIndex(i >= 0 ? i : 0);
      setActive(true);
    } else if (!load<boolean>(seenKey(tenant), false)) {
      const t = setTimeout(() => setInvite(true), 1400);
      setHydrated(true);
      return () => clearTimeout(t);
    }
    setHydrated(true);
  }, [steps]);

  useEffect(() => {
    if (!hydrated) return;
    save(stateKey(tenant), { active, id: steps[index]?.id ?? null } satisfies Persisted);
  }, [active, index, steps, hydrated]);

  const start = useCallback(
    (fromId?: string) => {
      const i = fromId ? steps.findIndex((s) => s.id === fromId) : 0;
      setIndex(Math.max(0, i));
      setActive(true);
      setInvite(false);
      save(seenKey(tenant), true);
    },
    [steps],
  );

  const end = useCallback(() => {
    setActive(false);
    save(seenKey(tenant), true);
  }, []);

  const value = useMemo(() => ({ start, active }), [start, active]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {active && steps.length > 0 && (
        <TourOverlay steps={steps} index={index} setIndex={setIndex} onEnd={end} />
      )}
      {invite && !active && (
        <TourInvite
          stops={steps.length}
          company={TENANTS[tenant].name}
          onStart={() => start()}
          onDismiss={() => {
            setInvite(false);
            save(seenKey(tenant), true);
          }}
        />
      )}
    </Ctx.Provider>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function TourOverlay({
  steps,
  index,
  setIndex,
  onEnd,
}: {
  steps: TourStep[];
  index: number;
  setIndex: (i: number) => void;
  onEnd: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const report = useReport();
  const step = steps[Math.min(index, steps.length - 1)]!;

  const [ready, setReady] = useState(false);
  const [emptyList, setEmptyList] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [showMap, setShowMap] = useState(false);
  const targetRef = useRef<HTMLElement | null>(null);
  const openedFor = useRef<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [cardSize, setCardSize] = useState({ w: 368, h: 300 });

  const isLast = index >= steps.length - 1;
  const go = useCallback(
    (i: number) => {
      setShowMap(false);
      setIndex(i);
    },
    [setIndex],
  );
  const next = useCallback(() => (isLast ? onEnd() : go(index + 1)), [isLast, onEnd, go, index]);
  const back = useCallback(() => {
    if (index > 0) go(index - 1);
  }, [index, go]);

  // 1. Get to the step's screen (and, for record stops, into its newest record).
  useEffect(() => {
    setReady(false);
    setEmptyList(false);
    // The previous target stays lit until the next one is found, so the spotlight
    // glides from one to the other instead of collapsing and reappearing.
    if (!step.route) {
      setReady(true);
      return;
    }
    const route = step.route;
    const onRecord = pathname.startsWith(route + "/");

    if (step.openFirst) {
      if (onRecord) {
        setReady(true);
        return;
      }
      if (pathname !== route) {
        router.push(route);
        return;
      }
      // On the list. Open the newest record once; if the user comes back to the
      // list on their own, leave them there.
      if (openedFor.current === step.id) {
        setReady(true);
        return;
      }
      let tries = 0;
      const poll = setInterval(() => {
        tries++;
        // Grids that open records by double-click carry data-href; the rest link the
        // record from their first reference column.
        const row = document.querySelector<HTMLElement>('main [data-row-idx="0"]');
        const href = row?.dataset.href ?? row?.querySelector<HTMLAnchorElement>("a.ref-link")?.getAttribute("href");
        if (href) {
          clearInterval(poll);
          openedFor.current = step.id;
          router.push(href);
        } else if (tries > 30) {
          clearInterval(poll);
          openedFor.current = step.id;
          setEmptyList(true);
          setReady(true);
        }
      }, 150);
      return () => clearInterval(poll);
    }

    if (pathname !== route) {
      router.push(route);
      return;
    }
    setReady(true);
  }, [step, pathname, router]);

  // Preload the next stop's screen while this one is being read.
  useEffect(() => {
    const nextRoute = steps[index + 1]?.route;
    if (nextRoute) router.prefetch(nextRoute);
  }, [index, steps, router]);

  // 2. Find the thing to point at. Falls back to the page itself, then to centre.
  useEffect(() => {
    if (!ready) return;
    const wanted = emptyList ? "grid" : step.target;
    if (!wanted) {
      // A stop about the whole product: the spotlight closes and the card centres.
      targetRef.current = null;
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const deadline = performance.now() + 2600;
    let raf = 0;
    let seen: Element | null = null;
    let lastTop = NaN;
    let still = 0;
    const find = () => {
      const el = document.querySelector(targetSelector(wanted));
      if (visible(el)) {
        // Wait until it has held still for two frames: a list still streaming in
        // would otherwise drag the spotlight along with it.
        const top = el.getBoundingClientRect().top;
        still = el === seen && Math.abs(top - lastTop) < 0.5 ? still + 1 : 0;
        seen = el;
        lastTop = top;
        if (still >= 2) {
          const r = el.getBoundingClientRect();
          const big = r.height > window.innerHeight * 0.6;
          if (!big) el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduce ? "auto" : "smooth" });
          targetRef.current = el;
          return;
        }
      }
      if (performance.now() > deadline) {
        const main = document.querySelector("main");
        targetRef.current = visible(main) ? main : null;
        return;
      }
      raf = requestAnimationFrame(find);
    };
    raf = requestAnimationFrame(find);
    return () => cancelAnimationFrame(raf);
  }, [ready, step, emptyList]);

  // 3. Keep the spotlight glued to its target through scroll, resize and re-render.
  useEffect(() => {
    let raf = 0;
    let last = "";
    const tick = () => {
      const el = targetRef.current;
      if (el && el.isConnected) {
        const r = el.getBoundingClientRect();
        const pad = 4;
        const next: Rect = {
          top: Math.max(0, r.top - pad),
          left: Math.max(0, r.left - pad),
          width: Math.min(window.innerWidth, r.width + pad * 2),
          height: Math.min(window.innerHeight, r.height + pad * 2),
        };
        const key = `${next.top}|${next.left}|${next.width}|${next.height}`;
        if (key !== last) {
          last = key;
          setRect(next);
        }
      } else if (last !== "none" && !targetRef.current) {
        last = "none";
        setRect(null);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCardSize({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Focus follows the stop, so a screen reader hears each one as it arrives.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [step.id, showMap]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (e.key === "Escape") {
        onEnd();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [next, back, onEnd]);

  const side = useRef<Side | null>(null);
  const pos = placeCard(rect, cardSize, side.current);
  side.current = pos.side;
  const chapterIdx = CHAPTERS.findIndex((c) => c.id === step.chapter);
  const chapter = CHAPTERS[chapterIdx]!;
  const inChapter = steps.filter((s) => s.chapter === step.chapter);
  const posInChapter = inChapter.findIndex((s) => s.id === step.id) + 1;
  const loading = !ready;

  return (
    <div data-print-hide className="tour-layer">
      {/* Click shield in four panes around the hole: the spotlit control stays usable. */}
      <Shield rect={rect} />
      <div
        aria-hidden
        className="tour-hole"
        style={
          rect
            ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
            : { top: "50%", left: "50%", width: 0, height: 0 }
        }
      />

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        data-loading={loading || undefined}
        className="tour-card fixed z-[92] w-[368px] max-w-[calc(100vw-24px)] overflow-hidden rounded-md border border-edge bg-surface shadow-pop"
        style={{ top: pos.top, left: pos.left }}
      >
        <div className="panel-head justify-between">
          <button
            type="button"
            onClick={() => setShowMap((m) => !m)}
            aria-expanded={showMap}
            className="-ml-1 flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-[11.5px] font-semibold text-ink transition-colors duration-150 hover:bg-pastel hover:text-primary"
            title="Show the whole journey"
          >
            <IconRoute size={14} className="shrink-0 text-primary" />
            <span className="truncate">{chapter.label}</span>
            <span className="shrink-0 font-num text-[11px] font-normal text-muted">
              {posInChapter}/{inChapter.length}
            </span>
          </button>
          <div className="flex items-center gap-1">
            <span className="font-num text-[11px] tabular-nums text-muted">
              {index + 1} of {steps.length}
            </span>
            <button
              type="button"
              onClick={onEnd}
              aria-label="End tour"
              title="End tour (Esc)"
              className="grid h-6 w-6 place-items-center rounded text-muted transition-colors duration-150 hover:bg-surface hover:text-ink"
            >
              <IconClose size={13} />
            </button>
          </div>
        </div>

        <Progress steps={steps} index={index} />

        {showMap ? (
          <JourneyMap
            steps={steps}
            index={index}
            onJump={go}
          />
        ) : (
          <div key={step.id} className="tour-copy px-3.5 pb-3 pt-3">
            <h2
              id="tour-title"
              ref={headingRef}
              tabIndex={-1}
              className="text-[15px] font-semibold leading-snug tracking-tight text-ink focus:outline-none"
            >
              {step.title}
            </h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink/85">{step.body}</p>

            {emptyList && (
              <p className="mt-2 rounded-sm bg-warning-bg px-2 py-1.5 text-[11.5px] leading-snug text-warning-text">
                There are no records here in this demo yet. New, in the toolbar, creates the first one.
              </p>
            )}

            {(step.who || step.doc) && (
              <dl className="mt-3 border-t border-edge/70">
                {step.who && (
                  <div className="flex gap-3 border-b border-edge/70 py-1.5">
                    <dt className="w-[74px] shrink-0 text-[11px] text-muted">Who</dt>
                    <dd className="text-[12px] text-ink">{step.who}</dd>
                  </div>
                )}
                {step.doc && (
                  <div className="flex items-center gap-3 border-b border-edge/70 py-1.5">
                    <dt className="w-[74px] shrink-0 text-[11px] text-muted">Produces</dt>
                    <dd className="min-w-0 flex-1 text-[12px] font-medium text-ink">{step.doc}</dd>
                    {step.docKind && (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => report.printDocument(emptyList ? "report" : step.docKind!)}
                        className="flex h-[24px] shrink-0 items-center gap-1 rounded border border-edge bg-surface px-2 text-[11.5px] font-medium text-primary-hover transition-colors duration-150 hover:border-accent hover:bg-pastel disabled:opacity-50"
                      >
                        <IconPrinter size={13} />
                        Generate
                      </button>
                    )}
                  </div>
                )}
              </dl>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-edge bg-faint px-3 py-2">
          <button
            type="button"
            onClick={back}
            disabled={index === 0}
            className="flex h-[28px] items-center gap-0.5 rounded px-2 text-[12px] text-muted transition-colors duration-150 hover:bg-surface hover:text-ink disabled:pointer-events-none disabled:opacity-40"
          >
            <IconChevronLeft size={14} />
            Back
          </button>
          <span className="hidden flex-1 text-center text-[10.5px] text-muted sm:block">
            {loading ? "Opening the screen…" : "← → to move · Esc to leave"}
          </span>
          <span className="flex-1 sm:hidden" />
          <button
            type="button"
            onClick={next}
            className="flex h-[28px] items-center gap-1 rounded-[2px] bg-primary px-3 text-[12px] font-medium text-white transition-colors duration-150 hover:bg-primary-hover"
          >
            {isLast ? (
              <>
                <IconCheck size={13} />
                Finish
              </>
            ) : (
              <>
                {index === 0 ? "Start the journey" : "Next"}
                <IconArrowRight size={13} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Shield({ rect }: { rect: Rect | null }) {
  if (!rect) return <div className="tour-shield fixed inset-0" />;
  const { top, left, width, height } = rect;
  return (
    <>
      <div className="tour-shield fixed left-0 right-0 top-0" style={{ height: top }} />
      <div className="tour-shield fixed left-0 right-0 bottom-0" style={{ top: top + height }} />
      <div className="tour-shield fixed left-0" style={{ top, height, width: left }} />
      <div className="tour-shield fixed right-0" style={{ top, height, left: left + width }} />
    </>
  );
}

/** One segment per chapter, filled as far as the journey has come. */
function Progress({ steps, index }: { steps: TourStep[]; index: number }) {
  const chapters = CHAPTERS.filter((c) => steps.some((s) => s.chapter === c.id));
  return (
    <div className="flex gap-[3px] px-3 pt-2" aria-hidden>
      {chapters.map((c) => {
        const ids = steps.map((s, i) => ({ s, i })).filter(({ s }) => s.chapter === c.id);
        const first = ids[0]!.i;
        const last = ids[ids.length - 1]!.i;
        const fill = index > last ? 1 : index < first ? 0 : (index - first + 1) / ids.length;
        return (
          <span key={c.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-edge/70" title={c.label}>
            <span
              className="block h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${fill * 100}%` }}
            />
          </span>
        );
      })}
    </div>
  );
}

function JourneyMap({
  steps,
  index,
  onJump,
}: {
  steps: TourStep[];
  index: number;
  onJump: (i: number) => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>("[aria-current='step']")?.scrollIntoView({ block: "center" });
  }, []);
  return (
    <ol ref={listRef} className="scroll-thin max-h-[340px] overflow-y-auto py-1.5" aria-label="Journey map">
      {CHAPTERS.filter((c) => steps.some((s) => s.chapter === c.id)).map((c) => (
        <li key={c.id}>
          <p className="px-3.5 pb-0.5 pt-2 text-[11px] font-semibold text-muted">{c.label}</p>
          <ol>
            {steps.map((s, i) =>
              s.chapter !== c.id ? null : (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onJump(i)}
                    aria-current={i === index ? "step" : undefined}
                    className={[
                      "flex w-full items-center gap-2 py-[5px] pl-3.5 pr-3 text-left text-[12px] transition-colors duration-150",
                      i === index ? "bg-pastel font-medium text-primary-hover" : "text-ink hover:bg-faint",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full border",
                        i < index ? "border-primary bg-primary text-white" : i === index ? "border-primary" : "border-edge",
                      ].join(" ")}
                    >
                      {i < index && <IconCheck size={9} strokeWidth={2.4} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    {s.doc && <span className="shrink-0 text-[10.5px] text-muted">{s.doc.split(" ")[0]}</span>}
                  </button>
                </li>
              ),
            )}
          </ol>
        </li>
      ))}
    </ol>
  );
}

/** Place the card beside the spotlight; inside it when the target fills the screen. */
type Side = "below" | "right" | "above" | "left" | "inside" | "centre";

function placeCard(
  rect: Rect | null,
  size: { w: number; h: number },
  prefer: Side | null,
): { top: number; left: number; side: Side } {
  if (typeof window === "undefined") return { top: 0, left: 0, side: "centre" };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 12;
  const m = 12;
  const clamp = (top: number, left: number, side: Side) => ({
    top: Math.round(Math.min(Math.max(m, top), vh - size.h - m)),
    left: Math.round(Math.min(Math.max(m, left), vw - size.w - m)),
    side,
  });

  if (!rect) return clamp((vh - size.h) / 2, (vw - size.w) / 2, "centre");

  const below = vh - (rect.top + rect.height);
  const above = rect.top;
  const right = vw - (rect.left + rect.width);
  const left = rect.left;

  const fits = {
    below: below >= size.h + gap + m,
    right: right >= size.w + gap + m,
    above: above >= size.h + gap + m,
    left: left >= size.w + gap + m,
  };
  const at = (where: Side) => {
    switch (where) {
      case "below":
        return clamp(rect.top + rect.height + gap, rect.left, where);
      case "right":
        return clamp(rect.top, rect.left + rect.width + gap, where);
      case "above":
        return clamp(rect.top - size.h - gap, rect.left, where);
      case "left":
        return clamp(rect.top, rect.left - size.w - gap, where);
      default:
        // The target is most of the screen: sit in its lower-right corner.
        return clamp(rect.top + rect.height - size.h - 20, rect.left + rect.width - size.w - 20, "inside");
    }
  };
  // Stay on the side the card was already on while it still fits: less travel between stops.
  if (prefer && prefer in fits && fits[prefer as keyof typeof fits]) return at(prefer);
  for (const where of ["below", "right", "above", "left"] as const) if (fits[where]) return at(where);
  return at("inside");
}

function TourInvite({
  stops,
  company,
  onStart,
  onDismiss,
}: {
  stops: number;
  company: string;
  onStart: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-labelledby="tour-invite-title"
      data-print-hide
      className="animate-slide-in fixed bottom-4 right-4 z-[85] w-[320px] overflow-hidden rounded-md border border-edge bg-surface shadow-pop"
    >
      <div className="flex items-start gap-3 px-3.5 pb-3 pt-3.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-pastel text-primary">
          <IconRoute size={17} />
        </span>
        <div className="min-w-0">
          <h2 id="tour-invite-title" className="text-[13.5px] font-semibold leading-snug text-ink">
            Take the {company} tour
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            {stops} stops through {company}&rsquo;s own data, with the document each stop produces.
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-1.5 border-t border-edge bg-faint px-3 py-2">
        <button
          type="button"
          onClick={onDismiss}
          className="h-[28px] rounded px-2.5 text-[12px] text-muted transition-colors duration-150 hover:bg-surface hover:text-ink"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={onStart}
          className="flex h-[28px] items-center gap-1 rounded-[2px] bg-primary px-3 text-[12px] font-medium text-white transition-colors duration-150 hover:bg-primary-hover"
        >
          Start the tour
          <IconArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}
