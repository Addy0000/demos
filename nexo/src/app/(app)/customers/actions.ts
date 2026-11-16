"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CustomerStatus, Industry, ActivityKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/session";

export type ActionState = { error?: string; success?: string };

const customerSchema = z.object({
  name: z.string().min(2, "Enter the customer's name."),
  legalName: z.string().optional(),
  industry: z.nativeEnum(Industry),
  status: z.nativeEnum(CustomerStatus),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  addressLine1: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  creditLimit: z.coerce.number().min(0).default(0),
  creditDays: z.coerce.number().int().min(0).max(365).default(30),
  paymentTerms: z.string().optional(),
});

function nextCode(last: string | undefined, prefix: string, width = 4) {
  const n = last ? Number(last.split("-").pop()) + 1 : 1;
  return `${prefix}-${String(n).padStart(width, "0")}`;
}

export async function createCustomer(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission("customer:write");

  const parsed = customerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const last = await prisma.customer.findFirst({ orderBy: { code: "desc" }, select: { code: true } });

  let created;
  try {
    created = await prisma.customer.create({
      data: { ...parsed.data, code: nextCode(last?.code, "CUST"), ownerId: user.id },
    });
  } catch {
    return { error: "Could not save this customer. A record with that code may already exist." };
  }

  await prisma.auditEvent.create({
    data: {
      entityType: "Customer", entityId: created.id, action: "CREATE",
      summary: `Created customer ${created.code} — ${created.name}`, actorId: user.id,
    },
  });

  revalidatePath("/customers");
  redirect(`/customers/${created.id}`);
}

export async function updateCustomer(id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission("customer:write");

  const parsed = customerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  await prisma.customer.update({ where: { id }, data: parsed.data });
  await prisma.auditEvent.create({
    data: {
      entityType: "Customer", entityId: id, action: "UPDATE",
      summary: `Updated customer ${parsed.data.name}`, actorId: user.id,
    },
  });

  revalidatePath(`/customers/${id}`);
  revalidatePath("/customers");
  return { success: "Changes saved." };
}

const contactSchema = z.object({
  customerId: z.string().min(1),
  name: z.string().min(2, "Enter the contact's name."),
  role: z.string().optional(),
  email: z.string().email("Enter a valid email address.").optional().or(z.literal("")),
  phone: z.string().optional(),
  isPrimary: z.coerce.boolean().default(false),
});

export async function addContact(_prev: ActionState, form: FormData): Promise<ActionState> {
  await assertPermission("customer:write");

  const raw = Object.fromEntries(form);
  const parsed = contactSchema.safeParse({ ...raw, isPrimary: raw.isPrimary === "on" });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the contact details." };
  }

  const { customerId, isPrimary, email, ...rest } = parsed.data;

  // Only one primary contact per customer.
  if (isPrimary) {
    await prisma.customerContact.updateMany({ where: { customerId }, data: { isPrimary: false } });
  }

  await prisma.customerContact.create({
    data: { ...rest, email: email || null, customerId, isPrimary },
  });

  revalidatePath(`/customers/${customerId}`);
  return { success: "Contact added." };
}

export async function deleteContact(id: string, customerId: string): Promise<void> {
  await assertPermission("customer:write");
  await prisma.customerContact.delete({ where: { id } });
  revalidatePath(`/customers/${customerId}`);
}

const activitySchema = z.object({
  customerId: z.string().min(1),
  kind: z.nativeEnum(ActivityKind),
  subject: z.string().min(2, "Enter a short subject line."),
  body: z.string().optional(),
});

export async function logActivity(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission("customer:write");

  const parsed = activitySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the activity details." };
  }

  await prisma.customerActivity.create({ data: { ...parsed.data, userId: user.id } });
  revalidatePath(`/customers/${parsed.data.customerId}`);
  revalidatePath("/customers/activity");
  return { success: "Activity logged." };
}
