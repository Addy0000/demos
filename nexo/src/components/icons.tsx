"use client";

/**
 * Authored icon set — one grammar throughout: 24px viewBox, 1.5 stroke,
 * round cap and join, no fills. Never substitute a unicode glyph or emoji.
 *
 * The directive is load-bearing, not decoration. This module is imported from
 * both sides of the RSC boundary — server pages render icons directly, and so do
 * client components like `DataGrid` and every action panel. Left directive-less,
 * it is a shared module that can resolve to the *server* build inside a client
 * island, and an island holding a server reference never hydrates: the markup
 * renders, no handler ever fires, and nothing is logged. Marking it client keeps
 * one copy on the client side of the boundary. Server components can still render
 * these freely.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconDashboard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7.5" height="8.5" rx="1.2" />
    <rect x="13.5" y="3" width="7.5" height="5" rx="1.2" />
    <rect x="13.5" y="11" width="7.5" height="10" rx="1.2" />
    <rect x="3" y="14.5" width="7.5" height="6.5" rx="1.2" />
  </Svg>
);

export const IconCustomers = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <path d="M16 5.6a3.2 3.2 0 0 1 0 6" />
    <path d="M17.5 14.9c1.9.5 3.2 2.2 3.2 4.6" />
  </Svg>
);

export const IconProjects = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 3v6.2L4.8 17.6A2 2 0 0 0 6.5 20.6h11a2 2 0 0 0 1.7-3L14.5 9.2V3" />
    <path d="M8 3h8" />
    <path d="M7.2 14.5h9.6" />
  </Svg>
);

export const IconFinance = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4h10" />
    <path d="M7 8.2h10" />
    <path d="M12.5 4c3 0 4.5 1.6 4.5 4.1 0 2.6-1.7 4.1-4.7 4.1H7l7.6 7.8" />
  </Svg>
);

export const IconProcurement = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 4h2.6l2.3 10.4a1.6 1.6 0 0 0 1.6 1.3h8.1a1.6 1.6 0 0 0 1.6-1.2l1.6-6.3H6.2" />
    <circle cx="9.5" cy="19.5" r="1.4" />
    <circle cx="17.5" cy="19.5" r="1.4" />
  </Svg>
);

export const IconInventory = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.5 7.8v8.4a1.6 1.6 0 0 1-.85 1.42l-6.9 3.7a1.6 1.6 0 0 1-1.5 0l-6.9-3.7A1.6 1.6 0 0 1 3.5 16.2V7.8" />
    <path d="m3.8 7 7.45-3.96a1.6 1.6 0 0 1 1.5 0L20.2 7l-7.45 3.96a1.6 1.6 0 0 1-1.5 0Z" />
    <path d="M12 11.2V21" />
  </Svg>
);

export const IconGrn = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 3.5h7a1 1 0 0 1 1 1v1.6a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
    <path d="M16.5 5.2h2a1.6 1.6 0 0 1 1.6 1.6v12.6a1.6 1.6 0 0 1-1.6 1.6H5.5a1.6 1.6 0 0 1-1.6-1.6V6.8a1.6 1.6 0 0 1 1.6-1.6h2" />
    <path d="m8.5 13.4 2.2 2.2 4.6-4.6" />
  </Svg>
);

export const IconVendor = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 20.5h17" />
    <path d="M5.2 20.5V8.2l6.8-4.7 6.8 4.7v12.3" />
    <path d="M9.6 20.5v-4.8h4.8v4.8" />
    <path d="M9.8 10.8h1.2M13 10.8h1.2" />
  </Svg>
);

export const IconDocument = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.5 3.2H7a1.8 1.8 0 0 0-1.8 1.8v14a1.8 1.8 0 0 0 1.8 1.8h10a1.8 1.8 0 0 0 1.8-1.8V8.5Z" />
    <path d="M13.5 3.2V8.5h5.3" />
    <path d="M8.6 13h6.8M8.6 16.4h4.6" />
  </Svg>
);

export const IconMaterial = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.8 3.2v5.4L5.3 16.9a2.1 2.1 0 0 0 1.8 3.2h9.8a2.1 2.1 0 0 0 1.8-3.2l-4.5-8.3V3.2" />
    <path d="M8.4 3.2h7.2" />
    <circle cx="10.6" cy="16.2" r="0.9" />
    <circle cx="13.8" cy="18" r="0.7" />
  </Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10.8" cy="10.8" r="6.6" />
    <path d="m20 20-4.6-4.6" />
  </Svg>
);

export const IconFilter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.6 5.4h16.8l-6.5 7.7v6l-3.8 2v-8Z" />
  </Svg>
);

export const IconColumnFilter = (p: IconProps) => (
  <Svg {...p} strokeWidth={1.7}>
    <path d="M4 6.5h16M6.5 12h11M9.5 17.5h5" />
  </Svg>
);

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9.5 5.5 6 6.5-6 6.5" />
  </Svg>
);

export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m14.5 5.5-6 6.5 6 6.5" />
  </Svg>
);

export const IconChevronsLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12.5 6-6 6 6 6M19 6l-6 6 6 6" />
  </Svg>
);

export const IconChevronsRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m11.5 6 6 6-6 6M5 6l6 6-6 6" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p} strokeWidth={2}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p} strokeWidth={1.8}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 11v5.2" />
    <circle cx="12" cy="8.2" r="0.85" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M19.2 14.6a1.5 1.5 0 0 0 .3 1.65l.05.06a1.8 1.8 0 1 1-2.55 2.55l-.06-.06a1.5 1.5 0 0 0-1.65-.3 1.5 1.5 0 0 0-.9 1.37v.17a1.8 1.8 0 1 1-3.6 0v-.09a1.5 1.5 0 0 0-.98-1.37 1.5 1.5 0 0 0-1.65.3l-.06.06a1.8 1.8 0 1 1-2.55-2.55l.06-.06a1.5 1.5 0 0 0 .3-1.65 1.5 1.5 0 0 0-1.37-.9h-.17a1.8 1.8 0 0 1 0-3.6h.09a1.5 1.5 0 0 0 1.37-.98 1.5 1.5 0 0 0-.3-1.65l-.06-.06a1.8 1.8 0 1 1 2.55-2.55l.06.06a1.5 1.5 0 0 0 1.65.3h.07a1.5 1.5 0 0 0 .9-1.37v-.17a1.8 1.8 0 0 1 3.6 0v.09a1.5 1.5 0 0 0 .9 1.37 1.5 1.5 0 0 0 1.65-.3l.06-.06a1.8 1.8 0 1 1 2.55 2.55l-.06.06a1.5 1.5 0 0 0-.3 1.65v.07a1.5 1.5 0 0 0 1.37.9h.17a1.8 1.8 0 0 1 0 3.6h-.09a1.5 1.5 0 0 0-1.37.9Z" />
  </Svg>
);

export const IconLogout = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 20.5H6a1.8 1.8 0 0 1-1.8-1.8V5.3A1.8 1.8 0 0 1 6 3.5h3.5" />
    <path d="m15.5 16.5 4.5-4.5-4.5-4.5" />
    <path d="M20 12H9.2" />
  </Svg>
);

export const IconBell = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 8.6a6 6 0 1 0-12 0c0 6.4-2.4 8.2-2.4 8.2h16.8S18 15 18 8.6" />
    <path d="M13.7 20.5a2 2 0 0 1-3.4 0" />
  </Svg>
);

export const IconSortAsc = (p: IconProps) => (
  <Svg {...p} strokeWidth={1.8}>
    <path d="m8 14 4-4 4 4" />
  </Svg>
);

export const IconSortDesc = (p: IconProps) => (
  <Svg {...p} strokeWidth={1.8}>
    <path d="m8 10 4 4 4-4" />
  </Svg>
);

export const IconCommand = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 4.5a2.5 2.5 0 1 0 0 5h7a2.5 2.5 0 1 0 0-5v0a2.5 2.5 0 0 0-2.5 2.5v10a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-2.5-2.5h-7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 2.5-2.5V7a2.5 2.5 0 0 0-2.5-2.5Z" />
  </Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.3 4.2 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9.5v4" />
    <circle cx="12" cy="16.8" r="0.85" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 7.2V12l3.2 1.9" />
  </Svg>
);

export const IconTrend = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3.5 16.5 5.2-5.2 3.4 3.4 6.4-6.9" />
    <path d="M14.6 7.8h4.4v4.4" />
  </Svg>
);

export const IconApprove = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.6 12.4 11 14.8l4.6-4.6" />
    <path d="M12 3.2 5 6v5.6c0 4.3 2.9 8.3 7 9.4 4.1-1.1 7-5.1 7-9.4V6Z" />
  </Svg>
);

export const IconLayers = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3.2 8.5 4.4L12 12 3.5 7.6Z" />
    <path d="m3.5 12.4 8.5 4.4 8.5-4.4" />
    <path d="m3.5 16.8 8.5 4.4 8.5-4.4" />
  </Svg>
);

export const IconUsers = (p: IconProps) => IconCustomers(p);

export const IconMenu = (p: IconProps) => (
  <Svg {...p} strokeWidth={1.8}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const IconExternal = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.5 4.5H19.5V10.5" />
    <path d="m19.5 4.5-8 8" />
    <path d="M18 14.5v4a1.8 1.8 0 0 1-1.8 1.8H5.5a1.8 1.8 0 0 1-1.8-1.8V7.8A1.8 1.8 0 0 1 5.5 6h4" />
  </Svg>
);

/** Directional connector — "from this value to that one". */
export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 12h15" />
    <path d="m14 6.5 5.5 5.5L14 17.5" />
  </Svg>
);

