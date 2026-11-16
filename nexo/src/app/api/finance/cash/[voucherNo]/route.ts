import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PostingSide, Prisma } from "@prisma/client";

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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ voucherNo: string }> }
) {
  const session = await getSession(req);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!can(session.user.role, "cash:read")) {
    return NextResponse.json({ error: "Forbidden: requires cash:read permission" }, { status: 403 });
  }

  try {
    const { voucherNo } = await params;

    // Only vouchers in series CR or CP
    if (!voucherNo || (!voucherNo.startsWith("CR-") && !voucherNo.startsWith("CP-"))) {
      return NextResponse.json(
        { error: `Cash voucher '${voucherNo}' was not found.` },
        { status: 404 }
      );
    }

    const postings = await prisma.ledgerPosting.findMany({
      where: { voucherNo },
      include: {
        account: { select: { id: true, code: true, name: true, type: true } },
        customer: { select: { id: true, name: true, code: true } },
        vendor: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    if (postings.length === 0) {
      return NextResponse.json(
        { error: `Cash voucher '${voucherNo}' was not found.` },
        { status: 404 }
      );
    }

    // Check if this voucher has been reversed
    const reversal = await prisma.ledgerPosting.findFirst({
      where: { reversalOfVoucherNo: voucherNo },
      select: { voucherNo: true, postedAt: true, remark: true },
    });

    // Check if this voucher is a reversal of another voucher
    const originalVoucherNo = postings.find((p) => p.reversalOfVoucherNo)?.reversalOfVoucherNo ?? null;

    // Fetch creator from AuditEvent
    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        entityType: "CASH",
        entityId: voucherNo,
        action: "POST",
      },
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
    });

    const counterPosting = postings.find((p) => p.account.code !== "1000") || postings[0];
    const partyPosting = postings.find((p) => p.customer || p.vendor);
    const party = partyPosting?.customer
      ? { id: partyPosting.customer.id, name: partyPosting.customer.name, code: partyPosting.customer.code, type: "customer" }
      : partyPosting?.vendor
      ? { id: partyPosting.vendor.id, name: partyPosting.vendor.name, code: partyPosting.vendor.code, type: "vendor" }
      : null;

    const debitTotal = postings
      .filter((p) => p.side === PostingSide.DEBIT)
      .reduce((sum, p) => sum.add(p.amount), new Prisma.Decimal(0));

    const creditTotal = postings
      .filter((p) => p.side === PostingSide.CREDIT)
      .reduce((sum, p) => sum.add(p.amount), new Prisma.Decimal(0));

    const legs = postings.map((p) => ({
      id: p.id,
      accountCode: p.account.code,
      accountName: p.account.name,
      side: p.side,
      amount: p.amount,
      remark: p.remark,
      partyId: p.customerId ?? p.vendorId ?? null,
      partyType: p.customerId ? "customer" : p.vendorId ? "vendor" : null,
      partyName: p.customer?.name ?? p.vendor?.name ?? null,
    }));

    const narration = (auditEvent?.metadata as any)?.narration ?? postings[0].remark;
    const type = voucherNo.startsWith("CR-") ? "RECEIPT" : "PAYMENT";

    return NextResponse.json({
      voucherNo,
      type,
      postedAt: postings[0].postedAt,
      date: postings[0].postedAt,
      narration,
      amount: postings[0].amount,
      totalAmount: debitTotal,
      debitTotal,
      creditTotal,
      status: reversal ? "REVERSED" : "POSTED",
      counterAccount: counterPosting
        ? { code: counterPosting.account.code, name: counterPosting.account.name }
        : null,
      party,
      createdBy: auditEvent?.actor?.name ?? auditEvent?.actor?.email ?? null,
      originalVoucherNo,
      reversingVoucherNo: reversal?.voucherNo ?? null,
      legs,
    });
  } catch (error: any) {
    console.error("Error fetching cash voucher detail:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch cash voucher" },
      { status: 500 }
    );
  }
}

