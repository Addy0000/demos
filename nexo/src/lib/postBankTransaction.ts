import { Prisma, PostingSide, PostingSourceType } from "@prisma/client";

export type BankTransactionParams = {
  tx: Prisma.TransactionClient;
  direction: "IN" | "OUT";
  bankAccountCode?: string; // defaults to "1000"
  counterpartyAccountCode: string; // e.g. "2000" for AP, "1100" for AR
  amount: number;
  sourceType: PostingSourceType;
  sourceId: string;
  vendorBillId?: string;
  remark?: string;
};

/**
 * Shared double-entry bank posting primitive.
 * 
 * Direction "OUT" (AP Payment / disbursement):
 *   - DEBIT: Counterparty liability account (e.g. 2000 Accounts Payable)
 *   - CREDIT: Bank / Cash asset account (e.g. 1000 Bank)
 * 
 * Direction "IN" (AR Receipt / collection):
 *   - DEBIT: Bank / Cash asset account (e.g. 1000 Bank)
 *   - CREDIT: Counterparty asset account (e.g. 1100 Accounts Receivable)
 */
export async function postBankTransaction(params: BankTransactionParams) {
  const {
    tx,
    direction,
    bankAccountCode = "1000",
    counterpartyAccountCode,
    amount,
    sourceType,
    sourceId,
    vendorBillId,
    remark,
  } = params;

  if (amount <= 0) {
    throw new Error("Transaction amount must be greater than zero.");
  }

  const bankAccount = await tx.chartOfAccount.findUnique({
    where: { code: bankAccountCode },
  });
  const counterpartyAccount = await tx.chartOfAccount.findUnique({
    where: { code: counterpartyAccountCode },
  });

  if (!bankAccount) {
    throw new Error(
      `Required bank account (code '${bankAccountCode}') was not found. Please seed the Chart of Accounts.`
    );
  }

  if (!counterpartyAccount) {
    throw new Error(
      `Required counterparty account (code '${counterpartyAccountCode}') was not found. Please seed the Chart of Accounts.`
    );
  }

  const debitAccountId = direction === "IN" ? bankAccount.id : counterpartyAccount.id;
  const creditAccountId = direction === "IN" ? counterpartyAccount.id : bankAccount.id;

  const debitPosting = await tx.ledgerPosting.create({
    data: {
      accountId: debitAccountId,
      side: PostingSide.DEBIT,
      amount,
      sourceType,
      sourceId,
      vendorBillId,
      remark,
    },
  });

  const creditPosting = await tx.ledgerPosting.create({
    data: {
      accountId: creditAccountId,
      side: PostingSide.CREDIT,
      amount,
      sourceType,
      sourceId,
      vendorBillId,
      remark,
    },
  });

  return { debitPosting, creditPosting };
}
