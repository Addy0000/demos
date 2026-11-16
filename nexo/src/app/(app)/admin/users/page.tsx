import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { ROLE_PERMISSIONS, ROLE_LABELS } from "@/lib/rbac";
import { UsersGrid } from "./users-grid";

export const metadata: Metadata = { title: "Users & roles" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requirePermission("admin:users");

  const users = await prisma.user.findMany({
    include: { vendor: { select: { id: true, name: true } } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return (
    <UsersGrid
      rows={users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        roleLabel: ROLE_LABELS[u.role],
        jobTitle: u.jobTitle ?? "—",
        phone: u.phone ?? "—",
        isActive: u.isActive,
        vendorId: u.vendor?.id ?? null,
        vendorName: u.vendor?.name ?? null,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
        permissionCount: ROLE_PERMISSIONS[u.role].length,
      }))}
      matrix={Object.entries(ROLE_PERMISSIONS).map(([role, perms]) => ({
        role,
        label: ROLE_LABELS[role as keyof typeof ROLE_LABELS],
        permissions: perms,
      }))}
    />
  );
}
