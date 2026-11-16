"use server";

import { cookies } from "next/headers";
import { TENANT_COOKIE, tenantOf } from "@/lib/tenants";

/**
 * Choose the company this demo is for. Each company is its own system with its
 * own accounts, so choosing also ends any session from the previous one.
 */
export async function chooseCompany(key: string): Promise<{ ok: boolean }> {
  const tenant = tenantOf(key);
  if (!tenant) return { ok: false };
  const c = await cookies();
  c.set(TENANT_COOKIE, tenant, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  for (const name of ["authjs.session-token", "__Secure-authjs.session-token"]) c.delete(name);
  return { ok: true };
}
