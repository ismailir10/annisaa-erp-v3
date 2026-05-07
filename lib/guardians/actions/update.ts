"use server";

// updateGuardian — Server action for Guardian entity update.
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages-guardian-household.md (T1)

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/write";
import { prisma } from "@/lib/db";
import { schema as guardianSchema } from "@/lib/entities/guardian/schema";
import { policy as guardianPolicy } from "@/lib/entities/guardian/policy";
import { AuditAction, type Guardian } from "@/lib/generated/prisma/client";
import { assertScope, type ActionResult } from "@/lib/scaffold/server-action";

export async function updateGuardian(
  id: string,
  input: unknown,
): Promise<ActionResult<Guardian>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };

  try {
    assertScope(session, guardianPolicy, "update");
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }

  // Allow partial updates — admin may PATCH a single field. `.partial()` keeps
  // each field's individual validation (NIK regex, phone regex, email format)
  // but each becomes optional.
  const partialSchema = guardianSchema.partial();
  const parsed = partialSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "INVALID_INPUT",
      field: issue?.path.length ? issue.path.join(".") : undefined,
    };
  }

  // Reject empty-PATCH submits — phantom UPDATE audit row prevention per
  // audit-pii.md §4 (audit must reflect genuine state change). Common trigger:
  // user opens edit, changes nothing, clicks Save.
  if (Object.keys(parsed.data).length === 0) {
    return { ok: false, error: "NO_CHANGES" };
  }

  const before = await prisma.guardian.findFirst({
    where: { id, tenantId: session.tenantId, deletedAt: null },
  });
  if (!before) return { ok: false, error: "NOT_FOUND" };

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.guardian.update({
      where: { id },
      data: parsed.data,
    });
    if (guardianPolicy.auditActions.includes(AuditAction.UPDATE)) {
      await writeAuditLog(
        {
          tenantId: session.tenantId,
          actorUserId: session.userId,
          action: AuditAction.UPDATE,
          resource: guardianPolicy.resource,
          resourceId: id,
          before: before as unknown as Record<string, unknown>,
          after: row as unknown as Record<string, unknown>,
        },
        tx,
      );
    }
    return row;
  });

  revalidatePath("/admin/akademik/wali");
  revalidatePath(`/admin/akademik/wali/${id}`);
  return { ok: true, data: updated };
}
