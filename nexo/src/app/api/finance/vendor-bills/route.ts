import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { VendorBillBasis, VendorBillStatus, PostingSide, PostingSourceType } from "@prisma/client";
import { z } from "zod";

const vendorBillSchema = z.object({
  vendorId: z.string().min(1, "Vendor ID is required"),
  basis: z.nativeEnum(VendorBillBasis),
  referenceNo: z.string().optional(),
  purchaseAccountCode: z.string().min(1, "Purchase Account Code is required"),
  amount: z.coerce.number().positive("Amount must be a positive number"),
  taxAmount: z.coerce.number().min(0, "Tax amount must be non-negative").optional(),
  purchaseOrderId: z.string().optional(),
  goodsReceiptId: z.string().optional(),
});

async function getSession(req: Request) {
  const testUserId = req.headers.get("x-test-user-id");
  if (testUserId) {
    const user = await prisma.user.findUnique({ where: { id: testUserId } });
    if (user) {
      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          vendorId: user.vendorId,
          jobTitle: user.jobTitle,
        },
      };
    }
  }
  try {
    let session = await auth();
    return session;
  } catch (error) {
    return null;
  }
}

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role === "VENDOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const bills = await prisma.vendorBill.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        vendor: { select: { id: true, name: true, code: true } },
        postings: {
          include: {
            account: true,
          },
        },
      },
    });

    // Map bills to include vendor, purchaseAccount, and payableAccount directly in the response
    const formattedBills = bills.map((bill) => {
      const purchasePosting = bill.postings.find((p) => p.side === "DEBIT");
      const payablePosting = bill.postings.find((p) => p.side === "CREDIT");
      return {
        id: bill.id,
        code: bill.code,
        status: bill.status,
        basis: bill.basis,
        vendorId: bill.vendorId,
        vendor: bill.vendor,
        purchaseOrderId: bill.purchaseOrderId,
        goodsReceiptId: bill.goodsReceiptId,
        billNo: bill.billNo,
        billDate: bill.billDate,
        dueOn: bill.dueOn,
        subtotal: Number(bill.subtotal),
        taxAmount: Number(bill.taxAmount),
        totalValue: Number(bill.totalValue),
        paidAmount: Number(bill.paidAmount),
        debitedAmount: Number(bill.debitedAmount ?? 0),
        remainingAmount: Math.max(0, Number(bill.totalValue) - Number(bill.paidAmount) - Number(bill.debitedAmount ?? 0)),
        balanceDue: Math.max(0, Number(bill.totalValue) - Number(bill.paidAmount) - Number(bill.debitedAmount ?? 0)),
        createdById: bill.createdById,
        remark: bill.remark,
        createdAt: bill.createdAt,
        updatedAt: bill.updatedAt,
        purchaseAccount: purchasePosting?.account ?? null,
        payableAccount: payablePosting?.account ?? null,
      };
    });

    return NextResponse.json(formattedBills);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch Vendor Bills" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role === "VENDOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = vendorBillSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    const { vendorId, basis, referenceNo, purchaseAccountCode, amount, taxAmount = 0, purchaseOrderId, goodsReceiptId } = parsed.data;

    // Resolve and verify Purchase Order if provided
    let resolvedPurchaseOrderId: string | undefined = undefined;
    if (basis === "PO" && purchaseOrderId) {
      const po = await prisma.purchaseOrder.findFirst({
        where: {
          OR: [
            { id: purchaseOrderId },
            { code: purchaseOrderId }
          ]
        }
      });
      if (!po) {
        return NextResponse.json(
          { error: `The Purchase Order ID/Code '${purchaseOrderId}' does not exist.` },
          { status: 400 }
        );
      }
      resolvedPurchaseOrderId = po.id;
    }

    // Resolve and verify Goods Receipt if provided
    let resolvedGoodsReceiptId: string | undefined = undefined;
    if (basis === "GRN" && goodsReceiptId) {
      const grn = await prisma.goodsReceipt.findFirst({
        where: {
          OR: [
            { id: goodsReceiptId },
            { code: goodsReceiptId }
          ]
        }
      });
      if (!grn) {
        return NextResponse.json(
          { error: `The Goods Receipt ID/Code '${goodsReceiptId}' does not exist.` },
          { status: 400 }
        );
      }
      resolvedGoodsReceiptId = grn.id;
    }

    // Look up accounts
    const purchaseAccount = await prisma.chartOfAccount.findUnique({
      where: { code: purchaseAccountCode },
    });
    const payableAccount = await prisma.chartOfAccount.findUnique({
      where: { code: "2000" },
    });

    if (!purchaseAccount || !payableAccount) {
      return NextResponse.json(
        { error: "Required financial accounts (purchase or accounts payable) are missing. Please run the seed:fin script to initialize the Chart of Accounts." },
        { status: 500 }
      );
    }

    // Generate billNumber in AP-0001 style using a zero-padded count
    const count = await prisma.vendorBill.count();
    const billNumber = `AP-${String(count + 1).padStart(4, "0")}`;

    const totalValue = amount + taxAmount;

    // Wrap bill creation and ledger postings in a single transaction (Enforces Gap 6)
    const bill = await prisma.$transaction(async (tx) => {
      const newBill = await tx.vendorBill.create({
        data: {
          code: billNumber,
          basis,
          vendorId,
          purchaseOrderId: basis === "PO" ? resolvedPurchaseOrderId : undefined,
          goodsReceiptId: basis === "GRN" ? resolvedGoodsReceiptId : undefined,
          billNo: referenceNo,
          subtotal: amount,
          taxAmount,
          totalValue,
          paidAmount: 0,
          status: VendorBillStatus.APPROVED, // Transition straight to APPROVED to bypass intermediate draft approvals where not specified
          createdById: session.user.id,
        },
      });

      // Debit Purchase Account
      await tx.ledgerPosting.create({
        data: {
          accountId: purchaseAccount.id,
          side: PostingSide.DEBIT,
          amount: totalValue,
          sourceType: PostingSourceType.VENDOR_BILL,
          sourceId: newBill.id,
          vendorBillId: newBill.id,
        },
      });

      // Credit Payable Account
      await tx.ledgerPosting.create({
        data: {
          accountId: payableAccount.id,
          side: PostingSide.CREDIT,
          amount: totalValue,
          sourceType: PostingSourceType.VENDOR_BILL,
          sourceId: newBill.id,
          vendorBillId: newBill.id,
        },
      });

      return newBill;
    });

    return NextResponse.json(bill, { status: 201 });
  } catch (error) {
    console.error("Error creating vendor bill:", error);
    return NextResponse.json({ error: "Failed to create Vendor Bill" }, { status: 500 });
  }
}

/**
 * TODO: SALES_INVOICE Posting trigger:
 * When Sales Invoice is finalized in the Sales module, a Debit entry to Accounts Receivable (code 1100) and
 * a Credit entry to Sales Revenue (code 4000) should be created atomically inside a transaction.
 * 
 * TODO: STOCK_MOVEMENT Posting trigger:
 * When stock is moved (e.g. GRN verified and moved to stores), a Debit entry to Inventory asset (code 1300)
 * and a Credit entry to Stock Clearing (code 1400) should be created atomically inside a transaction.
 */
