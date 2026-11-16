"use client";

import { useActionState, useState } from "react";
import { addContact, logActivity, type ActionState } from "../actions";
import { Button, SubmitButton, Input, Select, Field, FormError, FormSuccess } from "@/components/ui/form";
import { IconPlus, IconClose } from "@/components/icons";

const EMPTY: ActionState = {};

export function ContactForm({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(addContact, EMPTY);

  if (!open) {
    return (
      <div className="border-t border-edge p-2">
        <Button variant="ghost" onClick={() => setOpen(true)} className="w-full">
          <IconPlus size={13} />
          Add contact
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-2.5 border-t border-edge bg-faint p-2.5">
      <input type="hidden" name="customerId" value={customerId} />

      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-semibold text-ink">New contact</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Cancel"
          className="grid h-5 w-5 place-items-center rounded text-muted hover:bg-edge hover:text-ink"
        >
          <IconClose size={12} />
        </button>
      </div>

      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <Field label="Name" required>
        <Input name="name" required placeholder="Full name" />
      </Field>
      <Field label="Role">
        <Input name="role" placeholder="Purchase Head" />
      </Field>
      <Field label="Email">
        <Input name="email" type="email" placeholder="name@company.example" />
      </Field>
      <Field label="Phone">
        <Input name="phone" placeholder="+91 98765 43210" />
      </Field>

      <label className="flex items-center gap-2 text-[12px] text-ink">
        <input type="checkbox" name="isPrimary" className="h-[13px] w-[13px] accent-primary" />
        Primary contact
      </label>

      <div className="flex gap-1.5">
        <SubmitButton pendingLabel="Adding…">Add contact</SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}

const KINDS = ["CALL", "EMAIL", "MEETING", "SAMPLE_SENT", "QUOTE_SENT", "COMPLAINT", "NOTE"];

export function ActivityForm({ customerId }: { customerId: string }) {
  const [state, action] = useActionState(logActivity, EMPTY);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2 border-b border-edge bg-faint p-2.5">
      <input type="hidden" name="customerId" value={customerId} />

      <div className="w-[150px]">
        <Field label="Type">
          <Select name="kind" defaultValue="CALL">
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k.charAt(0) + k.slice(1).toLowerCase().replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="min-w-[220px] flex-1">
        <Field label="Subject">
          <Input name="subject" required placeholder="What happened?" />
        </Field>
      </div>

      <SubmitButton pendingLabel="Logging…">Log activity</SubmitButton>

      {state.error && <p className="w-full text-[11.5px] text-danger">{state.error}</p>}
      {state.success && <p className="w-full text-[11.5px] text-success">{state.success}</p>}
    </form>
  );
}
