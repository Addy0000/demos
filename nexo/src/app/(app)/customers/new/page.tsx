import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { CustomerForm } from "../customer-form";

export const metadata: Metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  await requirePermission("customer:write");
  return <CustomerForm />;
}
