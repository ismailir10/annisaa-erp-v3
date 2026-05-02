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
 * F-13: dedicated employee restore (re-activation) endpoint.
 *
 * Symmetrical to `/deactivate` — see that file's comment for the broader
 * contract. The previous `PUT { status: "ACTIVE" }` path silently
 * re-activated through `updateEmployeeSchema`; that field is removed and
 * deliberate re-activation now lands here.
 *
 * Contract mirrors deactivate:
 *   - Requires `employees.edit`.
 *   - Tenant ownership + rate limit + atomic audit.
 *   - Idempotent: restoring an already-ACTIVE employee is a 200 no-op.
 *   - Optional `{reason: string}` carried into audit metadata.
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

  let rawBody: unknown = {};
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      rawBody = await req.json();
    } catch {
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
    if (!before) return null;

    if (before.status === "ACTIVE") {
      return tx.employee.findUnique({ where: { id } });
    }

    const after = await tx.employee.update({
      where: { id },
      data: { status: "ACTIVE" },
    });

    await recordAudit(
      {
        tenantId: session.tenantId,
        actorId: session.id,
        entity: "Employee",
        entityId: id,
        action: "restore",
        before: { status: before.status },
        after: { status: "ACTIVE", reason: reason ?? null },
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
