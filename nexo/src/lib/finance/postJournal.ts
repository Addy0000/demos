import { Prisma, PostingSide, PostingSourceType, LedgerPosting } from "@prisma/client";
import { nextVoucherNo } from "./voucherNumber";

export class JournalError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "JournalError";
  }
}

export class FewerThanTwoLinesError extends JournalError {
  constructor(message = "A journal voucher must contain at least 2 lines.") {
    super(message, "FEWER_THAN_TWO_LINES");
    this.name = "FewerThanTwoLinesError";
  }
}

export class InvalidAmountError extends JournalError {
  constructor(message = "Line amount must be greater than zero.") {
    super(message, "INVALID_AMOUNT");
    this.name = "InvalidAmountError";
  }
}

export class ImbalancedJournalError extends JournalError {
  constructor(message = "Sum of debits must equal sum of credits.") {
    super(message, "IMBALANCED_JOURNAL");
    this.name = "ImbalancedJournalError";
  }
}

export class AccountMissingError extends JournalError {
  constructor(code: string) {
    super(`Account with code '${code}' was not found.`, "ACCOUNT_MISSING");
    this.name = "AccountMissingError";
  }
}

export class AccountInactiveError extends JournalError {
  constructor(code: string) {
    super(`Account with code '${code}' is inactive.`, "ACCOUNT_INACTIVE");
    this.name = "AccountInactiveError";
  }
}

export class CustomerMissingError extends JournalError {
  constructor(message = "A line on account 1100 requires a customerId.") {
    super(message, "CUSTOMER_MISSING");
    this.name = "CustomerMissingError";
  }
}

export class VendorMissingError extends JournalError {
  constructor(message = "A line on account 2000 requires a vendorId.") {
    super(message, "VENDOR_MISSING");
    this.name = "VendorMissingError";
  }
}

export class AmbiguousPartyError extends JournalError {
  constructor(message = "A line cannot carry both customerId and vendorId.") {
    super(message, "AMBIGUOUS_PARTY");
    this.name = "AmbiguousPartyError";
  }
}

export class VoucherNotFoundError extends JournalError {
  constructor(voucherNo: string) {
    super(`Voucher '${voucherNo}' was not found.`, "VOUCHER_NOT_FOUND");
    this.name = "VoucherNotFoundError";
  }
}

export class VoucherAlreadyReversedError extends JournalError {
  constructor(voucherNo: string, reversalVoucherNo?: string) {
    super(
      reversalVoucherNo
        ? `Voucher '${voucherNo}' was already reversed by '${reversalVoucherNo}'.`
        : `Voucher '${voucherNo}' was already reversed.`,
      "VOUCHER_ALREADY_REVERSED"
    );
    this.name = "VoucherAlreadyReversedError";
  }
}

export interface JournalLineInput {
  accountCode: string;
  side: PostingSide;
  amount: Prisma.Decimal | number | string;
  customerId?: string | null;
  vendorId?: string | null;
  remark?: string | null;
}

export interface PostJournalParams {
  series: string;
  sourceType: PostingSourceType;
  sourceId?: string;
  postedAt?: Date;
  remark?: string;
  lines: JournalLineInput[];
}

