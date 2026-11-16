"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavGroup } from "@/lib/nav";
import { Lockup } from "@/components/brand";
import type { TenantKey } from "@/lib/tenants";
import { IconChevronDown, IconSearch, IconChevronsLeft, IconClose } from "@/components/icons";

export type BadgeCounts = Partial<
  Record<
    | "pendingPrices"
    | "pendingGrn"
    | "poApproval"
    | "lowStock"
    | "pendingReq"
    | "openInquiries"
    | "heldRejections"
    | "openSalesInquiries"
    | "pendingCostSheets"
    | "soApproval"
    | "overdueInvoices"
    | "returnsPendingQc"
    | "pendingLeave"
    | "overdueBilling"
    | "activeEngagements",
    number
  >
>;

export function Sidebar({
  tenant,
  groups,
  badges,
  roleLabel,
}: {
  tenant: TenantKey;
  groups: NavGroup[];
  badges: BadgeCounts;
  roleLabel: string;
}) {
  const pathname = usePathname();
  const [filter, setFilter] = useState("");
  const [railHidden, setRailHidden] = useState(false);

  // Highlight only the most specific entry, so /people/attendance does not also light up /people.
  const activeHref = groups
    .flatMap((g) => g.items.map((i) => i.href))
    .filter((h) => (h === "/" ? pathname === "/" : pathname === h || pathname.startsWith(h + "/")))
    .sort((a, b) => b.length - a.length)[0];

  // Every group starts closed except the one holding the current page. Groups the
  // user opens stay open (and are remembered); the current page's group opens on
  // its own and closes again when you move on, so the rail never piles up.
  const activeGroup = groups.find((g) => g.items.some((i) => i.href === activeHref))?.label;
  const STORE = `nav.open.${tenant}`;
  const [userOpen, setUserOpen] = useState<Set<string>>(() => new Set());
  const [activeClosed, setActiveClosed] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? "[]") as string[];
      if (saved.length) setUserOpen(new Set(saved));
    } catch {
      /* nothing remembered */
    }
  }, [STORE]);
  useEffect(() => setActiveClosed(false), [activeGroup]);
  const isOpen = (label: string) => userOpen.has(label) || (label === activeGroup && !activeClosed);
  const toggle = (label: string) => {
    const opening = !isOpen(label);
    if (label === activeGroup) setActiveClosed(!opening);
    setUserOpen((o) => {
      const n = new Set(o);
      if (opening) n.add(label);
      else n.delete(label);
      try {
        localStorage.setItem(STORE, JSON.stringify([...n]));
      } catch {
        /* not remembered */
      }
      return n;
    });
  };

  const q = filter.trim().toLowerCase();
  const visible = q
    ? groups
        .map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q)) }))
        .filter((g) => g.items.length > 0)
    : groups;

  if (railHidden) {
    return (
      <button
        type="button"
        onClick={() => setRailHidden(false)}
        title="Show navigation"
        aria-label="Show navigation"
        className="fixed bottom-4 left-4 z-40 grid h-9 w-9 place-items-center rounded-md bg-nav text-nav-text shadow-pop transition-colors duration-150 hover:text-white"
      >
        <IconChevronsLeft size={16} className="rotate-180" />
      </button>
    );
  }

  return (
    <nav aria-label="Modules" data-tour="sidebar" data-print-hide className="flex w-sidebar shrink-0 flex-col bg-nav text-nav-text">
      {/* Brand */}
      <div className="flex h-12 items-center gap-2.5 border-b border-white/[0.07] px-3.5">
        {/* The company's own lockup: this is their system. */}
        <span className="min-w-0 flex-1 text-white">
          <Lockup tenant={tenant} size={22} textClass="text-[15px] truncate" />
        </span>
        <button
          type="button"
          onClick={() => setRailHidden(true)}
          title="Hide navigation"
          aria-label="Hide navigation"
          className="grid h-6 w-6 place-items-center rounded text-nav-dim transition-colors duration-150 hover:bg-white/[0.07] hover:text-white"
          suppressHydrationWarning
        >
          <IconChevronsLeft size={15} />
        </button>
      </div>

      {/* Filter — the source reference puts a filter box at the top of the rail. */}
      <div className="border-b border-white/[0.07] p-2.5">
        <div className="relative">
          <IconSearch
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-nav-dim"
          />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter navigator"
            aria-label="Filter navigation"
            className="h-8 w-full rounded border border-white/10 bg-white/[0.06] pl-8 pr-7 text-[12px] text-white placeholder:text-nav-dim transition-colors duration-150 focus:border-accent/60 focus:bg-white/[0.09] focus:outline-none"
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter("")}
              aria-label="Clear filter"
              className="absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-nav-dim transition-colors duration-150 hover:bg-white/10 hover:text-white"
            >
              <IconClose size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Groups */}
      <div className="flex-1 overflow-y-auto scroll-thin py-1">
        {visible.length === 0 && (
          <p className="px-3.5 py-6 text-center text-[12px] text-nav-dim">
            Nothing matches &ldquo;{filter}&rdquo;.
          </p>
        )}

        {visible.map((group) => {
          const isCollapsed = !isOpen(group.label) && !q;
          const here = group.label === activeGroup;
          // A closed group still shows how much is waiting inside it.
          const waiting = group.items.reduce((n, i) => n + (i.badge ? (badges[i.badge] ?? 0) : 0), 0);
          return (
            <div key={group.label} className="border-b border-white/[0.04]">
              <button
                type="button"
                onClick={() => toggle(group.label)}
                aria-expanded={!isCollapsed}
                className={`flex w-full items-center gap-2 px-3.5 py-[9px] text-left text-[12px] font-semibold transition-colors duration-150 hover:bg-white/[0.06] hover:text-white ${here ? "text-white" : "text-nav-text"}`}
              >
                <span aria-hidden className={`h-3.5 w-[3px] shrink-0 rounded-full transition-colors duration-200 ${here ? "bg-brand" : "bg-transparent"}`} />
                <span className="flex-1 truncate">{group.label}</span>
                {isCollapsed && waiting > 0 && (
                  <span className="min-w-[18px] shrink-0 rounded-full bg-white/[0.12] px-1.5 py-px text-center font-num text-[10.5px] font-semibold tabular-nums text-white">
                    {waiting > 99 ? "99+" : waiting}
                  </span>
                )}
                <IconChevronDown
                  size={13}
                  className={`shrink-0 text-nav-dim transition-transform duration-200 ease-out ${isCollapsed ? "-rotate-90" : ""}`}
                />
              </button>

              <div className={`nav-fold grid ${isCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`} inert={isCollapsed || undefined}>
                <ul className="min-h-0 overflow-hidden pb-1">
                  {group.items.map((item) => {
                    const active = item.href === activeHref;
                    const count = item.badge ? badges[item.badge] : undefined;

                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={[
                            "mx-2 flex items-center gap-2 rounded-[6px] py-[6px] pl-[21px] pr-2.5 text-[12.5px] transition-colors duration-150",
                            active
                              ? "bg-primary font-medium text-white"
                              : "text-nav-text hover:bg-white/[0.07] hover:text-white",
                          ].join(" ")}
                        >
                          <span className="flex-1 truncate">{item.label}</span>
                          {count !== undefined && count > 0 && (
                            <span
                              className={[
                                "min-w-[18px] shrink-0 rounded-full px-1.5 py-px text-center font-num text-[10.5px] font-semibold tabular-nums",
                                active ? "bg-white/25 text-white" : "bg-accent/25 text-white",
                              ].join(" ")}
                            >
                              {count > 99 ? "99+" : count}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-white/[0.07] px-3.5 py-2.5">
        <p className="text-[10.5px] tracking-wide text-nav-dim">Signed in as</p>
        <p className="mt-0.5 truncate text-[12px] font-medium text-white">{roleLabel}</p>
      </div>
    </nav>
  );
}
