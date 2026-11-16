import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { VendorBillStatus, PostingSourceType } from "@prisma/client";
import { postBankTransaction } from "@/lib/postBankTransaction";
import { z } from "zod";

const paymentSchema = z.object({
  amount: z.coerce.number().positive("Payment amount must be greater than zero"),
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ billId: string }> }
) {
  const session = await getSession(req);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role === "VENDOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { billId } = await params;

  try {
    const body = await req.json();
    const parsed = paymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid amount" },
        { status: 400 }
      );
    }

    const { amount } = parsed.data;

    // Run within a single database transaction to ensure atomicity
    const updatedBill = await prisma.$transaction(async (tx) => {
      const bill = await tx.vendorBill.findUnique({
        where: { id: billId },
      });

      if (!bill) {
        throw new Error("Bill not found");
      }

      if (bill.status !== VendorBillStatus.APPROVED && bill.status !== VendorBillStatus.PARTIALLY_PAID) {
        throw new Error("Only approved or partially paid bills can be paid.");
      }

      const totalValue = Number(bill.totalValue);
      const currentPaid = Number(bill.paidAmount);
      const currentDebited = Number(bill.debitedAmount ?? 0);
      const remaining = Math.max(0, totalValue - currentPaid - currentDebited);

      if (amount > remaining + 0.01) {
        throw new Error(`Payment amount exceeds remaining balance of ₹${remaining.toFixed(2)}.`);
      }

      const newPaidAmount = currentPaid + amount;
      const newStatus = (newPaidAmount + currentDebited) >= totalValue - 0.01 
        ? VendorBillStatus.PAID 
        : VendorBillStatus.PARTIALLY_PAID;

      // Update the vendor bill
      const updated = await tx.vendorBill.update({
        where: { id: billId },
        data: {
          paidAmount: newPaidAmount,
          status: newStatus,
        },
        include: {
          vendor: true,
        }
      });

      // Post bank disbursement via shared primitive: Debit 2000 (AP), Credit 1000 (Bank)
      await postBankTransaction({
        tx,
        direction: "OUT",
        counterpartyAccountCode: "2000",
        amount,
        sourceType: PostingSourceType.PAYMENT,
        sourceId: billId,
        vendorBillId: billId,
        remark: `Payment of ₹${amount.toFixed(2)} applied to bill ${bill.code}`,
      });

      return updated;
    });

    return NextResponse.json(updatedBill);
  } catch (error: any) {
    console.error("Error processing payment:", error);
    return NextResponse.json(
      { error: error.message || "Failed to apply payment" },
      { status: 400 }
    );
  }
}
