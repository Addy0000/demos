"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/session";

/**
 * Approve or reject a leave request. Approving marks the days on attendance, so
 * payroll counts them as paid leave rather than absence.
 */
export async function decideLeave(id: string, decision: "APPROVED" | "REJECTED"): Promise<{ ok: boolean; error?: string }> {
  const user = await assertPermission("hr:write").catch(async () => assertPermission("engagement:write"));
  const leave = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!leave) return { ok: false, error: "That request no longer exists." };
  if (leave.status !== "PENDING") return { ok: false, error: "That request has already been decided." };

  await prisma.leaveRequest.update({
    where: { id },
    data: { status: decision, decidedById: user.id, decidedAt: new Date() },
  });

  if (decision === "APPROVED") {
    for (let d = new Date(leave.fromDate); d <= leave.toDate; d = new Date(d.getTime() + 86_400_000)) {
      const day = d.getUTCDay();
      if (day === 0) continue;
      await prisma.attendanceRecord.upsert({
        where: { employeeId_date: { employeeId: leave.employeeId, date: d } },
        update: { status: "LEAVE", checkIn: null, checkOut: null },
        create: { employeeId: leave.employeeId, date: d, status: "LEAVE" },
      });
    }
  }
  revalidatePath("/people/leave");
  revalidatePath("/people/attendance");
  return { ok: true };
}
