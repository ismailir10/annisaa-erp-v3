import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { verifyTenantOwnership } from "@/lib/auth-guard";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { validateBody } from "@/lib/api/validate";
import { updateEmployeeSalarySchema } from "@/lib/validations/employee-salary";
import { recordAudit } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("payroll.view");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { id } = await params;
  if (!(await verifyTenantOwnership("employee", id, session.tenantId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const values = await prisma.employeeSalaryValue.findMany({
    where: { employeeId: id },
    include: { componentDef: true },
    orderBy: { componentDef: { sortOrder: "asc" } },
  });

  return NextResponse.json(values);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { success } = rateLimit(`employee-salary-put:${getClientIp(req)}`, 10, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  // F-05 fix: writes require payroll.edit (semantically "edit salary
  // components"), not payroll.view. payroll.edit is distinct from
  // payroll.create (generate a PayrollRun) so role designers can grant
  // salary edits without unlocking payroll generation.
  const auth = await requirePermission("payroll.edit");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { id } = await params;
  if (!(await verifyTenantOwnership("employee", id, session.tenantId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Body harus JSON valid" }, { status: 400 });
  }

  const result = await validateBody(updateEmployeeSalarySchema, rawBody);
  if (result.error) return result.error;
  const items = result.data;

  // Wrap upserts + audit in a single transaction. recordAudit re-throws when
  // a tx client is provided, so a failed audit aborts the salary write — F-05
  // requires the audit row to land atomically with the data change.
  //
  // The `before` snapshot captures the FULL prior state (all components for
  // this employee), not only those being mutated. An auditor reconstructing
  // intent needs the surrounding context, not just the touched rows.
  await prisma.$transaction(async (tx) => {
    const before = await tx.employeeSalaryValue.findMany({
      where: { employeeId: id },
      select: { componentDefId: true, value: true },
    });

    for (const item of items) {
      await tx.employeeSalaryValue.upsert({
        where: {
          employeeId_componentDefId: {
            employeeId: id,
            componentDefId: item.componentDefId,
          },
        },
        update: { value: item.value },
        create: {
          employeeId: id,
          componentDefId: item.componentDefId,
          value: item.value,
        },
      });
    }

    await recordAudit(
      {
        tenantId: session.tenantId,
        actorId: session.id,
        entity: "EmployeeSalaryValue",
        entityId: id,
        action: "update",
        before: before.map((b) => ({
          componentDefId: b.componentDefId,
          // Decimal columns serialize as strings via Prisma — normalize to
          // number so the audit JSON is comparable with the `after` payload.
          value: Number(b.value),
        })),
        after: items.map((i) => ({
          componentDefId: i.componentDefId,
          value: i.value,
        })),
      },
      tx
    );
  });

  return NextResponse.json({ ok: true });
}
