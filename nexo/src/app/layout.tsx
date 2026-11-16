import type { Metadata, Viewport } from "next";
import { Host_Grotesk, Azeret_Mono, Barlow_Condensed, Fraunces, Sora, DM_Serif_Display, Archivo, Oswald, Playfair_Display } from "next/font/google";
import "./globals.css";
import "./themes.css";
import { getAppearance, getTenant } from "@/lib/tenant-server";
import { AppearanceProvider } from "@/components/appearance";

/**
 * Host Grotesk carries the interface and Azeret Mono the tabular figures, for
 * every company: the working surface stays one system. Each company's wordmark
 * gets its own face, loaded only as a variable: Sora for Duplast, Barlow
 * Condensed for Trident, Fraunces for Raj (and the Editorial style's headings),
 * DM Serif Display for Harvest Grove, Archivo for Meridian, Oswald for Kestrel,
 * Playfair Display for Loomcraft. Tangent's wordmark uses Host Grotesk.
 */
const sans = Host_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const mono = Azeret_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-num",
});

const markSora = Sora({ subsets: ["latin"], weight: ["600"], display: "swap", variable: "--font-mark-duplast" });
const markBarlow = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700"], display: "swap", variable: "--font-mark-trident" });
const markFraunces = Fraunces({ subsets: ["latin"], weight: ["500", "600"], display: "swap", variable: "--font-mark-raj" });
const markDmSerif = DM_Serif_Display({ subsets: ["latin"], weight: ["400"], display: "swap", variable: "--font-mark-harvest" });
const markArchivo = Archivo({ subsets: ["latin"], weight: ["700"], display: "swap", variable: "--font-mark-meridian" });
const markOswald = Oswald({ subsets: ["latin"], weight: ["600"], display: "swap", variable: "--font-mark-kestrel" });
const markPlayfair = Playfair_Display({ subsets: ["latin"], weight: ["600"], display: "swap", variable: "--font-mark-loomcraft" });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTenant();
  return {
    title: { default: t.name, template: `%s · ${t.short}` },
    description: `${t.name}: ${t.descriptor}.`,
  };
}

/**
 * The direction contract this build is held to. It ships in the emitted HTML so the
 * render can be audited against the intent without reading the source.
 */
const DIRECTION_CONTRACT = `<!--
THESIS: An operator's system of record where the domain is visible on the surface —
K-values, phr, batch lots and GRN reconciliation in the grid itself. Refuses the
card-dashboard ERP that hides work behind tiles and drilldowns.

OWN-WORLD: Bound palette only — #263537 rail, #EDEDED canvas, #248375 actions, status
as a coloured dot beside plain text. 34px rows, 13px body, tabular figures, 1px
#CACACA rules, authored 1.5px-stroke icons. Flat surfaces separated by rules rather
than floating cards: no gradients, no glass, no nested panels, and elevation only on
things that genuinely float over the page — dropdowns, dialogs, the bulk-action bar.

STORY: The operator lands in a dense list they can read, filter and act on without
leaving it — then follows a reference link into the record behind it.

FIRST VIEWPORT: Navy rail left with grouped modules; filter breadcrumb, column
filters and pagination across the top; the grid fills everything else, primary
action top-left.

FORM: Brief-pinned (ServiceNow list view + supplied ERP Color System sheet) — no
direction roll; a user-pinned direction beats the roll. Overdrive C: fused instant
grid + morphing record.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { tenant, theme, mode, style } = await getAppearance();
  return (
    <html lang="en-IN" suppressHydrationWarning data-theme={theme} data-mode={mode} data-style={style} className={`${sans.variable} ${mono.variable} ${markSora.variable} ${markBarlow.variable} ${markFraunces.variable} ${markDmSerif.variable} ${markArchivo.variable} ${markOswald.variable} ${markPlayfair.variable}`}>
      <head>
        {/* Marks that scripts will run, before first paint, so count-ups can hold their figures back. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        {/* A JSX comment is stripped by the compiler and never reaches the markup, so the
            direction contract is emitted as a real HTML comment that survives the build. */}
        <div hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
        <AppearanceProvider tenant={tenant} theme={theme} mode={mode} style={style}>
          {children}
        </AppearanceProvider>
      </body>
    </html>
  );
}
