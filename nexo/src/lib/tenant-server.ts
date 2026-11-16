import "server-only";
import { cookies } from "next/headers";
import {
  TENANTS, TENANT_COOKIE, DEFAULT_TENANT, MODE_COOKIE, tenantOf, themeCookie, themeOf, modeOf, styleCookie, styleOf,
  type Tenant, type TenantKey, type ThemeKey, type ModeKey, type StyleKey,
} from "@/lib/tenants";

/** The company this request is for. Outside a request (build, scripts) it is the default. */
export async function getTenantKey(): Promise<TenantKey> {
  try {
    const c = await cookies();
    return tenantOf(c.get(TENANT_COOKIE)?.value) ?? DEFAULT_TENANT;
  } catch {
    return DEFAULT_TENANT;
  }
}

/** Null when no company has been chosen yet. */
export async function getChosenTenantKey(): Promise<TenantKey | null> {
  try {
    const c = await cookies();
    return tenantOf(c.get(TENANT_COOKIE)?.value);
  } catch {
    return null;
  }
}

export async function getTenant(): Promise<Tenant> {
  return TENANTS[await getTenantKey()];
}

export async function getAppearance(): Promise<{ tenant: TenantKey; theme: ThemeKey; mode: ModeKey; style: StyleKey }> {
  const tenant = await getTenantKey();
  try {
    const c = await cookies();
    return {
      tenant,
      theme: themeOf(c.get(themeCookie(tenant))?.value, TENANTS[tenant].theme),
      mode: modeOf(c.get(MODE_COOKIE)?.value),
      style: styleOf(c.get(styleCookie(tenant))?.value, TENANTS[tenant].style),
    };
  } catch {
    return { tenant, theme: TENANTS[tenant].theme, mode: "light", style: TENANTS[tenant].style };
  }
}
