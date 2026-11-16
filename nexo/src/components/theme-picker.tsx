"use client";

import { useEffect, useRef, useState } from "react";
import { useAppearance } from "@/components/appearance";
import { THEMES, MODES, STYLES, type ModeKey, type StyleKey } from "@/lib/tenants";
import { IconCheck, IconMoon } from "@/components/icons";

/**
 * Palette, style and light/dark, for whoever is using the screen. Each company
 * opens in its own palette and style; the choice is remembered per company.
 */
export function ThemePicker({ tone = "dark", align = "right" }: { tone?: "dark" | "light"; align?: "left" | "right" }) {
  const { theme, mode, style, setTheme, setMode, setStyle, tenant } = useAppearance();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const current = THEMES.find((t) => t.key === theme)!;
  const trigger =
    tone === "dark"
      ? "h-8 rounded px-2 text-nav-text hover:bg-white/[0.09] hover:text-white"
      : "h-[30px] rounded border border-edge bg-surface px-2 text-ink hover:border-accent";

  return (
    <div ref={wrap} className="relative" data-print-hide>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Theme"
        className={`flex items-center gap-1.5 text-[12px] font-medium transition-colors duration-150 ${trigger}`}
        suppressHydrationWarning
      >
        <Swatch colors={current.swatch} />
        <span className="hidden lg:inline">Theme</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Theme"
          className={`animate-pop absolute top-[calc(100%+6px)] z-50 w-[304px] overflow-hidden rounded-md border border-edge bg-surface shadow-pop ${align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left"}`}
        >
          <div className="border-b border-edge bg-faint px-3 py-2">
            <p className="text-[12px] font-semibold text-ink">Theme and style</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted">Remembered for {tenant.name} on this browser.</p>
          </div>
          <p className="px-3 pt-2.5 text-[11px] font-medium text-muted">Palette</p>
          <ul className="grid grid-cols-3 gap-1 p-2 pt-1.5" aria-label="Palette">
            {THEMES.map((t) => {
              const on = t.key === theme;
              return (
                <li key={t.key}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTheme(t.key)}
                    title={t.key === tenant.theme ? `${t.name} (${tenant.short} default)` : t.name}
                    className={`relative flex w-full flex-col items-center gap-1 rounded px-1 pb-1.5 pt-2 text-[11px] transition-colors duration-150 ${on ? "bg-pastel text-ink" : "text-ink/85 hover:bg-faint"}`}
                  >
                    <Swatch colors={t.swatch} large />
                    <span className="max-w-full truncate leading-tight">{t.name}</span>
                    {t.key === tenant.theme && <span aria-hidden className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />}
                    {on && <IconCheck size={11} className="absolute left-1.5 top-1.5 text-primary" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-edge px-2 pb-2 pt-2">
            <p className="mb-1.5 px-1 text-[11px] font-medium text-muted">Style</p>
            <div role="radiogroup" aria-label="Style" className="grid grid-cols-2 gap-1">
              {STYLES.map((v) => {
                const on = v.key === style;
                return (
                  <button
                    key={v.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setStyle(v.key)}
                    className={`flex items-center gap-2 rounded border px-2 py-1.5 text-left transition-colors duration-150 ${on ? "border-primary bg-pastel" : "border-edge hover:border-accent hover:bg-faint"}`}
                  >
                    <StyleGlyph style={v.key} />
                    <span className="min-w-0">
                      <span className="block text-[12px] font-medium leading-tight text-ink">
                        {v.name}
                        {v.key === tenant.style && <span className="ml-1 text-[10px] font-normal text-muted">default</span>}
                      </span>
                      <span className="block truncate text-[10.5px] leading-tight text-muted">{v.note}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="border-t border-edge p-2">
            <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-medium text-muted">
              <IconMoon size={12} /> Appearance
            </p>
            <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 gap-1 rounded bg-faint p-0.5">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.key}
                  onClick={() => setMode(m.key as ModeKey)}
                  className={`h-[26px] rounded-[3px] text-[12px] transition-colors duration-150 ${mode === m.key ? "bg-surface font-medium text-ink shadow-[0_1px_2px_rgb(var(--c-overlay)/0.14)]" : "text-muted hover:text-ink"}`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Swatch({ colors, large = false }: { colors: [string, string, string]; large?: boolean }) {
  const s = large ? 18 : 14;
  return (
    <span
      aria-hidden
      className="relative inline-block shrink-0 overflow-hidden rounded-full ring-1 ring-black/10"
      style={{ width: s, height: s, background: `conic-gradient(${colors[0]} 0 50%, ${colors[1]} 0 80%, ${colors[2]} 0)` }}
    />
  );
}

/** A thumbnail of each style: row rhythm, corner and heading face, drawn in the palette. */
function StyleGlyph({ style }: { style: StyleKey }) {
  const spec = {
    classic: { r: 2, rows: [5, 11, 17], h: 3, serif: false },
    compact: { r: 0.5, rows: [4.5, 8.5, 12.5, 16.5, 20.5], h: 2, serif: false },
    soft: { r: 5, rows: [7, 15], h: 4, serif: false },
    editorial: { r: 0, rows: [9, 15, 21], h: 0, serif: true },
  }[style];
  return (
    <svg viewBox="0 0 30 26" width={30} height={26} aria-hidden className="shrink-0">
      <rect x="0.5" y="0.5" width="29" height="25" rx={spec.r} fill="rgb(var(--c-surface))" stroke="rgb(var(--c-edge))" />
      {spec.serif ? (
        <text x="4" y="7.5" fontSize="7" fontFamily="Georgia, serif" fontWeight="600" fill="rgb(var(--c-ink))">Aa</text>
      ) : (
        <rect x="4" y="3" width="12" height={spec.h} rx={Math.min(spec.r, 1.5)} fill="rgb(var(--c-primary))" />
      )}
      {spec.rows.map((y) => (
        <rect key={y} x="4" y={y + 2} width="22" height="1" fill="rgb(var(--c-ink) / 0.28)" />
      ))}
      {spec.serif && <rect x="4" y="10" width="22" height="0.8" fill="rgb(var(--c-ink) / 0.7)" />}
    </svg>
  );
}
