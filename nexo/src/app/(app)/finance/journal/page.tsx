import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { JournalGrid } from "./journal-grid";

export const metadata: Metadata = { title: "Journal Vouchers" };
export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const user = await requirePermission("journal:read");
  const canWrite = can(user.role, "journal:write");

  return <JournalGrid canWrite={canWrite} />;
}

