"use server";

// restoreStudent — Clears `deletedAt` + emits RESTORE audit row. Refuses if
// not currently soft-deleted (idempotent fail-closed).
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages.md (T4)

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/write";
import { prisma } from "@/lib/db";
import { policy as studentPolicy } from "@/lib/entities/student/policy";
import { AuditAction, type Student } from "@/lib/generated/prisma/client";
import { assertScope, type ActionResult } from "@/lib/scaffold/server-action";

export async function restoreStudent(id: string): Promise<ActionResult<Student>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };

  try {
    assertScope(session, studentPolicy, "restore");
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }

  const before = await prisma.student.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!before) return { ok: false, error: "NOT_FOUND" };
  if (!before.deletedAt) return { ok: false, error: "NOT_DELETED" };

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.student.update({
      where: { id },
      data: { deletedAt: null },
    });
    if (studentPolicy.auditActions.includes(AuditAction.RESTORE)) {
      await writeAuditLog(
        {
          tenantId: session.tenantId,
          actorUserId: session.userId,
          action: AuditAction.RESTORE,
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
