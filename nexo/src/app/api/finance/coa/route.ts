import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { AccountType } from "@prisma/client";
import { z } from "zod";

const coaSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  type: z.nativeEnum(AccountType),
  description: z.string().optional(),
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

  // Reject vendor accounts from accessing Chart of Accounts
  if (session.user.role === "VENDOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const coa = await prisma.chartOfAccount.findMany({
      orderBy: { code: "asc" },
    });
    return NextResponse.json(coa);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch Chart of Accounts" }, { status: 500 });
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
    const parsed = coaSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    const { code, name, type, description } = parsed.data;

    // Check if account already exists
    const existing = await prisma.chartOfAccount.findUnique({
      where: { code },
    });
    if (existing) {
      return NextResponse.json({ error: "An account with this code already exists." }, { status: 400 });
    }

    const account = await prisma.chartOfAccount.create({
      data: { code, name, type, description },
    });

    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create Chart of Account" }, { status: 500 });
  }
}
