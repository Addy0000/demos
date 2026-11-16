import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { ProjectForm } from "../project-form";

export const metadata: Metadata = { title: "New project" };
export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  await requirePermission("project:write");
  const customers = await prisma.customer.findMany({
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
  return <ProjectForm customers={customers} />;
}
