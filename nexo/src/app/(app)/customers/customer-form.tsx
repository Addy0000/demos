"use client";

import { INDUSTRY_VALUES } from "@/lib/enums";

import { useActionState } from "react";
import Link from "next/link";
import { createCustomer, updateCustomer, type ActionState } from "./actions";
import { Button, SubmitButton, Input, Select, Field, FormGrid, FormError, FormSuccess } from "@/components/ui/form";
import { titleise } from "@/lib/format";

const STATUSES = ["PROSPECT", "ACTIVE", "ON_HOLD", "DORMANT"];
const INDUSTRIES = INDUSTRY_VALUES;

export type CustomerDefaults = {
  id?: string;
  name?: string; legalName?: string | null; industry?: string; status?: string;
  gstin?: string | null; pan?: string | null; addressLine1?: string | null;
  city?: string | null; state?: string | null; pincode?: string | null;
  creditLimit?: number; creditDays?: number; paymentTerms?: string | null;
};

export function CustomerForm({ defaults = {} }: { defaults?: CustomerDefaults }) {
  const editing = Boolean(defaults.id);
  const action = editing ? updateCustomer.bind(null, defaults.id!) : createCustomer;
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-edge bg-faint px-3">
        <h1 className="flex-1 text-[14px] font-semibold tracking-tight text-ink">
          {editing ? `Edit ${defaults.name}` : "New customer"}
        </h1>
        <Link
          href={editing ? `/customers/${defaults.id}` : "/customers"}
          className="inline-flex h-[26px] items-center rounded px-2.5 text-[12px] text-muted transition-colors duration-150 hover:bg-pastel hover:text-primary"
        >
          Cancel
        </Link>
        <SubmitButton pendingLabel="Saving…">{editing ? "Save changes" : "Create customer"}</SubmitButton>
      </div>

      <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-canvas p-3">
        <div className="mx-auto max-w-3xl space-y-3">
          <FormError message={state.error} />
          <FormSuccess message={state.success} />

          <section className="panel">
            <header className="flex h-[32px] items-center border-b border-edge bg-faint px-3">
              <h2 className="text-[11.5px] font-semibold text-ink">Identity</h2>
            </header>
            <div className="p-3">
              <FormGrid>
                <Field label="Customer name" required span>
                  <Input name="name" required defaultValue={defaults.name ?? ""} placeholder="Suryan Cables Ltd" />
                </Field>
                <Field label="Legal name" hint="If different from the trading name.">
                  <Input name="legalName" defaultValue={defaults.legalName ?? ""} />
                </Field>
                <Field label="Industry" required>
                  <Select name="industry" defaultValue={defaults.industry ?? "WIRE_AND_CABLE"}>
                    {INDUSTRIES.map((i) => (
                      <option key={i} value={i}>{titleise(i)}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Status" required>
                  <Select name="status" defaultValue={defaults.status ?? "PROSPECT"}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{titleise(s)}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="GSTIN">
                  <Input name="gstin" defaultValue={defaults.gstin ?? ""} placeholder="29AACCS1234Q1ZP" />
                </Field>
                <Field label="PAN">
                  <Input name="pan" defaultValue={defaults.pan ?? ""} placeholder="AACCS1234Q" />
                </Field>
              </FormGrid>
            </div>
          </section>

          <section className="panel">
            <header className="flex h-[32px] items-center border-b border-edge bg-faint px-3">
              <h2 className="text-[11.5px] font-semibold text-ink">Address</h2>
            </header>
            <div className="p-3">
              <FormGrid>
                <Field label="Address" span>
                  <Input name="addressLine1" defaultValue={defaults.addressLine1 ?? ""} placeholder="Plot 44, Industrial Estate" />
                </Field>
                <Field label="City">
                  <Input name="city" defaultValue={defaults.city ?? ""} />
                </Field>
                <Field label="State">
                  <Input name="state" defaultValue={defaults.state ?? ""} />
                </Field>
                <Field label="PIN code">
                  <Input name="pincode" defaultValue={defaults.pincode ?? ""} inputMode="numeric" />
                </Field>
              </FormGrid>
            </div>
          </section>

          <section className="panel">
            <header className="flex h-[32px] items-center border-b border-edge bg-faint px-3">
              <h2 className="text-[11.5px] font-semibold text-ink">Commercial terms</h2>
            </header>
            <div className="p-3">
              <FormGrid>
                <Field label="Credit limit (₹)" hint="Zero means no credit extended.">
                  <Input name="creditLimit" type="number" min={0} step={1000} defaultValue={defaults.creditLimit ?? 0} />
                </Field>
                <Field label="Credit days">
                  <Input name="creditDays" type="number" min={0} max={365} defaultValue={defaults.creditDays ?? 30} />
                </Field>
                <Field label="Payment terms" span>
                  <Input name="paymentTerms" defaultValue={defaults.paymentTerms ?? ""} placeholder="45 days from invoice" />
                </Field>
              </FormGrid>
            </div>
          </section>
        </div>
      </div>
    </form>
  );
}
