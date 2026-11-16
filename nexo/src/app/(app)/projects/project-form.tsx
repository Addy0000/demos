"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createProject, updateProject, type ActionState } from "./actions";
import { SubmitButton, Input, Select, Textarea, Field, FormGrid, FormError, FormSuccess } from "@/components/ui/form";
import { titleise } from "@/lib/format";

const STAGES = ["ENQUIRY", "FORMULATION", "LAB_TRIAL", "SAMPLE_WITH_CUSTOMER", "PLANT_TRIAL", "APPROVED", "IN_PRODUCTION", "ON_HOLD", "DROPPED"];
const PRIORITIES = ["CRITICAL", "HIGH", "MODERATE", "LOW", "PLANNING"];

export type ProjectDefaults = {
  id?: string; name?: string; application?: string; stage?: string; priority?: string;
  customerId?: string | null; targetShoreA?: number | null; targetSpGravity?: number | null;
  targetTensileMpa?: number | null; targetElongationPct?: number | null;
  targetVolumeResist?: string | null; targetLoiPct?: number | null; targetTempRating?: string | null;
  standard?: string | null; targetPricePerKg?: number | null; estimatedVolumeMt?: number | null;
  targetDate?: string | null; notes?: string | null;
};

export function ProjectForm({
  defaults = {},
  customers,
}: {
  defaults?: ProjectDefaults;
  customers: { id: string; name: string; code: string }[];
}) {
  const editing = Boolean(defaults.id);
  const action = editing ? updateProject.bind(null, defaults.id!) : createProject;
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-edge bg-faint px-3">
        <h1 className="flex-1 truncate text-[14px] font-semibold tracking-tight text-ink">
          {editing ? `Edit ${defaults.name}` : "New project"}
        </h1>
        <Link
          href={editing ? `/projects/${defaults.id}` : "/projects"}
          className="inline-flex h-[26px] items-center rounded px-2.5 text-[12px] text-muted transition-colors duration-150 hover:bg-pastel hover:text-primary"
        >
          Cancel
        </Link>
        <SubmitButton pendingLabel="Saving…">{editing ? "Save changes" : "Create project"}</SubmitButton>
      </div>

      <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-canvas p-3">
        <div className="mx-auto max-w-3xl space-y-3">
          <FormError message={state.error} />
          <FormSuccess message={state.success} />

          <section className="panel">
            <header className="flex h-[32px] items-center border-b border-edge bg-faint px-3">
              <h2 className="text-[11.5px] font-semibold text-ink">Project</h2>
            </header>
            <div className="p-3">
              <FormGrid>
                <Field label="Compound name" required span>
                  <Input name="name" required defaultValue={defaults.name ?? ""} placeholder="90°C Heat Resistant Insulation" />
                </Field>
                <Field label="Application" required span hint="What the compound is actually used for.">
                  <Input name="application" required defaultValue={defaults.application ?? ""} placeholder="FR-LSH building wire" />
                </Field>
                <Field label="Customer">
                  <Select name="customerId" defaultValue={defaults.customerId ?? ""}>
                    <option value="">No customer yet</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Target date">
                  <Input name="targetDate" type="date" defaultValue={defaults.targetDate ?? ""} />
                </Field>
                <Field label="Stage" required>
                  <Select name="stage" defaultValue={defaults.stage ?? "ENQUIRY"}>
                    {STAGES.map((s) => <option key={s} value={s}>{titleise(s)}</option>)}
                  </Select>
                </Field>
                <Field label="Priority" required>
                  <Select name="priority" defaultValue={defaults.priority ?? "MODERATE"}>
                    {PRIORITIES.map((s) => <option key={s} value={s}>{titleise(s)}</option>)}
                  </Select>
                </Field>
              </FormGrid>
            </div>
          </section>

          <section className="panel">
            <header className="flex h-[32px] items-center gap-2 border-b border-edge bg-faint px-3">
              <h2 className="text-[11.5px] font-semibold text-ink">Target specification</h2>
              <span className="text-[11px] text-muted">Leave blank where the property does not apply</span>
            </header>
            <div className="p-3">
              <FormGrid columns={3}>
                <Field label="Shore A hardness">
                  <Input name="targetShoreA" type="number" min={0} max={100} defaultValue={defaults.targetShoreA ?? ""} />
                </Field>
                <Field label="Specific gravity">
                  <Input name="targetSpGravity" type="number" step="0.001" min={0} max={3} defaultValue={defaults.targetSpGravity ?? ""} />
                </Field>
                <Field label="Tensile (MPa)">
                  <Input name="targetTensileMpa" type="number" step="0.1" min={0} defaultValue={defaults.targetTensileMpa ?? ""} />
                </Field>
                <Field label="Elongation (%)">
                  <Input name="targetElongationPct" type="number" min={0} defaultValue={defaults.targetElongationPct ?? ""} />
                </Field>
                <Field label="LOI (%)">
                  <Input name="targetLoiPct" type="number" step="0.1" min={0} max={100} defaultValue={defaults.targetLoiPct ?? ""} />
                </Field>
                <Field label="Temperature rating">
                  <Input name="targetTempRating" defaultValue={defaults.targetTempRating ?? ""} placeholder="90°C" />
                </Field>
                <Field label="Volume resistivity" span>
                  <Input name="targetVolumeResist" defaultValue={defaults.targetVolumeResist ?? ""} placeholder="1.0 x 10^13 ohm-cm" />
                </Field>
                <Field label="Standard">
                  <Input name="standard" defaultValue={defaults.standard ?? ""} placeholder="IS 5831 Type C" />
                </Field>
              </FormGrid>
            </div>
          </section>

          <section className="panel">
            <header className="flex h-[32px] items-center border-b border-edge bg-faint px-3">
              <h2 className="text-[11.5px] font-semibold text-ink">Commercial</h2>
            </header>
            <div className="p-3">
              <FormGrid>
                <Field label="Target price (₹/kg)">
                  <Input name="targetPricePerKg" type="number" step="0.01" min={0} defaultValue={defaults.targetPricePerKg ?? ""} />
                </Field>
                <Field label="Estimated volume (MT/yr)">
                  <Input name="estimatedVolumeMt" type="number" step="0.1" min={0} defaultValue={defaults.estimatedVolumeMt ?? ""} />
                </Field>
                <Field label="Notes" span>
                  <Textarea name="notes" rows={3} defaultValue={defaults.notes ?? ""} placeholder="Anything the next person picking this up needs to know." />
                </Field>
              </FormGrid>
            </div>
          </section>
        </div>
      </div>
    </form>
  );
}
