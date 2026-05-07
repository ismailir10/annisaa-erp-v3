"use server";

// createGuardian — Server action for Guardian entity create per spec §10A.1
// Akademik > Wali. Wired into ScaffoldFormPage via the `onSubmit` prop on
// `app/admin/akademik/wali/new/page.tsx`. Server-only by `"use server"`
// directive at module top.
//
// Pipeline: getSession → assertScope("create") → schema.safeParse →
// prisma.$transaction(create + writeAuditLog) → revalidatePath → return
// ActionResult<Guardian>. Audit emit gated on policy.auditActions enrolment
// per scaffold.md §6 + audit-pii.md §4 (atomic via shared tx).
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages-guardian-household.md (T1)

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/write";
import { prisma } from "@/lib/db";
import { schema as guardianSchema } from "@/lib/entities/guardian/schema";
import { policy as guardianPolicy } from "@/lib/entities/guardian/policy";
import { AuditAction, type Guardian } from "@/lib/generated/prisma/client";
import { assertScope, type ActionResult } from "@/lib/scaffold/server-action";

export async function createGuardian(input: unknown): Promise<ActionResult<Guardian>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };

  try {
    assertScope(session, guardianPolicy, "create");
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }

  const parsed = guardianSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "INVALID_INPUT",
      field: issue?.path.length ? issue.path.join(".") : undefined,
    };
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.guardian.create({
      data: { ...parsed.data, tenantId: session.tenantId },
    });
    if (guardianPolicy.auditActions.includes(AuditAction.CREATE)) {
      await writeAuditLog(
        {
          tenantId: session.tenantId,
          actorUserId: session.userId,
          action: AuditAction.CREATE,
          resource: guardianPolicy.resource,
          resourceId: row.id,
          before: null,
          after: row as unknown as Record<string, unknown>,
        },
        tx,
      );
    }
    return row;
  });

  revalidatePath("/admin/akademik/wali");
  return { ok: true, data: created };
}
