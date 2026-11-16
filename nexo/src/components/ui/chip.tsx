import { titleise } from "@/lib/format";

export type Tone = "success" | "warning" | "danger" | "info" | "special" | "neutral";

const TONE: Record<Tone, { dot: string; text: string; tint: string; border: string }> = {
  success: { dot: "bg-success", text: "text-success-text", tint: "bg-success-bg", border: "border-success/40" },
  warning: { dot: "bg-warning", text: "text-warning-text", tint: "bg-warning-bg", border: "border-warning/50" },
  danger: { dot: "bg-danger", text: "text-danger-text", tint: "bg-danger-bg", border: "border-danger/40" },
  info: { dot: "bg-info", text: "text-info-text", tint: "bg-info-bg", border: "border-info/40" },
  special: { dot: "bg-special", text: "text-special-text", tint: "bg-special-bg", border: "border-special/40" },
  neutral: { dot: "bg-muted/60", text: "text-muted", tint: "bg-faint", border: "border-edge" },
};

/**
 * A record's state, as the reference renders it: a coloured dot against plain
 * text, not a filled pill.
 *
 * The pill is the reflex here and it is the wrong one — at 34px rows a column of
 * saturated lozenges fights the data for attention, and once every enum is a pill
 * none of them signal anything. The dot carries the colour; the label stays text,
 * so a status column reads at the same weight as the columns beside it.
 *
 * `solid` is the deliberate exception: use it where the value IS the emphasis
 * (a count badge, a single flag on an otherwise plain row), never down a column.
 */
