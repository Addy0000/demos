/**
 * Invoice overdue calculation helper (Asia/Kolkata timezone).
 *
 * Rule: An invoice is overdue when dueOn < today (Asia/Kolkata) and balance > 0.
 * Computed at page load / runtime; never written to the DB.
 */

const KOLKATA_TIMEZONE = "Asia/Kolkata";

export interface InvoiceOverdueTarget {
  dueOn?: Date | string | null;
  status?: string | null;
  totalValue?: number | string | { toString(): string } | null;
  paidAmount?: number | string | { toString(): string } | null;
  creditedAmount?: number | string | { toString(): string } | null;
  // Support UI row keys as well
  total?: number | string | { toString(): string } | null;
  paid?: number | string | { toString(): string } | null;
  credited?: number | string | { toString(): string } | null;
  remainingAmount?: number | string | { toString(): string } | null;
  balance?: number | string | { toString(): string } | null;
  due?: number | string | { toString(): string } | null;
}

function parseNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v.toString());
  return Number.isFinite(n) ? n : 0;
}

/**
 * Returns the calendar day count (UTC epoch days) of a date in Asia/Kolkata timezone.
 */
export function getKolkataCalendarDays(d: Date | string | number | null | undefined): number | null {
  if (!d) return null;
  const dt = typeof d === "string" || typeof d === "number" ? new Date(d) : d;
  if (!dt || Number.isNaN(dt.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KOLKATA_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(dt);

  let year = 0;
  let month = 0;
  let day = 0;
  for (const p of parts) {
    if (p.type === "year") year = parseInt(p.value, 10);
    if (p.type === "month") month = parseInt(p.value, 10);
    if (p.type === "day") day = parseInt(p.value, 10);
  }

  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/**
 * Calculates remaining balance and overdue information for an invoice in Asia/Kolkata.
 */
export function getInvoiceOverdueInfo(
  invoice: InvoiceOverdueTarget,
  now: Date | string | number = new Date(),
): { isOverdue: boolean; daysOverdue: number; balance: number } {
  if (invoice.status === "PAID" || invoice.status === "CANCELLED" || invoice.status === "VOID") {
    return { isOverdue: false, daysOverdue: 0, balance: 0 };
  }

  let balance = 0;

  if (invoice.remainingAmount !== undefined && invoice.remainingAmount !== null) {
    balance = parseNum(invoice.remainingAmount);
  } else if (invoice.balance !== undefined && invoice.balance !== null) {
    balance = parseNum(invoice.balance);
  } else if (invoice.due !== undefined && invoice.due !== null) {
    balance = parseNum(invoice.due);
  } else {
    const total = parseNum(invoice.totalValue ?? invoice.total);
    const paid = parseNum(invoice.paidAmount ?? invoice.paid);
    const credited = parseNum(invoice.creditedAmount ?? invoice.credited);
    balance = Math.max(0, total - paid - credited);
  }

  if (balance <= 0.01 || !invoice.dueOn) {
    return { isOverdue: false, daysOverdue: 0, balance };
  }

  const dueDays = getKolkataCalendarDays(invoice.dueOn);
  const nowDays = getKolkataCalendarDays(now);

  if (dueDays === null || nowDays === null) {
    return { isOverdue: false, daysOverdue: 0, balance };
  }

  const daysOverdue = nowDays - dueDays;
  const isOverdue = daysOverdue > 0;

  return {
    isOverdue,
    daysOverdue: isOverdue ? daysOverdue : 0,
    balance,
  };
}

/**
 * Checks whether an invoice is overdue in Asia/Kolkata timezone:
 * dueOn < today (Asia/Kolkata) and balance > 0.
 */
export function isInvoiceOverdue(
  invoice: InvoiceOverdueTarget,
  now: Date | string | number = new Date(),
): boolean {
  return getInvoiceOverdueInfo(invoice, now).isOverdue;
}
