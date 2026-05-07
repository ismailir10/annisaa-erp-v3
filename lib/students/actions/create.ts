"use server";

// createStudent — Server action for Student entity create per spec §10A.1
// Akademik > Siswa. Wired into ScaffoldFormPage via the `onSubmit` prop on
// `app/admin/akademik/siswa/new/page.tsx`. Server-only by `"use server"`
// directive at module top.
//
// Pipeline: getSession → assertScope("create") → schema.safeParse →
// prisma.$transaction(create + writeAuditLog) → revalidatePath → return
// ActionResult<Student>. Audit emit gated on policy.auditActions enrolment
// per scaffold.md §6 + audit-pii.md §4 (atomic via shared tx).
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages.md (T4)

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/write";
import { prisma } from "@/lib/db";
import { schema as studentSchema } from "@/lib/entities/student/schema";
import { policy as studentPolicy } from "@/lib/entities/student/policy";
import { AuditAction, type Student } from "@/lib/generated/prisma/client";
import { assertScope, type ActionResult } from "@/lib/scaffold/server-action";

export async function createStudent(input: unknown): Promise<ActionResult<Student>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };

  try {
    assertScope(session, studentPolicy, "create");
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }

  const parsed = studentSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "INVALID_INPUT",
      field: issue?.path.length ? issue.path.join(".") : undefined,
    };
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.student.create({
      data: { ...parsed.data, tenantId: session.tenantId },
    });
    if (studentPolicy.auditActions.includes(AuditAction.CREATE)) {
      await writeAuditLog(
        {
          tenantId: session.tenantId,
          actorUserId: session.userId,
          action: AuditAction.CREATE,
          resource: studentPolicy.resource,
          resourceId: row.id,
          before: null,
          after: row as unknown as Record<string, unknown>,
        },
        tx,
      );
    }
    return row;
  });

  revalidatePath("/admin/akademik/siswa");
  return { ok: true, data: created };
}
