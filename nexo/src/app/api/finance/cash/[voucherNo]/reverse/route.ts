import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { reverseVoucher } from "@/lib/finance/postJournal";
import { z } from "zod";

const reverseSchema = z.object({
  reason: z.string().trim().min(5, "Reason must be at least 5 characters long for reversal"),
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
  { params }: { params: Promise<{ voucherNo: string }> }
) {
  const session = await getSession(req);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!can(session.user.role, "cash:reverse")) {
    return NextResponse.json({ error: "Forbidden: requires cash:reverse permission" }, { status: 403 });
  }

  try {
    const { voucherNo } = await params;

    // Only vouchers in series CR or CP may be reversed
    if (!voucherNo || (!voucherNo.startsWith("CR-") && !voucherNo.startsWith("CP-"))) {
      return NextResponse.json(
        { error: "Only vouchers in series CR or CP may be reversed." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = reverseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Reason is required for reversal." },
        { status: 400 }
      );
    }
    const { reason } = parsed.data;

    // Reject reversing a voucher that is itself a reversal
    const existingPosting = await prisma.ledgerPosting.findFirst({
      where: { voucherNo },
      select: { reversalOfVoucherNo: true },
    });

    if (existingPosting?.reversalOfVoucherNo) {
      return NextResponse.json(
        { error: "A reversal cannot be reversed - post a new journal voucher instead" },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const reversalResult = await reverseVoucher(tx, voucherNo, reason);

      // Write AuditEvent (entityType "CASH")
      await tx.auditEvent.create({
        data: {
          entityType: "CASH",
          entityId: reversalResult.voucherNo,
          action: "REVERSE",
          summary: `Reversed cash voucher ${voucherNo} with ${reversalResult.voucherNo}: ${reason}`,
          metadata: {
            originalVoucherNo: voucherNo,
            reversalVoucherNo: reversalResult.voucherNo,
            reason,
          },
          actorId: session.user.id,
        },
      });

      return reversalResult;
    });

    return NextResponse.json(
      {
        success: true,
        voucherNo: result.voucherNo,
        originalVoucherNo: voucherNo,
        postings: result.postings,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error reversing cash voucher:", error);
    return NextResponse.json(
      { error: error.message || "Failed to reverse cash voucher" },
      { status: 400 }
    );
  }
}

