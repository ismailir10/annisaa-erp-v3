"use server";

// updateStudent — Server action for Student entity update.
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages.md (T4)

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/write";
import { prisma } from "@/lib/db";
import { schema as studentSchema } from "@/lib/entities/student/schema";
import { policy as studentPolicy } from "@/lib/entities/student/policy";
import { AuditAction, type Student } from "@/lib/generated/prisma/client";
import { assertScope, type ActionResult } from "@/lib/scaffold/server-action";

export async function updateStudent(
  id: string,
  input: unknown,
): Promise<ActionResult<Student>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };

  try {
    assertScope(session, studentPolicy, "update");
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }

  // Allow partial updates — admin may PATCH a single field. `.partial()` keeps
  // each field's individual validation (NIK regex etc.) but each becomes optional.
  const partialSchema = studentSchema.partial();
  const parsed = partialSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "INVALID_INPUT",
      field: issue?.path.length ? issue.path.join(".") : undefined,
    };
  }

  // Reject empty-PATCH submits. `partial()` accepts `{}` as valid input, but
  // running it through prisma.student.update would write zero columns AND
  // emit a phantom UPDATE audit row with before === after — which pollutes
  // the audit log per audit-pii.md §4 (audit must reflect genuine state
  // change). Common trigger: user opens edit, changes nothing, clicks Save.
  if (Object.keys(parsed.data).length === 0) {
    return { ok: false, error: "NO_CHANGES" };
  }

  const before = await prisma.student.findFirst({
    where: { id, tenantId: session.tenantId, deletedAt: null },
  });
  if (!before) return { ok: false, error: "NOT_FOUND" };

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.student.update({
      where: { id },
      data: parsed.data,
    });
    if (studentPolicy.auditActions.includes(AuditAction.UPDATE)) {
      await writeAuditLog(
        {
          tenantId: session.tenantId,
          actorUserId: session.userId,
          action: AuditAction.UPDATE,
          resource: studentPolicy.resource,
          resourceId: id,
          before: before as unknown as Record<string, unknown>,
          after: row as unknown as Record<string, unknown>,
        },
        tx,
      );
    }
    return row;
  });

  revalidatePath("/admin/akademik/siswa");
  revalidatePath(`/admin/akademik/siswa/${id}`);
  return { ok: true, data: updated };
}
