import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { NewJournalForm } from "./new-journal-form";

export const metadata: Metadata = { title: "New Journal Voucher" };
export const dynamic = "force-dynamic";

export default async function NewJournalPage() {
  await requirePermission("journal:write");

  const accounts = await prisma.chartOfAccount.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, type: true },
  });

  return <NewJournalForm accounts={accounts} />;
}

