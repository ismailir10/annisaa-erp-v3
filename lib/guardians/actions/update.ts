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
import type { ScopeGrant } from "@/lib/entities/_types";

export async function updateGuardian(
  id: string,
  input: unknown,
): Promise<ActionResult<Guardian>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };

  // assertScope returns the resolved grant (per spec-time review T4-#1) so
  // we cannot drift between the gate's grant and the SELF-predicate
  // derivation — eliminates the duplicate-grant-ordering footgun.
  let grant: ScopeGrant;
  try {
    grant = assertScope(session, guardianPolicy, "update");
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }

  // Per cycle p2-portal-shell-sidebar SD2 — SELF scope canary. When the
  // role's update grant carries `scope: "SELF"`, add a row-level
  // `userId: session.userId` clause to the precheck `findFirst`; rows
  // belonging to other parents are then indistinguishable from NOT_FOUND
  // for that caller (information-leak posture). ALL grants keep the
  // existing tenant-only precheck. Required by the SELF-on-write contract
  // enforced at `lib/scaffold/__tests__/self-write-contract.test.ts`.
  //
  // Precondition (per spec-time review T4-#2): a parent SELF caller must
  // have a populated `Guardian.userId` matching `session.userId`. The
  // current demo seed (`08-demo-users.ts`) creates the parent User row but
  // does NOT seed a corresponding Guardian.userId-linked row — manual
  // smoke + future Playwright SELF-update specs need a dedicated parent
  // Guardian seed (deferred to `p2-portal-write-widening`). Real-tenant
  // parents acquire `Guardian.userId` only after invitation acceptance.
  const restrictToSelf = grant.scope === "SELF";

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
    where: {
      id,
      tenantId: session.tenantId,
      deletedAt: null,
      // SELF row-level predicate — see note above. Required for SELF-on-write contract.
      ...(restrictToSelf ? { userId: session.userId } : {}),
    },
  });
  if (!before) return { ok: false, error: "NOT_FOUND" };

  const updated = await prisma.$transaction(async (tx) => {
    // Defense-in-depth per spec-time review T4-#3: use the compound-unique
    // `(id, tenantId)` selector so the inner update reinforces tenant
    // isolation even if a future TOCTOU swapped the row between the
    // precheck and this call. The precheck `findFirst` is the primary
    // guard; this is belt-and-braces.
    const row = await tx.guardian.update({
      where: { id_tenantId: { id, tenantId: session.tenantId } },
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
