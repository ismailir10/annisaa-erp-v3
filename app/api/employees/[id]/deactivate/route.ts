import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { invalidateUserCache } from "@/lib/auth";
import { requirePermission } from "@/lib/auth-guards";
import { verifyTenantOwnership } from "@/lib/auth-guard";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { validateBody } from "@/lib/api/validate";
import { employeeStatusReasonSchema } from "@/lib/validations/employee";
import { recordAudit } from "@/lib/audit";
import { mayToggleLinkedLogin } from "@/lib/security/role-escalation";

/**
 * F-13: dedicated employee deactivation endpoint.
 *
 * Replaces the old `PUT { status: "INACTIVE" }` shortcut on
 * `/api/employees/[id]`. The status field was removed from
 * `updateEmployeeSchema` so the PUT handler can no longer flip status —
 * deliberate transitions live here and in `/restore`.
 *
 * Contract:
 *   - Requires `employees.edit`.
 *   - Tenant ownership check via `verifyTenantOwnership`.
 *   - Rate limited (`employee-status:<ip>`).
 *   - Atomic via `$transaction` — `recordAudit(tx)` re-throws so a failed
 *     audit row aborts the status flip.
 *   - Idempotent: deactivating an already-INACTIVE employee returns 200 with
 *     no audit row written (avoids audit noise from retries).
 *   - Optional `{reason: string}` body lands in the audit metadata.
 *   - Revokes login (HR-4): the linked `User` (by `employeeId`) is set INACTIVE
 *     in the same transaction and its cached session is dropped. The acting
 *     admin's own User and SUPER_ADMIN Users are never touched, so an owner
 *     cannot be locked out through an employee record; a SCHOOL_ADMIN User is
 *     only touched when the actor holds `users.edit` (`mayToggleLinkedLogin`,
 *     same authority as the users page). The idempotent path
 *     still syncs the User, which heals employees deactivated before this fix.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { success } = rateLimit(`employee-status:${getClientIp(req)}`, 30, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  const auth = await requirePermission("employees.edit");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { id } = await params;
  if (!(await verifyTenantOwnership("employee", id, session.tenantId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Body is optional — empty body, {}, and {reason:"..."} all valid.
  let rawBody: unknown = {};
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      rawBody = await req.json();
    } catch {
      // Empty/invalid JSON body is fine — treat as no reason supplied.
      rawBody = {};
    }
  }
  const result = await validateBody(employeeStatusReasonSchema, rawBody ?? {});
  if (result.error) return result.error;
  const { reason } = result.data;

  const revokedEmails: string[] = [];
  const updated = await prisma.$transaction(async (tx) => {
    const revokeLogin = async () => {
      const found = await tx.user.findMany({
        where: {
          employeeId: id,
          tenantId: session.tenantId,
          status: "ACTIVE",
          role: { not: "SUPER_ADMIN" },
          id: { not: session.id },
        },
        select: { id: true, email: true, role: true },
      });
      // A SCHOOL_ADMIN login needs `users.edit` to disable (same as the users page).
      const linked = found.filter((u) => mayToggleLinkedLogin(session, u.role));
      if (linked.length === 0) return;
      await tx.user.updateMany({
        where: { id: { in: linked.map((u) => u.id) } },
        data: { status: "INACTIVE" },
      });
      revokedEmails.push(...linked.map((u) => u.email));
    };

    const before = await tx.employee.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!before) {
      // Race: row vanished between ownership check and tx. Surface as 404.
      return null;
    }

    // Idempotency: already INACTIVE → no-op, no audit row.
    if (before.status === "INACTIVE") {
      await revokeLogin();
      return tx.employee.findUnique({ where: { id } });
    }

    const after = await tx.employee.update({
      where: { id },
      data: { status: "INACTIVE" },
    });
    await revokeLogin();

    await recordAudit(
      {
        tenantId: session.tenantId,
        actorId: session.id,
        entity: "Employee",
        entityId: id,
        action: "deactivate",
        before: { status: before.status },
        after: { status: "INACTIVE", reason: reason ?? null },
      },
      tx,
    );

    return after;
  });

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  invalidateUserCache(...revokedEmails);
  revalidateTag("employees-count", { expire: 0 });
  return NextResponse.json(updated);
}
