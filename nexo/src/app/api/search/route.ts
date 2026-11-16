import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { money, date } from "@/lib/format";

/**
 * Cross-module search behind the ⌘K palette.
 *
 * Every branch is gated on the caller's permissions, and the VENDOR role is
 * additionally constrained to its own vendorId — a vendor searching "PO" gets
 * only its own purchase orders, never anyone else's.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ hits: [] }, { status: 401 });

  const { role, vendorId } = session.user;
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const isVendor = role === Role.VENDOR;
  const own = isVendor ? { vendorId: vendorId ?? "__unassigned__" } : {};
  const like = { contains: q, mode: "insensitive" as const };
  const TAKE = 5;

  const [customers, projects, materials, orders, receipts, batches, vendors] = await Promise.all([
    can(role, "customer:read") && !isVendor
      ? prisma.customer.findMany({
          where: { OR: [{ name: like }, { code: like }, { city: like }] },
          select: { id: true, code: true, name: true, city: true, status: true },
          take: TAKE,
        })
      : [],

    can(role, "project:read") && !isVendor
      ? prisma.project.findMany({
          where: { OR: [{ name: like }, { code: like }, { application: like }] },
          select: { id: true, code: true, name: true, stage: true, application: true },
          take: TAKE,
        })
      : [],

    can(role, "material:read")
      ? prisma.rawMaterial.findMany({
          where: {
            OR: [{ name: like }, { code: like }, { grade: like }, { casNumber: like }],
            ...(isVendor
              ? { vendorLinks: { some: { vendorId: vendorId ?? "__unassigned__" } } }
              : {}),
          },
          select: { id: true, code: true, name: true, grade: true, category: true, currentPricePerKg: true },
          take: TAKE,
        })
      : [],

    can(role, "po:read")
      ? prisma.purchaseOrder.findMany({
          where: { code: like, ...own },
          select: { id: true, code: true, status: true, totalValue: true, vendor: { select: { name: true } } },
          take: TAKE,
        })
      : [],

    can(role, "grn:read") && !isVendor
      ? prisma.goodsReceipt.findMany({
          where: { OR: [{ code: like }, { invoiceNo: like }, { vehicleNo: like }] },
          select: { id: true, code: true, status: true, receivedOn: true, vendor: { select: { name: true } } },
          take: TAKE,
        })
      : [],

    can(role, "inventory:read") && !isVendor
      ? prisma.inventoryBatch.findMany({
          where: { OR: [{ batchNo: like }, { lotRef: like }] },
          select: { id: true, batchNo: true, status: true, availableQtyKg: true, material: { select: { name: true } } },
          take: TAKE,
        })
      : [],

    can(role, "vendor:read") && !isVendor
      ? prisma.vendor.findMany({
          where: { OR: [{ name: like }, { code: like }, { city: like }] },
          select: { id: true, code: true, name: true, city: true, status: true },
          take: TAKE,
        })
      : [],
  ]);

  const hits = [
    ...customers.map((c) => ({
      id: `cust:${c.id}`, kind: "Customers", label: c.name,
      sub: `${c.code} · ${c.city ?? "—"} · ${c.status}`, href: `/customers/${c.id}`,
    })),
    ...projects.map((p) => ({
      id: `proj:${p.id}`, kind: "Projects", label: p.name,
      sub: `${p.code} · ${p.application}`, href: `/projects/${p.id}`,
    })),
    ...materials.map((m) => ({
      id: `mat:${m.id}`, kind: "Raw materials", label: m.name,
      sub: `${m.code}${m.grade ? ` · ${m.grade}` : ""} · ${m.currentPricePerKg ? `${money(m.currentPricePerKg, 2)}/kg` : "no rate"}`,
      href: isVendor ? `/vendor/prices` : `/procurement/materials/${m.id}`,
    })),
    ...orders.map((o) => ({
      id: `po:${o.id}`, kind: "Purchase orders", label: o.code,
      sub: `${o.vendor.name} · ${money(o.totalValue)} · ${o.status}`,
      href: isVendor ? `/vendor/orders/${o.id}` : `/procurement/orders/${o.id}`,
    })),
    ...receipts.map((g) => ({
      id: `grn:${g.id}`, kind: "Goods receipts", label: g.code,
      sub: `${g.vendor.name} · ${date(g.receivedOn)} · ${g.status}`, href: `/procurement/grn/${g.id}`,
    })),
    ...batches.map((b) => ({
      id: `batch:${b.id}`, kind: "Batches", label: b.batchNo,
      sub: `${b.material.name} · ${b.status}`, href: `/procurement/inventory/${b.id}`,
    })),
    ...vendors.map((v) => ({
      id: `ven:${v.id}`, kind: "Vendors", label: v.name,
      sub: `${v.code} · ${v.city ?? "—"} · ${v.status}`, href: `/procurement/vendors/${v.id}`,
    })),
  ];

  return NextResponse.json({ hits });
}
