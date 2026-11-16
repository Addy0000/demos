"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ProjectStage, ProjectPriority, DemoStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/session";

export type ActionState = { error?: string; success?: string };

const opt = (v: unknown) => (v === "" || v === undefined || v === null ? undefined : v);

const projectSchema = z.object({
  name: z.string().min(3, "Give the compound a name."),
  application: z.string().min(3, "Describe the application."),
  stage: z.nativeEnum(ProjectStage),
  priority: z.nativeEnum(ProjectPriority),
  customerId: z.string().optional(),
  targetShoreA: z.preprocess(opt, z.coerce.number().int().min(0).max(100).optional()),
  targetSpGravity: z.preprocess(opt, z.coerce.number().min(0).max(3).optional()),
  targetTensileMpa: z.preprocess(opt, z.coerce.number().min(0).optional()),
  targetElongationPct: z.preprocess(opt, z.coerce.number().int().min(0).optional()),
  targetVolumeResist: z.string().optional(),
  targetLoiPct: z.preprocess(opt, z.coerce.number().min(0).max(100).optional()),
  targetTempRating: z.string().optional(),
  standard: z.string().optional(),
  targetPricePerKg: z.preprocess(opt, z.coerce.number().min(0).optional()),
  estimatedVolumeMt: z.preprocess(opt, z.coerce.number().min(0).optional()),
  targetDate: z.string().optional(),
  notes: z.string().optional(),
});

export async function createProject(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission("project:write");

  const parsed = projectSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const { customerId, targetDate, ...rest } = parsed.data;
  const last = await prisma.project.findFirst({ orderBy: { code: "desc" }, select: { code: true } });
  const n = last ? Number(last.code.split("-").pop()) + 1 : 1;

  const created = await prisma.project.create({
    data: {
      ...rest,
      code: `PRJ-${String(n).padStart(4, "0")}`,
      customerId: customerId || null,
      targetDate: targetDate ? new Date(targetDate) : null,
      managerId: user.id,
    },
  });

  // Every project gets a formulation shell so the recipe has somewhere to live.
  await prisma.formulation.create({
    data: { projectId: created.id, version: 1, basis: 100, notes: "Parts per hundred resin." },
  });

  await prisma.auditEvent.create({
    data: {
      entityType: "Project", entityId: created.id, action: "CREATE",
      summary: `Created project ${created.code} — ${created.name}`, actorId: user.id,
    },
  });

  revalidatePath("/projects");
  redirect(`/projects/${created.id}`);
}

export async function updateProject(id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission("project:write");

  const parsed = projectSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const { customerId, targetDate, ...rest } = parsed.data;
  const before = await prisma.project.findUnique({ where: { id }, select: { stage: true } });

  await prisma.project.update({
    where: { id },
    data: {
      ...rest,
      customerId: customerId || null,
      targetDate: targetDate ? new Date(targetDate) : null,
      completedAt: rest.stage === ProjectStage.IN_PRODUCTION ? new Date() : null,
    },
  });

  if (before && before.stage !== rest.stage) {
    await prisma.auditEvent.create({
      data: {
        entityType: "Project", entityId: id, action: "STAGE_CHANGE",
        summary: `Stage moved from ${before.stage} to ${rest.stage}`, actorId: user.id,
      },
    });
  }

  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
  return { success: "Changes saved." };
}

// ── Formulation lines ───────────────────────────────────────────────────────

const lineSchema = z.object({
  projectId: z.string().min(1),
  materialId: z.string().min(1, "Choose a material."),
  phr: z.coerce.number().min(0.001, "phr must be greater than zero."),
  remark: z.string().optional(),
});

export async function addFormulationLine(_prev: ActionState, form: FormData): Promise<ActionState> {
  await assertPermission("project:write");

  const parsed = lineSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the line." };

  const { projectId, ...rest } = parsed.data;

  const formulation = await prisma.formulation.upsert({
    where: { projectId },
    create: { projectId, version: 1, basis: 100 },
    update: {},
    include: { lines: { select: { sequence: true } } },
  });

  const nextSeq = Math.max(-1, ...formulation.lines.map((l) => l.sequence)) + 1;

  try {
    await prisma.formulationLine.create({
      data: { ...rest, formulationId: formulation.id, sequence: nextSeq },
    });
  } catch {
    return { error: "Could not add that component." };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: "Component added." };
}

export async function removeFormulationLine(lineId: string, projectId: string): Promise<void> {
  await assertPermission("project:write");
  await prisma.formulationLine.delete({ where: { id: lineId } });
  revalidatePath(`/projects/${projectId}`);
}

// ── Demos ───────────────────────────────────────────────────────────────────

const demoSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(3, "Give the sample a title."),
  status: z.nativeEnum(DemoStatus),
  quantityKg: z.preprocess(opt, z.coerce.number().min(0).optional()),
  batchRef: z.string().optional(),
  measuredShoreA: z.preprocess(opt, z.coerce.number().int().min(0).max(100).optional()),
  feedback: z.string().optional(),
});

export async function createDemo(_prev: ActionState, form: FormData): Promise<ActionState> {
  await assertPermission("demo:write");

  const parsed = demoSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the sample details." };

  const last = await prisma.productDemo.findFirst({ orderBy: { code: "desc" }, select: { code: true } });
  const n = last ? Number(last.code.split("-").pop()) + 1 : 1;

  const { projectId, status, ...rest } = parsed.data;
  await prisma.productDemo.create({
    data: {
      ...rest,
      projectId,
      status,
      code: `DEMO-${String(n).padStart(5, "0")}`,
      dispatchedOn: status === DemoStatus.DISPATCHED ? new Date() : null,
    },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects/demos");
  return { success: "Sample recorded." };
}

export async function updateDemoStatus(demoId: string, status: DemoStatus): Promise<void> {
  await assertPermission("demo:write");
  const demo = await prisma.productDemo.update({
    where: { id: demoId },
    data: {
      status,
      dispatchedOn: status === DemoStatus.DISPATCHED ? new Date() : undefined,
      feedbackOn: status === DemoStatus.APPROVED || status === DemoStatus.REJECTED ? new Date() : undefined,
    },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${demo.projectId}`);
  revalidatePath("/projects/demos");
}
