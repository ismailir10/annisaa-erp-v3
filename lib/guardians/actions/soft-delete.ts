"use server";

// softDeleteGuardian — Sets `deletedAt = now()` + emits SOFT_DELETE audit row.
// Audit→timeline bridge in writeAuditLog auto-emits the corresponding
// TimelineEvent per .claude/standards/timeline.md (when registered).
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages-guardian-household.md (T1)

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/write";
import { prisma } from "@/lib/db";
import { policy as guardianPolicy } from "@/lib/entities/guardian/policy";
import { AuditAction, type Guardian } from "@/lib/generated/prisma/client";
import { assertScope, type ActionResult } from "@/lib/scaffold/server-action";

export async function softDeleteGuardian(id: string): Promise<ActionResult<Guardian>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };

  try {
    assertScope(session, guardianPolicy, "soft_delete");
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }

  const before = await prisma.guardian.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!before) return { ok: false, error: "NOT_FOUND" };
  if (before.deletedAt) return { ok: false, error: "ALREADY_DELETED" };

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.guardian.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    if (guardianPolicy.auditActions.includes(AuditAction.SOFT_DELETE)) {
      await writeAuditLog(
        {
          tenantId: session.tenantId,
          actorUserId: session.userId,
          action: AuditAction.SOFT_DELETE,
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
