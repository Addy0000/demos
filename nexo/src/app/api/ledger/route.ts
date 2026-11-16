import { NextResponse } from "next/server";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * Windowed stock-ledger reads for the virtualized grid.
 *
 * The grid asks for the slice it is about to paint, never the whole table — this
 * is what lets tens of thousands of rows scroll without shipping megabytes of JSON.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ rows: [], total: 0 }, { status: 401 });
  if (session.user.role === Role.VENDOR || !can(session.user.role, "inventory:read")) {
    return NextResponse.json({ rows: [], total: 0 }, { status: 403 });
  }

  const url = new URL(req.url);
  const skip = Math.max(0, Number(url.searchParams.get("skip") ?? 0));
  const take = Math.min(1000, Math.max(1, Number(url.searchParams.get("take") ?? 200)));
  const kind = url.searchParams.get("kind") ?? "";
  const materialId = url.searchParams.get("materialId") ?? "";
  const q = url.searchParams.get("q")?.trim() ?? "";
  const dir = url.searchParams.get("dir") === "asc" ? "asc" : "desc";

  const where: Prisma.StockMovementWhereInput = {
    ...(kind ? { kind: kind as Prisma.EnumMovementKindFilter["equals"] } : {}),
    ...(materialId ? { materialId } : {}),
    ...(q
      ? {
          OR: [
            { material: { name: { contains: q, mode: "insensitive" } } },
            { material: { code: { contains: q, mode: "insensitive" } } },
            { batch: { batchNo: { contains: q, mode: "insensitive" } } },
            { reference: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      select: {
        id: true, kind: true, quantityKg: true, ratePerKg: true,
        reference: true, remark: true, occurredAt: true,
        material: { select: { id: true, code: true, name: true, category: true } },
        batch: { select: { id: true, batchNo: true } },
        user: { select: { name: true } },
      },
      orderBy: { occurredAt: dir },
      skip,
      take,
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return NextResponse.json({
    total,
    skip,
    rows: rows.map((m) => ({
      id: m.id,
      kind: m.kind,
      quantityKg: Number(m.quantityKg),
      ratePerKg: m.ratePerKg ? Number(m.ratePerKg) : null,
      value: m.ratePerKg ? Number(m.quantityKg) * Number(m.ratePerKg) : null,
      reference: m.reference ?? "—",
      remark: m.remark ?? "",
      occurredAt: m.occurredAt.toISOString(),
      materialId: m.material.id,
      materialCode: m.material.code,
      materialName: m.material.name,
      category: m.material.category,
      batchId: m.batch?.id ?? null,
      batchNo: m.batch?.batchNo ?? "—",
      user: m.user?.name ?? "—",
    })),
  });
}
