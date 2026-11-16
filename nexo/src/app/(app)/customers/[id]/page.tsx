import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { money, date, dateTime, titleise } from "@/lib/format";
import { RecordHeader, Section, FieldGrid, MiniTable, Td, Tr } from "@/components/detail/record";
import { RecordTabs, TabColumns } from "@/components/detail/tabs";
import { Chip, DotLabel, customerStatusTone, projectStageTone, priorityTone } from "@/components/ui/chip";
import { ContactForm, ActivityForm } from "./client-forms";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const c = await prisma.customer.findUnique({ where: { id }, select: { name: true } });
  return { title: c?.name ?? "Customer" };
}

export const dynamic = "force-dynamic";

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("customer:read");
  const { id } = await params;
  const writable = can(user.role, "customer:write");

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true, email: true } },
      contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      projects: { orderBy: { startedAt: "desc" }, select: { id: true, code: true, name: true, stage: true, priority: true, application: true, targetDate: true } },
      activities: { orderBy: { occurredAt: "desc" }, take: 40, include: { user: { select: { name: true } } } },
    },
  });

  if (!customer) notFound();

  const utilisation =
    Number(customer.creditLimit) > 0
      ? (Number(customer.outstandingAmt) / Number(customer.creditLimit)) * 100
      : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordHeader
        backHref="/customers"
        backLabel="Customers"
        code={customer.code}
        title={customer.name}
        status={<Chip tone={customerStatusTone(customer.status)}>{titleise(customer.status)}</Chip>}
        actions={
          writable ? (
            <Link
              href={`/customers/${customer.id}/edit`}
              className="inline-flex h-[26px] items-center rounded border border-edge bg-surface px-2.5 text-[12px] font-medium text-ink transition-colors duration-150 hover:bg-pastel hover:text-primary"
            >
              Edit
            </Link>
          ) : null
        }
        meta={[
          { label: "Industry", value: titleise(customer.industry) },
          { label: "Location", value: `${customer.city ?? "—"}, ${customer.state ?? "—"}` },
          { label: "Credit limit", value: money(customer.creditLimit) },
          {
            label: "Outstanding",
            value: (
              <span className={utilisation > 80 ? "text-danger" : ""}>
                {money(customer.outstandingAmt)}
                {Number(customer.creditLimit) > 0 && (
                  <span className="ml-1 text-[11px] text-muted">({utilisation.toFixed(0)}%)</span>
                )}
              </span>
            ),
          },
          { label: "Terms", value: customer.paymentTerms ?? `${customer.creditDays} days` },
          { label: "Account owner", value: customer.owner?.name ?? "Unassigned" },
        ]}
      />

      <RecordTabs
        storageKey="customer"
        tabs={[
          {
            id: "projects",
            label: "Projects",
            count: customer.projects.length || undefined,
            content: (
            <Section title="Projects" hint={`${customer.projects.length} on record`}>
              <MiniTable
                head={[
                  { label: "Code", width: "90px" },
                  { label: "Project" },
                  { label: "Application" },
                  { label: "Stage", width: "140px" },
                  { label: "Priority", width: "110px" },
                  { label: "Target", width: "100px", align: "right" },
                ]}
                empty="No projects raised for this customer yet."
              >
                {customer.projects.map((p) => (
                  <Tr key={p.id}>
                    <Td>
                      <Link href={`/projects/${p.id}`} className="ref-link font-num">{p.code}</Link>
                    </Td>
                    <Td>
                      <Link href={`/projects/${p.id}`} className="ref-link">{p.name}</Link>
                    </Td>
                    <Td muted>{p.application}</Td>
                    <Td><Chip tone={projectStageTone(p.stage)}>{titleise(p.stage)}</Chip></Td>
                    <Td><DotLabel tone={priorityTone(p.priority)}>{titleise(p.priority)}</DotLabel></Td>
                    <Td align="right" num muted>{date(p.targetDate)}</Td>
                  </Tr>
                ))}
              </MiniTable>
            </Section>
            ),
          },
          {
            id: "activity",
            label: "Activity",
            count: customer.activities.length || undefined,
            content: (
            <Section title="Activity" hint={`${customer.activities.length} most recent`} padded={false}>
              {writable && <ActivityForm customerId={customer.id} />}
              <MiniTable
                head={[
                  { label: "Date", width: "130px" },
                  { label: "Type", width: "130px" },
                  { label: "Subject" },
                  { label: "Logged by", width: "140px" },
                ]}
                empty="Nothing logged against this customer yet."
              >
                {customer.activities.map((a) => (
                  <Tr key={a.id}>
                    <Td num muted>{date(a.occurredAt)}</Td>
                    <Td><Chip tone={a.kind === "COMPLAINT" ? "danger" : a.kind === "SAMPLE_SENT" ? "special" : "info"}>{titleise(a.kind)}</Chip></Td>
                    <Td>{a.subject}</Td>
                    <Td muted>{a.user?.name ?? "—"}</Td>
                  </Tr>
                ))}
              </MiniTable>
            </Section>
            ),
          },
          {
            id: "contacts",
            label: "Contacts",
            count: customer.contacts.length || undefined,
            content: (
              <Section title="Contacts" hint={`${customer.contacts.length} on file`} padded={false}>
                <MiniTable
                  head={[
                    { label: "Name" },
                    { label: "Role", width: "170px" },
                    { label: "Email", width: "240px" },
                    { label: "Phone", width: "150px" },
                  ]}
                  empty="No contacts recorded."
                >
                  {customer.contacts.map((c) => (
                    <Tr key={c.id}>
                      <Td>
                        <span className="flex items-center gap-2">
                          {c.name}
                          {c.isPrimary && <Chip tone="info" solid>Primary</Chip>}
                        </span>
                      </Td>
                      <Td muted>{c.role ?? "—"}</Td>
                      <Td num muted>{c.email ?? "—"}</Td>
                      <Td num muted>{c.phone ?? "—"}</Td>
                    </Tr>
                  ))}
                </MiniTable>
                {writable && <ContactForm customerId={customer.id} />}
              </Section>
            ),
          },
          {
            id: "details",
            label: "Details",
            content: (
              <TabColumns
                main={
                  <Section title="Registration">
                    <FieldGrid
                      columns={2}
                      fields={[
                        { label: "Customer code", value: <span className="font-num">{customer.code}</span> },
                        { label: "Legal name", value: customer.legalName ?? "—" },
                        { label: "GSTIN", value: <span className="font-num">{customer.gstin ?? "—"}</span> },
                        { label: "PAN", value: <span className="font-num">{customer.pan ?? "—"}</span> },
                        {
                          label: "Address",
                          value: [customer.addressLine1, customer.city, customer.state, customer.pincode]
                            .filter(Boolean).join(", ") || "—",
                          span: true,
                        },
                        { label: "Created", value: date(customer.createdAt) },
                        { label: "Last updated", value: dateTime(customer.updatedAt) },
                      ]}
                    />
                  </Section>
                }
                aside={
                  <Section title="Commercial terms">
                    <FieldGrid
                      columns={1}
                      fields={[
                        { label: "Credit limit", value: money(customer.creditLimit) },
                        { label: "Outstanding", value: money(customer.outstandingAmt) },
                        { label: "Credit days", value: `${customer.creditDays} days` },
                        { label: "Payment terms", value: customer.paymentTerms ?? "—" },
                        { label: "Account owner", value: customer.owner?.name ?? "Unassigned" },
                      ]}
                    />
                  </Section>
                }
              />
            ),
          },
        ]}
      />
    </div>
  );
}
