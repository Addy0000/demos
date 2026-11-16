import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can, canAny, type Permission } from "@/lib/rbac";
import { getTenantKey } from "@/lib/tenant-server";

export type AppSession = {
  id: string;
  email: string;
  name: string;
  role: Role;
  vendorId: string | null;
  jobTitle: string | null;
};

/**
 * The signed-in user, but only if they signed in to the company this request is
 * for. A session from another company (after switching on the company picker)
 * is treated as no session at all.
 */
export async function currentSession(): Promise<AppSession | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  if (session.user.tenant !== (await getTenantKey())) return null;
  return session.user as AppSession;
}

/** Session or redirect to login. Use in every protected server component. */
export async function requireSession(): Promise<AppSession> {
  const user = await currentSession();
  if (!user) redirect("/login");
  return user;
}

/**
 * Session + permission gate. The route-level half of RBAC; queries still apply
 * vendorScope() for the data-level half.
 */
export async function requirePermission(permission: Permission): Promise<AppSession> {
  const user = await requireSession();
  if (!can(user.role, permission)) redirect(`/denied?need=${encodeURIComponent(permission)}`);
  return user;
}

export async function requireAnyPermission(permissions: Permission[]): Promise<AppSession> {
  const user = await requireSession();
  if (!canAny(user.role, permissions)) {
    redirect(`/denied?need=${encodeURIComponent(permissions.join(" or "))}`);
  }
  return user;
}

/**
 * For server actions: throws rather than redirects.
 *
 * Also confirms the account still exists and is active. A JWT outlives the row it
 * describes — after a user is deleted or the database is re-seeded, a live session
 * would otherwise write a dangling actor id and surface a raw foreign-key error
 * instead of "sign in again".
 */
export async function assertPermission(permission: Permission): Promise<AppSession> {
  const user = await currentSession();
  if (!user) throw new Error("Your session has ended. Sign in again to continue.");

  if (!can(user.role, permission)) {
    throw new Error(`Your role (${user.role}) is not permitted to ${permission.replace(":", " ")}.`);
  }

  const live = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, isActive: true, role: true },
  });

  if (!live) {
    throw new Error("Your account is no longer on this system. Sign out and sign in again.");
  }
  if (!live.isActive) {
    throw new Error("Your account has been deactivated. Contact an administrator.");
  }
  if (live.role !== user.role) {
    throw new Error("Your role has changed since you signed in. Sign in again to continue.");
  }

  return user;
}