export function Chip({
  tone = "neutral",
  solid = false,
  children,
}: {
  tone?: Tone;
  solid?: boolean;
  children: React.ReactNode;
}) {
  const t = TONE[tone];

  if (solid) {
    return (
      <span
        className={`inline-block max-w-full truncate rounded-sm border px-1.5 py-[1px] text-[11px] font-medium leading-[15px] ${t.tint} ${t.border} ${t.text}`}
      >
        {children}
      </span>
    );
  }

  return (
    <span className="inline-flex max-w-full items-center gap-1.5 truncate text-[12px] leading-[16px] text-ink">
      <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${t.dot}`} aria-hidden="true" />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Explicit dot + label. Same rendering as the default Chip; kept for clarity at
 *  call sites where the ranking is the point (priority, severity). */
export function DotLabel({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return <Chip tone={tone}>{children}</Chip>;
}

/** Filled counter — for numbers on a rail or a toolbar, never for a status column. */
export function Tag({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <Chip tone={tone} solid>
      {children}
    </Chip>
  );
}

// ── Domain tone maps ────────────────────────────────────────────────────────

export const priorityTone = (p: string): Tone =>
  ({ CRITICAL: "danger", HIGH: "warning", MODERATE: "info", LOW: "neutral", PLANNING: "special" })[p] as Tone ?? "neutral";

export const projectStageTone = (s: string): Tone =>
  ({
    ENQUIRY: "neutral", FORMULATION: "info", LAB_TRIAL: "info",
    SAMPLE_WITH_CUSTOMER: "special", PLANT_TRIAL: "warning",
    APPROVED: "success", IN_PRODUCTION: "success", ON_HOLD: "warning", DROPPED: "danger",
  })[s] as Tone ?? "neutral";

export const customerStatusTone = (s: string): Tone =>
  ({ ACTIVE: "success", PROSPECT: "info", ON_HOLD: "warning", DORMANT: "neutral" })[s] as Tone ?? "neutral";

export const priceStatusTone = (s: string): Tone =>
  ({
    APPROVED: "success", PENDING_APPROVAL: "warning", REJECTED: "danger",
    SUPERSEDED: "neutral", DRAFT: "neutral",
  })[s] as Tone ?? "neutral";

export const poStatusTone = (s: string): Tone =>
  ({
    DRAFT: "neutral", PENDING_APPROVAL: "warning", APPROVED: "info",
    PARTIALLY_RECEIVED: "special", RECEIVED: "success", CLOSED: "neutral", CANCELLED: "danger",
  })[s] as Tone ?? "neutral";

export const requisitionStatusTone = (s: string): Tone =>
  ({
    DRAFT: "neutral", PENDING_APPROVAL: "warning", APPROVED: "info",
    REJECTED: "danger", PARTIALLY_ORDERED: "special", ORDERED: "success",
    CLOSED: "neutral", CANCELLED: "danger",
  })[s] as Tone ?? "neutral";

export const inquiryStatusTone = (s: string): Tone =>
  ({
    DRAFT: "neutral", SENT: "info", QUOTES_IN: "warning",
    COMPARED: "success", CLOSED: "neutral", CANCELLED: "danger",
  })[s] as Tone ?? "neutral";

export const quotationStatusTone = (s: string): Tone =>
  ({
    DRAFT: "neutral", SUBMITTED: "info", UNDER_REVIEW: "warning",
    SELECTED: "success", REJECTED: "danger", EXPIRED: "neutral",
  })[s] as Tone ?? "neutral";

export const vrnStatusTone = (s: string): Tone =>
  ({
    DRAFT: "neutral", PENDING_APPROVAL: "warning", APPROVED: "info",
    DISPATCHED: "special", CLOSED: "success", CANCELLED: "danger",
  })[s] as Tone ?? "neutral";

export const salesInquiryTone = (s: string): Tone =>
  ({
    DRAFT: "neutral", OPEN: "info", QUOTED: "warning",
    WON: "success", LOST: "danger", CLOSED: "neutral",
  })[s] as Tone ?? "neutral";

export const costSheetTone = (s: string): Tone =>
  ({
    DRAFT: "neutral", PENDING_APPROVAL: "warning", APPROVED: "success",
    REJECTED: "danger", SUPERSEDED: "neutral",
  })[s] as Tone ?? "neutral";

export const salesQuotationTone = (s: string): Tone =>
  ({
    DRAFT: "neutral", SENT: "info", UNDER_NEGOTIATION: "warning",
    ACCEPTED: "success", REJECTED: "danger", EXPIRED: "neutral",
  })[s] as Tone ?? "neutral";

export const salesOrderTone = (s: string): Tone =>
  ({
    DRAFT: "neutral", PENDING_APPROVAL: "warning", CONFIRMED: "info",
    PARTIALLY_DISPATCHED: "special", DISPATCHED: "success", INVOICED: "success",
    CLOSED: "neutral", CANCELLED: "danger",
  })[s] as Tone ?? "neutral";

export const challanTone = (s: string): Tone =>
  ({
    DRAFT: "neutral", PACKED: "warning", DISPATCHED: "info",
    DELIVERED: "success", CANCELLED: "danger",
  })[s] as Tone ?? "neutral";

export const invoiceTone = (s: string): Tone =>
  ({
    DRAFT: "neutral", RAISED: "info", PART_PAID: "warning",
    PAID: "success", OVERDUE: "danger", CANCELLED: "neutral",
  })[s] as Tone ?? "neutral";

export const salesReturnTone = (s: string): Tone =>
  ({
    DRAFT: "neutral", PENDING_QC: "warning", RESTOCKED: "success",
    PARTIALLY_RESTOCKED: "special", SCRAPPED: "danger",
    CLOSED: "neutral", CANCELLED: "neutral",
  })[s] as Tone ?? "neutral";

/** Margin, banded. Below 8% on a compound is where the business stops earning. */
export const marginTone = (pct: number): Tone =>
  pct >= 15 ? "success" : pct >= 8 ? "warning" : "danger";

export const warehouseKindTone = (k: string): Tone =>
  ({
    STORE: "success", QUARANTINE: "warning", REJECTION: "danger",
    SCRAP: "neutral", WIP: "info",
  })[k] as Tone ?? "neutral";

export const grnStatusTone = (s: string): Tone =>
  ({
    DRAFT: "neutral", PENDING_QC: "warning", QC_PASSED: "success",
    QC_FAILED: "danger", PARTIALLY_ACCEPTED: "special", POSTED: "success",
  })[s] as Tone ?? "neutral";

export const batchStatusTone = (s: string): Tone =>
  ({
    QUARANTINE: "warning", AVAILABLE: "success", CONSUMED: "neutral",
    REJECTED: "danger", EXPIRED: "danger",
  })[s] as Tone ?? "neutral";

export const qcTone = (s: string): Tone =>
  ({ PASS: "success", FAIL: "danger", CONDITIONAL: "warning", PENDING: "neutral" })[s] as Tone ?? "neutral";

export const demoStatusTone = (s: string): Tone =>
  ({
    PLANNED: "neutral", IN_LAB: "info", DISPATCHED: "special",
    UNDER_EVALUATION: "warning", APPROVED: "success", REJECTED: "danger",
  })[s] as Tone ?? "neutral";

export const vendorStatusTone = (s: string): Tone =>
  ({ ACTIVE: "success", ON_HOLD: "warning", BLACKLISTED: "danger", PENDING_APPROVAL: "info" })[s] as Tone ?? "neutral";

export const movementTone = (k: string): Tone =>
  k.startsWith("ISSUE") ? "info"
    : k === "GRN_RECEIPT" ? "success"
    : k === "SCRAP" ? "danger"
    : k.startsWith("ADJUSTMENT") ? "warning"
    : k.startsWith("RETURN") ? "special"
    : "neutral";

export const packingListTone = (s: string): Tone =>
  s === "FINAL" ? "success" : "warning";

export const label = titleise;
