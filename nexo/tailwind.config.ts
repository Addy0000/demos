import type { Config } from "tailwindcss";

/**
 * Palette sampled directly from the pinned reference (List+View-349424352.png),
 * not approximated by eye. Percentages are the measured dominance of each value
 * in its region of that screenshot.
 *
 *   #2D4042  94.9% of the top bar        → nav.raised
 *   #263537  70.9% of the sidebar        → nav.DEFAULT
 *   #248375  83.1% of the primary button → primary
 *   #E5E8EA  74.7% of the toolbar        → faint
 *   #EDEDED  44.3% of the grid body      → canvas (page + zebra)
 *   #CACACA  hairline rules              → edge
 *   #313131  body text                   → ink
 *   #FF6349 / #FFA301  priority dots     → danger / warning
 *
 * Do not extend this with invented hues.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Every colour is a CSS variable (an RGB triplet) so a company's palette and
        // light/dark mode swap at runtime. Values live in src/app/themes.css.
        nav: {
          deep: "rgb(var(--c-nav-deep) / <alpha-value>)",
          DEFAULT: "rgb(var(--c-nav) / <alpha-value>)",
          raised: "rgb(var(--c-nav-raised) / <alpha-value>)",
          text: "rgb(var(--c-nav-text) / <alpha-value>)",
          dim: "rgb(var(--c-nav-dim) / <alpha-value>)",
        },
        primary: { DEFAULT: "rgb(var(--c-primary) / <alpha-value>)", hover: "rgb(var(--c-primary-hover) / <alpha-value>)" },
        accent: "rgb(var(--c-accent) / <alpha-value>)",
        "accent-soft": "rgb(var(--c-accent-soft) / <alpha-value>)",
        brand: "rgb(var(--c-brand) / <alpha-value>)",
        pastel: "rgb(var(--c-pastel) / <alpha-value>)",
        faint: "rgb(var(--c-faint) / <alpha-value>)",
        canvas: "rgb(var(--c-canvas) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        edge: "rgb(var(--c-edge) / <alpha-value>)",
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        muted: "rgb(var(--c-muted) / <alpha-value>)",
        link: "rgb(var(--c-link) / <alpha-value>)",
        success: { DEFAULT: "rgb(var(--c-success) / <alpha-value>)", text: "rgb(var(--c-success-text) / <alpha-value>)", bg: "rgb(var(--c-success-bg) / <alpha-value>)" },
        warning: { DEFAULT: "rgb(var(--c-warning) / <alpha-value>)", text: "rgb(var(--c-warning-text) / <alpha-value>)", bg: "rgb(var(--c-warning-bg) / <alpha-value>)" },
        danger: { DEFAULT: "rgb(var(--c-danger) / <alpha-value>)", text: "rgb(var(--c-danger-text) / <alpha-value>)", bg: "rgb(var(--c-danger-bg) / <alpha-value>)" },
        info: { DEFAULT: "rgb(var(--c-info) / <alpha-value>)", text: "rgb(var(--c-info-text) / <alpha-value>)", bg: "rgb(var(--c-info-bg) / <alpha-value>)" },
        special: { DEFAULT: "rgb(var(--c-special) / <alpha-value>)", text: "rgb(var(--c-special-text) / <alpha-value>)", bg: "rgb(var(--c-special-bg) / <alpha-value>)" },
      },

      fontFamily: {
        // Host Grotesk, loaded in app/layout.tsx. The system stack stays behind it
        // so a failed webfont degrades to the metrics this UI was tuned against.
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        // Tabular data only — measurement, never costume.
        num: [
          "var(--font-num)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },

      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
        xs: ["0.75rem", { lineHeight: "1.05rem" }],
        sm: ["0.8125rem", { lineHeight: "1.15rem" }],
        base: ["0.875rem", { lineHeight: "1.35rem" }],
      },

      spacing: {
        row: "2.125rem", // 34px — the dense grid's rhythm, matching ROW_H in the virtualizers
        sidebar: "15.5rem",
      },

      // Corner radii are style tokens (Classic, Compact, Soft, Editorial): see globals.css.
      borderRadius: {
        sm: "var(--r-sm)",
        DEFAULT: "var(--r)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
      },

      boxShadow: {
        /**
         * The only elevation in the system. Surfaces sit flush in the canvas and are
         * separated by 1px rules, not by lift — a shadow here means the thing is
         * genuinely floating over the page: a dropdown, a dialog, the bulk-action bar.
         */
        pop: "0 4px 12px rgb(var(--c-overlay) / 0.14), 0 12px 32px rgb(var(--c-overlay) / 0.16)",
      },

      transitionTimingFunction: {
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
