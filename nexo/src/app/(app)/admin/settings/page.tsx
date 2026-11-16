import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { dateTime, titleise } from "@/lib/format";
import { Section, FieldGrid, MiniTable, Td, Tr } from "@/components/detail/record";
import { Chip } from "@/components/ui/chip";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requirePermission("admin:settings");

  const [counts, recentAudit] = await Promise.all([
    Promise.all([
      prisma.user.count(), prisma.customer.count(), prisma.project.count(),
      prisma.rawMaterial.count(), prisma.vendor.count(), prisma.purchaseOrder.count(),
      prisma.goodsReceipt.count(), prisma.inventoryBatch.count(), prisma.stockMovement.count(),
      prisma.document.count(), prisma.materialPrice.count(),
    ]),
    prisma.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { actor: { select: { name: true } } },
    }),
  ]);

  const [users, customers, projects, materials, vendors, pos, grns, batches, movements, documents, prices] = counts;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-edge bg-faint px-3">
        <h1 className="text-[14px] font-semibold tracking-tight text-ink">Settings</h1>
        <span className="text-[11.5px] text-muted">System configuration and audit trail</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-canvas p-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-3">
            <Section title="Audit trail" hint={`${recentAudit.length} most recent events`} padded={false}>
              <MiniTable
                head={[
                  { label: "When", width: "140px" },
                  { label: "Action", width: "120px" },
                  { label: "Entity", width: "140px" },
                  { label: "Summary" },
                  { label: "Actor", width: "150px" },
                ]}
                empty="Nothing recorded yet. Approvals, price changes and stock postings appear here."
              >
                {recentAudit.map((e) => (
                  <Tr key={e.id}>
                    <Td num muted>{dateTime(e.createdAt)}</Td>
                    <Td>
                      <Chip
                        tone={
                          e.action === "APPROVE" ? "success"
                            : e.action === "REJECT" || e.action === "CANCEL" ? "danger"
                            : e.action === "POST" ? "info"
                            : "neutral"
                        }
                      >
                        {titleise(e.action)}
                      </Chip>
                    </Td>
                    <Td muted>{e.entityType}</Td>
                    <Td>{e.summary}</Td>
                    <Td muted>{e.actor?.name ?? "system"}</Td>
                  </Tr>
                ))}
              </MiniTable>
            </Section>
          </div>

          <div className="flex flex-col gap-3">
            <Section title="Record counts">
              <FieldGrid
                columns={1}
                fields={[
                  { label: "Users", value: <span className="font-num tabular-nums">{users}</span> },
                  { label: "Customers", value: <span className="font-num tabular-nums">{customers}</span> },
                  { label: "Projects", value: <span className="font-num tabular-nums">{projects}</span> },
                  { label: "Raw materials", value: <span className="font-num tabular-nums">{materials}</span> },
                  { label: "Vendors", value: <span className="font-num tabular-nums">{vendors}</span> },
                  { label: "Purchase orders", value: <span className="font-num tabular-nums">{pos}</span> },
                  { label: "Goods receipts", value: <span className="font-num tabular-nums">{grns}</span> },
                  { label: "Inventory batches", value: <span className="font-num tabular-nums">{batches}</span> },
                  { label: "Stock movements", value: <span className="font-num tabular-nums">{movements.toLocaleString("en-IN")}</span> },
                  { label: "Documents", value: <span className="font-num tabular-nums">{documents}</span> },
                  { label: "Price records", value: <span className="font-num tabular-nums">{prices}</span> },
                ]}
              />
            </Section>

            <Section title="Environment">
              <FieldGrid
                columns={1}
                fields={[
                  { label: "Locale", value: "en-IN · ₹ lakh grouping · DD-MM-YYYY" },
                  { label: "Database", value: "PostgreSQL 17 via Prisma" },
                  { label: "Authentication", value: "Credentials, bcrypt, 8-hour JWT session" },
                  { label: "Access model", value: "Role-based, enforced at route and query level" },
                ]}
              />
              <p className="mt-2 border-t border-edge pt-2 text-[11.5px] leading-relaxed text-muted">
                This is a demonstration environment. All customer, vendor, project and pricing records are
                synthetic and must be replaced before the system carries real commercial data.
              </p>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
