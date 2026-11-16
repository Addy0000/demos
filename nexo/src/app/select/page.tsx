import type { Metadata } from "next";
import { getChosenTenantKey } from "@/lib/tenant-server";
import { TENANT_ORDER } from "@/lib/tenants";
import { CompanySelector } from "./company-selector";

export const metadata: Metadata = { title: { absolute: "Choose a company" } };
export const dynamic = "force-dynamic";

export default async function SelectPage() {
  const current = await getChosenTenantKey();
  return <CompanySelector order={TENANT_ORDER} current={current} />;
}
