"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { initials } from "@/lib/format";
import { IconSearch, IconLogout, IconChevronDown, IconBell, IconRoute } from "@/components/icons";
import { GenerateMenu } from "@/components/report/generate-menu";
import { useReport } from "@/components/report/report-context";
import { useTour } from "@/components/tour/tour";
import { ThemePicker } from "@/components/theme-picker";
import { useTenant } from "@/components/appearance";
import { IconBridge } from "@/components/icons";

export function Topbar({
  name,
  email,
  roleLabel,
  jobTitle,
  vendorName,
  onOpenPalette,
  alertCount,
}: {
  name: string;
  email: string;
  roleLabel: string;
  jobTitle: string | null;
  vendorName: string | null;
  onOpenPalette: () => void;
  alertCount: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mac, setMac] = useState(false);
  const { localControls } = useReport();
  const tour = useTour();
  const company = useTenant();

  useEffect(() => {
    setMac(/Mac|iPod|iPhone|iPad/.test(navigator.platform));
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-user-menu]")) setMenuOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menuOpen]);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-edge bg-nav px-3" data-print-hide>
      {/* Global search opens the palette — one search surface, not two. */}
      <button
        type="button"
        data-tour="palette"
        onClick={onOpenPalette}
        className="group flex h-8 flex-1 max-w-md items-center gap-2 rounded border border-white/10 bg-white/[0.06] px-2.5 text-left transition-colors duration-150 hover:border-white/20 hover:bg-white/[0.1]"
      >
        <IconSearch size={14} className="shrink-0 text-nav-dim" />
        <span className="flex-1 truncate text-[12px] text-nav-dim group-hover:text-nav-text">
          {company.kind === "services" ? "Search clients, engagements, people…" : "Search customers, products, materials, orders…"}
        </span>
        <kbd className="hidden shrink-0 rounded border border-white/15 bg-white/10 px-1.5 py-0.5 font-num text-[10.5px] text-nav-text sm:block">
          {mac ? "⌘" : "Ctrl"} K
        </kbd>
      </button>

      <div className="flex-1" />

      {/* Screens without a toolbar of their own (dashboard, flow maps, ledgers)
          get Generate here, so every screen in the app can produce its paper. */}
      {localControls === 0 && <GenerateMenu kind="page" tone="dark" local={false} />}

      <ThemePicker />

      <button
        type="button"
        data-tour="tour-launch"
        onClick={() => tour.start()}
        aria-pressed={tour.active}
        title="Guided tour of the whole order-to-cash journey"
        className="flex h-8 items-center gap-1.5 rounded px-2 text-[12px] font-medium text-nav-text transition-colors duration-150 hover:bg-white/[0.09] hover:text-white"
      >
        <IconRoute size={15} className="text-accent-soft" />
        <span className="hidden md:inline">Tour</span>
      </button>

      {alertCount > 0 && (
        <span
          className="relative grid h-8 w-8 place-items-center rounded text-nav-text"
          title={`${alertCount} item${alertCount === 1 ? "" : "s"} need attention`}
        >
          <IconBell size={16} />
          <span className="absolute right-1 top-1 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-warning px-1 font-num text-[9.5px] font-semibold text-nav">
            {alertCount > 9 ? "9+" : alertCount}
          </span>
        </span>
      )}

      <div className="relative" data-user-menu>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className="flex h-8 items-center gap-2 rounded px-1.5 transition-colors duration-150 hover:bg-white/[0.09]"
        >
          <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-accent font-num text-[10.5px] font-semibold text-nav">
            {initials(name)}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block max-w-[150px] truncate text-[12px] font-medium leading-tight text-white">
              {name}
            </span>
            <span className="block max-w-[150px] truncate text-[10.5px] leading-tight text-nav-dim">
              {roleLabel}
            </span>
          </span>
          <IconChevronDown
            size={14}
            className={`shrink-0 text-nav-dim transition-transform duration-200 ease-out ${menuOpen ? "rotate-180" : ""}`}
          />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="animate-pop absolute right-0 top-[calc(100%+6px)] z-50 w-64 origin-top-right overflow-hidden rounded-md border border-edge bg-surface shadow-pop"
          >
            <div className="border-b border-edge bg-faint px-3 py-2.5">
              <p className="truncate text-[12.5px] font-semibold text-ink">{name}</p>
              <p className="truncate font-num text-[11px] text-muted">{email}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded-sm bg-info-bg px-1.5 py-0.5 text-[10.5px] font-medium text-ink">
                  {roleLabel}
                </span>
                {jobTitle && <span className="text-[10.5px] text-muted">{jobTitle}</span>}
              </p>
              {vendorName && (
                <p className="mt-1.5 border-t border-edge pt-1.5 text-[11px] text-muted">
                  Scoped to <span className="font-medium text-ink">{vendorName}</span>
                </p>
              )}
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={() => signOut({ callbackUrl: "/select" })}
              className="flex w-full items-center gap-2 border-b border-edge px-3 py-2.5 text-left text-[12.5px] text-ink transition-colors duration-150 hover:bg-faint"
            >
              <IconBridge size={15} className="text-muted" />
              Switch company
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12.5px] text-ink transition-colors duration-150 hover:bg-faint"
            >
              <IconLogout size={15} className="text-muted" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