export async function postJournal(
  tx: Prisma.TransactionClient,
  params: PostJournalParams
): Promise<{ voucherNo: string; postings: LedgerPosting[] }> {
  if (!params.lines || params.lines.length < 2) {
    throw new FewerThanTwoLinesError();
  }

  let sumDebit = new Prisma.Decimal(0);
  let sumCredit = new Prisma.Decimal(0);

  for (const line of params.lines) {
    let amt: Prisma.Decimal;
    try {
      amt = line.amount instanceof Prisma.Decimal ? line.amount : new Prisma.Decimal(line.amount);
    } catch {
      throw new InvalidAmountError(`Invalid decimal amount: ${line.amount}`);
    }

    if (amt.lte(0)) {
      throw new InvalidAmountError(`Amount must be greater than zero, got ${amt.toString()}`);
    }

    if (line.customerId && line.vendorId) {
      throw new AmbiguousPartyError();
    }

    if (line.accountCode === "1100" && !line.customerId) {
      throw new CustomerMissingError();
    }

    if (line.accountCode === "2000" && !line.vendorId) {
      throw new VendorMissingError();
    }

    if (line.side === PostingSide.DEBIT) {
      sumDebit = sumDebit.plus(amt);
    } else if (line.side === PostingSide.CREDIT) {
      sumCredit = sumCredit.plus(amt);
    } else {
      throw new JournalError(`Invalid posting side: ${line.side}`, "INVALID_SIDE");
    }
  }

  if (!sumDebit.equals(sumCredit)) {
    throw new ImbalancedJournalError(
      `Sum of DEBIT (${sumDebit.toFixed(2)}) does not equal sum of CREDIT (${sumCredit.toFixed(2)}).`
    );
  }

  const accountCodes = Array.from(new Set(params.lines.map((l) => l.accountCode)));
  const accounts = await tx.chartOfAccount.findMany({
    where: { code: { in: accountCodes } },
    select: { id: true, code: true, isActive: true },
  });

  const accountMap = new Map(accounts.map((a) => [a.code, a]));

  for (const code of accountCodes) {
    const acc = accountMap.get(code);
    if (!acc) {
      throw new AccountMissingError(code);
    }
    if (!acc.isActive) {
      throw new AccountInactiveError(code);
    }
  }

  const voucherNo = await nextVoucherNo(tx, params.series, params.postedAt);
  const sourceId = params.sourceId ?? voucherNo;
  const postedAt = params.postedAt ?? new Date();

  const postings: LedgerPosting[] = [];
  for (const line of params.lines) {
    const acc = accountMap.get(line.accountCode)!;
    const amt = line.amount instanceof Prisma.Decimal ? line.amount : new Prisma.Decimal(line.amount);

    const posting = await tx.ledgerPosting.create({
      data: {
        accountId: acc.id,
        side: line.side,
        amount: amt,
        sourceType: params.sourceType,
        sourceId,
        voucherNo,
        postedAt,
        remark: line.remark ?? params.remark ?? null,
        customerId: line.customerId ?? null,
        vendorId: line.vendorId ?? null,
      },
    });
    postings.push(posting);
  }

  return { voucherNo, postings };
}

export async function reverseVoucher(
  tx: Prisma.TransactionClient,
  voucherNo: string,
  reason?: string
): Promise<{ voucherNo: string; postings: LedgerPosting[] }> {
  const originalPostings = await tx.ledgerPosting.findMany({
    where: { voucherNo },
    orderBy: { createdAt: "asc" },
  });

  if (!originalPostings || originalPostings.length === 0) {
    throw new VoucherNotFoundError(voucherNo);
  }

  const existingReversal = await tx.ledgerPosting.findFirst({
    where: { reversalOfVoucherNo: voucherNo },
    select: { voucherNo: true },
  });

  if (existingReversal?.voucherNo) {
    throw new VoucherAlreadyReversedError(voucherNo, existingReversal.voucherNo);
  }

  const series = voucherNo.split("-")[0] || "JV";
  const newVoucherNo = await nextVoucherNo(tx, series);

  const reversalPostings: LedgerPosting[] = [];
  const reversalDate = new Date();

  for (const orig of originalPostings) {
    const swappedSide = orig.side === PostingSide.DEBIT ? PostingSide.CREDIT : PostingSide.DEBIT;
    const revRemark = reason ?? `Reversal of ${voucherNo}`;

    const posting = await tx.ledgerPosting.create({
      data: {
        accountId: orig.accountId,
        side: swappedSide,
        amount: orig.amount,
        sourceType: orig.sourceType,
        sourceId: newVoucherNo,
        voucherNo: newVoucherNo,
        reversalOfVoucherNo: voucherNo,
        postedAt: reversalDate,
        remark: revRemark,
        customerId: orig.customerId,
        vendorId: orig.vendorId,
      },
    });
    reversalPostings.push(posting);
  }

  return { voucherNo: newVoucherNo, postings: reversalPostings };
}

