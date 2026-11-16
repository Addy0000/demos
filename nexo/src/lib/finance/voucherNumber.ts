import { Prisma } from "@prisma/client";

/**
 * Generates the next sequential voucher number for a given series and date/year.
 * Uses an atomic upsert with increment on VoucherSequence inside the caller's transaction.
 * E.g. nextVoucherNo(tx, "JV") -> "JV-2026-0001"
 */
export async function nextVoucherNo(
  tx: Prisma.TransactionClient,
  series: string,
  date: Date = new Date()
): Promise<string> {
  const year = date.getFullYear();

  const seq = await tx.voucherSequence.upsert({
    where: {
      series_year: {
        series,
        year,
      },
    },
    create: {
      series,
      year,
      lastNo: 1,
    },
    update: {
      lastNo: {
        increment: 1,
      },
    },
  });

  return `${series}-${year}-${String(seq.lastNo).padStart(4, "0")}`;
}
