"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { TENANTS, themeCookie, styleCookie, MODE_COOKIE, type TenantKey, type ThemeKey, type ModeKey, type StyleKey, type Tenant } from "@/lib/tenants";

/**
 * Which company this is, and how it is drawn. The theme and mode are written to
 * cookies so the server renders the next page in them, with no flash of the
 * wrong palette; the switch itself happens on <html> immediately.
 */
type Ctx = {
  tenant: Tenant;
  theme: ThemeKey;
  mode: ModeKey;
  style: StyleKey;
  setTheme: (t: ThemeKey) => void;
  setMode: (m: ModeKey) => void;
  setStyle: (s: StyleKey) => void;
};

const AppearanceCtx = createContext<Ctx | null>(null);

export function useAppearance(): Ctx {
  const c = useContext(AppearanceCtx);
  if (!c) throw new Error("useAppearance must be used inside <AppearanceProvider>");
  return c;
}

/**
 * The grid row height for the current style, read from --row-h so CSS stays the
 * one source. Virtualised grids need it as a number; it follows style changes.
 */
export function useRowHeight(fallback = 34): number {
  const [h, setH] = useState(fallback);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => {
      const v = parseFloat(getComputedStyle(root).getPropertyValue("--row-h"));
      if (v > 0) setH(v);
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(root, { attributes: true, attributeFilter: ["data-style"] });
    return () => mo.disconnect();
  }, []);
  return h;
}

export function useTenant(): Tenant {
  return useAppearance().tenant;
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

/** Swap the palette in one frame; a View Transition cross-fades it where supported. */
function apply(attr: "data-theme" | "data-mode" | "data-style", value: string) {
  const root = document.documentElement;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (doc.startViewTransition && !reduce) {
    root.classList.add("theme-swapping");
    doc.startViewTransition(() => root.setAttribute(attr, value));
    setTimeout(() => root.classList.remove("theme-swapping"), 600);
  } else {
    root.setAttribute(attr, value);
  }
}

export function AppearanceProvider({
  tenant,
  theme: initialTheme,
  mode: initialMode,
  style: initialStyle,
  children,
}: {
  tenant: TenantKey;
  theme: ThemeKey;
  mode: ModeKey;
  style: StyleKey;
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState(initialTheme);
  const [mode, setModeState] = useState(initialMode);
  const [style, setStyleState] = useState(initialStyle);

  const setTheme = useCallback(
    (t: ThemeKey) => {
      setThemeState(t);
      writeCookie(themeCookie(tenant), t);
      apply("data-theme", t);
    },
    [tenant],
  );
  const setMode = useCallback((m: ModeKey) => {
    setModeState(m);
    writeCookie(MODE_COOKIE, m);
    apply("data-mode", m);
  }, []);
  const setStyle = useCallback(
    (v: StyleKey) => {
      setStyleState(v);
      writeCookie(styleCookie(tenant), v);
      apply("data-style", v);
    },
    [tenant],
  );

  const value = useMemo(
    () => ({ tenant: TENANTS[tenant], theme, mode, style, setTheme, setMode, setStyle }),
    [tenant, theme, mode, style, setTheme, setMode, setStyle],
  );
  return <AppearanceCtx.Provider value={value}>{children}</AppearanceCtx.Provider>;
}
