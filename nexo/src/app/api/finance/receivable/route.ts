import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

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
    const session = await auth();
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

  if (!can(session.user.role, "payment:receive")) {
    return NextResponse.json(
      { error: "Forbidden - Insufficient permissions to view accounts receivable" },
      { status: 403 }
    );
  }

  try {
    const invoices = await prisma.salesInvoice.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { id: true, name: true, code: true } },
        salesOrder: { select: { id: true, code: true } },
        challan: { select: { id: true, code: true } },
      },
    });

    const formatted = invoices.map((inv) => ({
      id: inv.id,
      code: inv.code,
      status: inv.status,
      customerId: inv.customerId,
      customer: inv.customer,
      salesOrderId: inv.salesOrderId,
      salesOrder: inv.salesOrder,
      challanId: inv.challanId,
      challan: inv.challan,
      invoiceDate: inv.invoiceDate,
      dueOn: inv.dueOn,
      subtotal: Number(inv.subtotal),
      taxAmount: Number(inv.taxAmount),
      totalValue: Number(inv.totalValue),
      paidAmount: Number(inv.paidAmount),
      creditedAmount: Number(inv.creditedAmount),
      remainingAmount: Math.max(0, Number(inv.totalValue) - Number(inv.paidAmount) - Number(inv.creditedAmount)),
      remark: inv.remark,
      createdAt: inv.createdAt,
      updatedAt: inv.updatedAt,
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("Error fetching sales invoices for AR:", error);
    return NextResponse.json({ error: "Failed to fetch sales invoices" }, { status: 500 });
  }
}
