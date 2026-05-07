"use server";

// updateHousehold — Server action for Household entity update.
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages-guardian-household.md (T2)

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/write";
import { prisma } from "@/lib/db";
import { schema as householdSchema } from "@/lib/entities/household/schema";
import { policy as householdPolicy } from "@/lib/entities/household/policy";
import { AuditAction, type Household } from "@/lib/generated/prisma/client";
import { assertScope, type ActionResult } from "@/lib/scaffold/server-action";

export async function updateHousehold(
  id: string,
  input: unknown,
): Promise<ActionResult<Household>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };

  try {
    assertScope(session, householdPolicy, "update");
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }

  // Allow partial updates — admin may PATCH a single field. `.partial()` keeps
  // each field's individual validation (max-length etc.) but each becomes optional.
  const partialSchema = householdSchema.partial();
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
  // audit-pii.md §4. Common trigger: user opens edit, changes nothing, clicks Save.
  if (Object.keys(parsed.data).length === 0) {
    return { ok: false, error: "NO_CHANGES" };
  }

  const before = await prisma.household.findFirst({
    where: { id, tenantId: session.tenantId, deletedAt: null },
  });
  if (!before) return { ok: false, error: "NOT_FOUND" };

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.household.update({
      where: { id },
      data: parsed.data,
    });
    if (householdPolicy.auditActions.includes(AuditAction.UPDATE)) {
      await writeAuditLog(
        {
          tenantId: session.tenantId,
          actorUserId: session.userId,
          action: AuditAction.UPDATE,
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
