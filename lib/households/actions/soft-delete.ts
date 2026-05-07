"use server";

// softDeleteHousehold — Sets `deletedAt = now()` + emits SOFT_DELETE audit row.
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages-guardian-household.md (T2)

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/write";
import { prisma } from "@/lib/db";
import { policy as householdPolicy } from "@/lib/entities/household/policy";
import { AuditAction, type Household } from "@/lib/generated/prisma/client";
import { assertScope, type ActionResult } from "@/lib/scaffold/server-action";

export async function softDeleteHousehold(id: string): Promise<ActionResult<Household>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };

  try {
    assertScope(session, householdPolicy, "soft_delete");
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }

  const before = await prisma.household.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!before) return { ok: false, error: "NOT_FOUND" };
  if (before.deletedAt) return { ok: false, error: "ALREADY_DELETED" };

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.household.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    if (householdPolicy.auditActions.includes(AuditAction.SOFT_DELETE)) {
      await writeAuditLog(
        {
          tenantId: session.tenantId,
          actorUserId: session.userId,
          action: AuditAction.SOFT_DELETE,
          resource: householdPolicy.resource,
          resourceId: id,
          before: before as unknown as Record<string, unknown>,
          after: row as unknown as Record<string, unknown>,
        },
        tx,
      );
    }
    return row;
  });

  revalidatePath("/admin/akademik/keluarga");
  revalidatePath(`/admin/akademik/keluarga/${id}`);
  return { ok: true, data: updated };
}