export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 11.5A8 8 0 0 0 6.3 6.3L3.5 9" />
    <path d="M4 12.5a8 8 0 0 0 13.7 5.2L20.5 15" />
    <path d="M3.5 4.5V9H8M20.5 19.5V15H16" />
  </Svg>
);

// ── Dashboard flow: one glyph per document in the chain ────────────────────

export const IconEnquiry = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3.5 6.5 8.5 6 8.5-6" />
  </Svg>
);

export const IconOrder = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" />
  </Svg>
);

export const IconTruck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3v3h-7" />
    <circle cx="6.5" cy="17.5" r="1.8" />
    <circle cx="17" cy="17.5" r="1.8" />
  </Svg>
);

export const IconReceipt = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </Svg>
);

export const IconCash = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M6 9.5v5M18 9.5v5" />
  </Svg>
);

export const IconCart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 4h2.5l2.2 10.5h10.6L20.5 8H7" />
    <circle cx="9" cy="19" r="1.5" />
    <circle cx="17" cy="19" r="1.5" />
  </Svg>
);

export const IconPackage = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="m4 7.5 8 4.5 8-4.5M12 12v9M8 5.2l8 4.6" />
  </Svg>
);

export const IconFactory = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 20V10l5 3V10l5 3V6h3v-3h2v3h3v14z" />
    <path d="M7 17h2M12 17h2M17 17h1" />
  </Svg>
);

