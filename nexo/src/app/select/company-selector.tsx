"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { TENANTS, type TenantKey } from "@/lib/tenants";
import { BrandMark, Wordmark } from "@/components/brand";
import { IconArrowRight } from "@/components/icons";
import { useAppearance } from "@/components/appearance";
import { chooseCompany } from "./actions";

/**
 * The front door of the demo. The left stage is drawn in whichever company is
 * under the pointer or keyboard focus, and glides between brands through
 * registered colour properties. Choosing one carries its mark into the login
 * page as a View Transition, so the company you picked is the one that greets
 * you. Without View Transitions the navigation is simply instant.
 */
export function CompanySelector({ order, current }: { order: TenantKey[]; current: TenantKey | null }) {
  const [active, setActive] = useState<TenantKey>(current ?? order[0]!);
  const [going, setGoing] = useState<TenantKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const t = TENANTS[active];

  const choose = useCallback((key: TenantKey) => {
    setActive(key);
    setGoing(key);
    setError(null);
    startTransition(async () => {
      const r = await chooseCompany(key);
      if (!r.ok) {
        setGoing(null);
        setError("That company could not be opened. Try again.");
        return;
      }
      // A full navigation, so the browser can run the cross-document View Transition.
      window.location.assign("/login");
    });
  }, []);

  // Arrow keys move through the roster; the stage follows focus.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>("button[data-key]"));
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = buttons[(i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length];
      if (next) {
        e.preventDefault();
        next.focus();
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className="grid min-h-screen grid-rows-[auto_1fr] bg-canvas lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-1">
      {/* ── Stage ─────────────────────────────────────────────────────────── */}
      <section data-brand={t.theme} className="sel-stage relative flex flex-col overflow-hidden px-6 py-7 lg:px-12 lg:py-12" aria-live="polite">
        <BrandMark tenant={active} size={560} accent="var(--stage-glow)" className="sel-watermark pointer-events-none absolute -bottom-40 -right-40 hidden lg:block" />

        <div className="relative flex flex-1 flex-col justify-center gap-6 lg:gap-8">
          <div key={active} className="sel-mark-in flex items-center gap-4 lg:flex-col lg:items-start lg:gap-6">
            <span style={{ viewTransitionName: "brand-mark" }} className="text-[var(--stage-fg)]">
              <BrandMark tenant={active} size={88} accent="var(--stage-glow)" className="h-14 w-14 lg:h-[88px] lg:w-[88px]" />
            </span>
            <span style={{ viewTransitionName: "brand-name" }} className="text-[var(--stage-fg)]">
              <Wordmark tenant={active} className="block text-[28px] leading-[1.02] lg:text-[46px]" />
            </span>
          </div>
          <p className="max-w-[40ch] text-[14px] leading-relaxed text-[var(--stage-dim)] lg:text-[15.5px]">{t.descriptor}.</p>
        </div>

        <dl className="relative mt-8 hidden grid-cols-2 gap-x-6 gap-y-3 border-t border-white/10 pt-5 text-[12px] lg:grid">
          <Fact label="Industry" value={t.industry} />
          <Fact label="Based in" value={t.region} />
          <Fact label={t.group === "prospect" ? "Asked for" : "Use case"} value={t.focus} span />
          <div className="col-span-2">
            <dt className="sr-only">Highlights</dt>
            <dd>
              <ul key={active} className="sel-mark-in flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--stage-fg)]">
                {t.highlights.map((h) => (
                  <li key={h} className="flex items-center gap-1.5">
                    <span aria-hidden className="h-1 w-1 rounded-full bg-[var(--stage-glow)]" />
                    {h}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      </section>

      {/* ── Roster ────────────────────────────────────────────────────────── */}
      <section className="flex flex-col justify-center px-5 py-8 sm:px-8 lg:px-16 lg:py-12">
        <div className="mx-auto w-full max-w-[640px]">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-ink lg:text-[26px]">
            Which company is this demo for?
          </h1>
          <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-muted">
            Each company runs on its own data, modules, theme and guided tour. Choosing one opens its sign-in; switching later signs you out.
          </p>

          <div ref={listRef} className="mt-6 flex flex-col gap-5">
          {(["prospect", "industry"] as const).map((group) => (
          <section key={group} aria-labelledby={`sel-${group}`}>
          <h2 id={`sel-${group}`} className="mb-2 flex items-baseline justify-between gap-3 text-[12px] font-semibold text-ink">
            {group === "prospect" ? "Prepared for" : "Industry demos"}
            <span className="text-[11px] font-normal text-muted">
              {group === "prospect" ? "Named prospects, on their own trade" : "One use case each, on invented data"}
            </span>
          </h2>
          <ol className="flex flex-col gap-1.5" aria-label={group === "prospect" ? "Prospects" : "Industry demos"}>
            {order.filter((key) => TENANTS[key].group === group).map((key) => {
              const c = TENANTS[key];
              const on = key === active;
              const busy = going === key;
              return (
                <li key={key} data-brand={c.theme}>
                  <button
                    type="button"
                    data-key={key}
                    onMouseEnter={() => !going && setActive(key)}
                    onFocus={() => !going && setActive(key)}
                    onClick={() => choose(key)}
                    disabled={going !== null}
                    aria-current={key === current ? "true" : undefined}
                    className={`sel-row group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-md border bg-surface px-4 py-2.5 text-left transition-[border-color,box-shadow,transform] duration-200 ease-out disabled:cursor-progress ${on ? "sel-row-on" : "border-edge"}`}
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-md bg-[var(--b-nav)] text-white">
                      <BrandMark tenant={key} size={26} accent="var(--b-glow)" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                        <Wordmark tenant={key} className="text-[17px] leading-tight text-ink" />
                        <span className="text-[12px] text-muted">{c.industry}</span>
                      </span>
                      <span className="mt-1 block truncate text-[12.5px] text-ink/80">{c.focus}</span>
                    </span>
                    <span className="flex flex-col items-end gap-2">
                      <span
                        className={`rounded-sm px-1.5 py-0.5 text-[10.5px] font-medium ${c.complexity === "High" ? "bg-warning-bg text-warning-text" : c.complexity === "Medium" ? "bg-info-bg text-info-text" : "bg-faint text-muted"}`}
                      >
                        {c.complexity === "To be assessed" ? "Complexity to be assessed" : `${c.complexity} complexity`}
                      </span>
                      <span className="flex items-center gap-1 text-[12px] font-medium text-[var(--b-primary)] opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                        {busy ? "Opening…" : key === current ? "Continue" : "Open"}
                        <IconArrowRight size={13} />
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          </section>
          ))}
          </div>

          {error && (
            <p role="alert" className="mt-3 text-[12.5px] text-danger-text">
              {error}
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-edge pt-4">
            <p className="text-[11.5px] text-muted">Demonstration environment. Every record is synthetic.</p>
            <ModeSwitch />
          </div>
        </div>
      </section>
    </main>
  );
}

function Fact({ label, value, span }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <dt className="text-[11px] text-[var(--stage-dim)]">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-[var(--stage-fg)]">{value}</dd>
    </div>
  );
}

function ModeSwitch() {
  const { mode, setMode } = useAppearance();
  return (
    <div role="radiogroup" aria-label="Appearance" className="flex rounded bg-faint p-0.5">
      {(["light", "dark", "system"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => setMode(m)}
          className={`h-[24px] rounded-[3px] px-2.5 text-[11.5px] capitalize transition-colors duration-150 ${mode === m ? "bg-surface font-medium text-ink shadow-[0_1px_2px_rgb(var(--c-overlay)/0.14)]" : "text-muted hover:text-ink"}`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
