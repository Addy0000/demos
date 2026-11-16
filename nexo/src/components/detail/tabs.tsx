"use client";

import { useEffect, useId, useRef, useState } from "react";

export type TabDef = {
  id: string;
  label: string;
  /** Rendered as a count beside the label. Omit when there is nothing to count. */
  count?: number;
  content: React.ReactNode;
};

/**
 * Record tabs, in the reference's idiom: a flat strip of labels sitting on the
 * content's own top rule, the active one lifted onto the surface and underlined
 * in the action colour. No pills, no rounded segmented control.
 *
 * All panels stay mounted and are hidden with `hidden`, so switching a tab never
 * refetches, never loses scroll position inside a related list, and Ctrl-F still
 * finds text on a tab you are not looking at.
 */
export function RecordTabs({
  tabs,
  initial,
  storageKey,
}: {
  tabs: TabDef[];
  initial?: string;
  /** Remembers the last tab per record type, so returning lands where you were. */
  storageKey?: string;
}) {
  const uid = useId();
  const [active, setActive] = useState(initial ?? tabs[0]?.id ?? "");
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!storageKey) return;
    const saved = window.sessionStorage.getItem(`tabs:${storageKey}`);
    if (saved && tabs.some((t) => t.id === saved)) setActive(saved);
    // Only on mount, and only for this record type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function select(id: string) {
    setActive(id);
    if (storageKey) window.sessionStorage.setItem(`tabs:${storageKey}`, id);
  }

  // Left/Right move between tabs when the strip has focus — the expected
  // behaviour for a tablist, and the one keyboard users will try.
  function onKeyDown(e: React.KeyboardEvent) {
    const i = tabs.findIndex((t) => t.id === active);
    if (i < 0) return;
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;

    e.preventDefault();
    const id = tabs[next]!.id;
    select(id);
    stripRef.current?.querySelector<HTMLElement>(`[data-tab="${id}"]`)?.focus();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={stripRef}
        role="tablist"
        aria-label="Record sections"
        onKeyDown={onKeyDown}
        className="flex shrink-0 items-end gap-0 overflow-x-auto scroll-thin border-b border-edge bg-faint px-3"
      >
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              data-tab={t.id}
              role="tab"
              id={`${uid}-tab-${t.id}`}
              aria-selected={on}
              aria-controls={`${uid}-panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => select(t.id)}
              className={[
                "relative -mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[12.5px] transition-colors duration-150",
                on
                  ? "border-primary bg-surface font-semibold text-ink"
                  : "border-transparent text-muted hover:border-edge hover:text-ink",
              ].join(" ")}
            >
              {t.label}
              {t.count !== undefined && (
                <span
                  className={[
                    "rounded-sm px-1 py-px font-num text-[10.5px] tabular-nums",
                    on ? "bg-pastel text-primary-hover" : "bg-edge/50 text-muted",
                  ].join(" ")}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-canvas">
        {tabs.map((t) => (
          <div
            key={t.id}
            role="tabpanel"
            id={`${uid}-panel-${t.id}`}
            aria-labelledby={`${uid}-tab-${t.id}`}
            hidden={t.id !== active}
            className="p-3"
          >
            {t.content}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Layout inside a tab panel: main column plus a narrower aside, matching the
 * shape RecordBody used before tabs existed.
 */
export function TabColumns({ main, aside }: { main: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className={`grid gap-3 ${aside ? "xl:grid-cols-[minmax(0,1fr)_340px]" : ""}`}>
      <div className="flex min-w-0 flex-col gap-3">{main}</div>
      {aside && <div className="flex flex-col gap-3">{aside}</div>}
    </div>
  );
}