export const IconFunnel = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 4.5h17l-6.5 8v6l-4 2v-8z" />
  </Svg>
);

export const IconGauge = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 17a8 8 0 1 1 16 0" />
    <path d="m12 17 4-5" />
    <circle cx="12" cy="17" r="1" />
  </Svg>
);

export const IconFlask = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 3h5M10 3v6l-5.5 9.5A1.6 1.6 0 0 0 5.9 21h12.2a1.6 1.6 0 0 0 1.4-2.5L14 9V3" />
    <path d="M7.5 15h9" />
  </Svg>
);

export const IconMoon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
  </Svg>
);

export const IconLink = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Svg>
);

export const IconTag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12V4h8l9.5 9.5-8 8z" />
    <circle cx="7.5" cy="8" r="1.4" />
  </Svg>
);

export const IconBridge = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20V8M9 20v-6M14 20V11M19 20V5" />
  </Svg>
);

export const IconWallet = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7.5V18a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-1.5zM4 7.5A2 2 0 0 1 6 5.5h11V9" />
    <circle cx="16" cy="14.5" r="1.2" />
  </Svg>
);

export const IconPrinter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 8.5V3.8h10v4.7" />
    <path d="M7 17H5a1.8 1.8 0 0 1-1.8-1.8v-4.9A1.8 1.8 0 0 1 5 8.5h14a1.8 1.8 0 0 1 1.8 1.8v4.9A1.8 1.8 0 0 1 19 17h-2" />
    <path d="M7 13.5h10v6.7H7z" />
  </Svg>
);

export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.8v11M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4.5 16.5v2a1.8 1.8 0 0 0 1.8 1.8h11.4a1.8 1.8 0 0 0 1.8-1.8v-2" />
  </Svg>
);

/** A route between two stops — the guided journey. */
export const IconRoute = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="18" r="2.2" />
    <circle cx="18" cy="6" r="2.2" />
    <path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8" />
  </Svg>
);
