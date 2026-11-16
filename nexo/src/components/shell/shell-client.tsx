"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar, type BadgeCounts } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { CommandPalette } from "@/components/shell/command-palette";
import type { NavGroup } from "@/lib/nav";
import type { TenantKey } from "@/lib/tenants";
import { ReportProvider } from "@/components/report/report-context";
import { PrintLetterhead } from "@/components/report/print-letterhead";
import { TourProvider } from "@/components/tour/tour";

export function ShellClient({
  tenant,
  groups,
  navTargets,
  badges,
  user,
  children,
}: {
  tenant: TenantKey;
  groups: NavGroup[];
  navTargets: { label: string; href: string; group: string }[];
  badges: BadgeCounts;
  user: { name: string; email: string; roleLabel: string; jobTitle: string | null; vendorName: string | null };
  children: React.ReactNode;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  // ⌘K / Ctrl-K anywhere, plus "/" when not already typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (e.key === "/" && !typing && !paletteOpen) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [paletteOpen]);

  const alertCount =
    (badges.pendingPrices ?? 0) + (badges.pendingGrn ?? 0) + (badges.poApproval ?? 0);

  const allowedHrefs = navTargets.map((t) => t.href);

  return (
    <ReportProvider user={{ name: user.name, roleLabel: user.roleLabel }}>
    <TourProvider tenant={tenant} allowedHrefs={allowedHrefs}>
    <div className="app-shell flex h-screen overflow-hidden">
      <Sidebar tenant={tenant} groups={groups} badges={badges} roleLabel={user.roleLabel} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          name={user.name}
          email={user.email}
          roleLabel={user.roleLabel}
          jobTitle={user.jobTitle}
          vendorName={user.vendorName}
          onOpenPalette={openPalette}
          alertCount={alertCount}
        />
        {/* Outside <main> on purpose: the engine reads the page title from main's h1. */}
        <PrintLetterhead />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onClose={closePalette} navTargets={navTargets} />
    </div>
    </TourProvider>
    </ReportProvider>
  );
}
