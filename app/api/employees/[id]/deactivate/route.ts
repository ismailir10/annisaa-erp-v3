import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { verifyTenantOwnership } from "@/lib/auth-guard";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { validateBody } from "@/lib/api/validate";
import { employeeStatusReasonSchema } from "@/lib/validations/employee";
import { recordAudit } from "@/lib/audit";

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

  const updated = await prisma.$transaction(async (tx) => {
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
      return tx.employee.findUnique({ where: { id } });
    }

    const after = await tx.employee.update({
      where: { id },
      data: { status: "INACTIVE" },
    });

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

  revalidateTag("employees-count", { expire: 0 });
  return NextResponse.json(updated);
}
