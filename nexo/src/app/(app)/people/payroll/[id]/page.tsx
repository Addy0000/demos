import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { RecordHeader, RecordBody, Section, FieldGrid, MiniTable, Td, Tr } from "@/components/detail/record";
import { Chip } from "@/components/ui/chip";
import { money, date, titleise } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const r = await prisma.payrollRun.findUnique({ where: { id }, select: { code: true } });
  return { title: r?.code ?? "Payroll run" };
}
export const dynamic = "force-dynamic";

/** The payroll register: one line a person, which is also their payslip. */
export default async function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("payroll:read");
  const { id } = await params;
  const run = await prisma.payrollRun.findUnique({
    where: { id },
    include: {
      lines: {
        include: { employee: { select: { code: true, name: true, department: true, designation: true } } },
        orderBy: { employee: { code: "asc" } },
      },
    },
  });
  if (!run) notFound();
  const month = run.month.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const sum = (k: "basic" | "hra" | "allowances" | "pf" | "esi" | "professionalTax" | "tds") =>
    run.lines.reduce((s, l) => s + Number(l[k]), 0);
  const depts = new Map<string, { n: number; net: number }>();
  for (const l of run.lines) {
    const d = depts.get(l.employee.department) ?? { n: 0, net: 0 };
    d.n++;
    d.net += Number(l.net);
    depts.set(l.employee.department, d);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordHeader
        backHref="/people/payroll"
        backLabel="Payroll"
        code={run.code}
        title={`Payroll register, ${month}`}
        status={<Chip tone={run.status === "PAID" ? "success" : run.status === "PROCESSED" ? "info" : "warning"}>{titleise(run.status)}</Chip>}
        meta={[
          { label: "Employees", value: run.headcount },
          { label: "Gross", value: money(run.gross) },
          { label: "Deductions", value: money(run.deductions) },
          { label: "Net pay", value: money(run.net) },
          { label: "Processed", value: date(run.processedAt) },
          { label: "Paid", value: date(run.paidAt) },
        ]}
      />
      <RecordBody
        main={
          <Section title="Register" hint="each line is the employee's payslip" padded={false}>
            <MiniTable
              head={[
                { label: "Emp." },
                { label: "Employee" },
                { label: "Days", align: "right" },
                { label: "Basic", align: "right" },
                { label: "HRA", align: "right" },
                { label: "Allow.", align: "right" },
                { label: "Gross", align: "right" },
                { label: "PF", align: "right" },
                { label: "ESI", align: "right" },
                { label: "PT", align: "right" },
                { label: "TDS", align: "right" },
                { label: "Net", align: "right" },
              ]}
            >
              {run.lines.map((l) => (
                <Tr key={l.id}>
                  <Td num muted>{l.employee.code}</Td>
                  <Td>
                    <span className="block">{l.employee.name}</span>
                    <span className="block text-[10.5px] text-muted">{l.employee.designation}</span>
                  </Td>
                  <Td align="right" num>{Number(l.paidDays)}</Td>
                  <Td align="right" num>{money(l.basic)}</Td>
                  <Td align="right" num>{money(l.hra)}</Td>
                  <Td align="right" num>{money(l.allowances)}</Td>
                  <Td align="right" num>{money(l.gross)}</Td>
                  <Td align="right" num muted>{money(l.pf)}</Td>
                  <Td align="right" num muted>{money(l.esi)}</Td>
                  <Td align="right" num muted>{money(l.professionalTax)}</Td>
                  <Td align="right" num muted>{money(l.tds)}</Td>
                  <Td align="right" num className="font-medium">{money(l.net)}</Td>
                </Tr>
              ))}
            </MiniTable>
          </Section>
        }
        aside={
          <>
            <Section title="Totals">
              <FieldGrid
                columns={1}
                fields={[
                  { label: "Basic", value: money(sum("basic")) },
                  { label: "HRA", value: money(sum("hra")) },
                  { label: "Allowances", value: money(sum("allowances")) },
                  { label: "Provident fund", value: money(sum("pf")) },
                  { label: "ESI", value: money(sum("esi")) },
                  { label: "Professional tax", value: money(sum("professionalTax")) },
                  { label: "TDS", value: money(sum("tds")) },
                ]}
              />
            </Section>
            <Section title="By department" padded={false}>
              <MiniTable head={[{ label: "Department" }, { label: "People", align: "right" }, { label: "Net", align: "right" }]}>
                {Array.from(depts.entries()).map(([d, v]) => (
                  <Tr key={d}>
                    <Td>{d}</Td>
                    <Td align="right" num>{v.n}</Td>
                    <Td align="right" num>{money(v.net)}</Td>
                  </Tr>
                ))}
              </MiniTable>
            </Section>
          </>
        }
      />
    </div>
  );
}
