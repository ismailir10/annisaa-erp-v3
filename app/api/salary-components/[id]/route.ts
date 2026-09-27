import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { validateBody } from "@/lib/api/validate";
import { updateSalaryComponentSchema } from "@/lib/validations/payroll";
import { checkSalaryComponentOrdering } from "@/lib/payroll/salary-component-ordering";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("payroll.create");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { id } = await params;
  // Same check `verifyTenantOwnership("salaryComponentDef", id, tenantId)`
  // makes, inlined so the row it fetches can also seed the ordering check's
  // `resultingRow` below without a second round trip.
  const existing = await prisma.salaryComponentDef.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Body harus JSON valid" }, { status: 400 });
  }

  const result = await validateBody(updateSalaryComponentSchema, rawBody);
  if (result.error) return result.error;
  const body = result.data;

  // Build the update from only the fields the request actually sent, so the
  // `{ isEnabled }`-only toggle body (and any other partial edit) never
  // clobbers fields it didn't mention back to a default.
  const data: Record<string, unknown> = {};
  if (body.label !== undefined) data.label = body.label;
  if (body.category !== undefined) data.category = body.category;
  if (body.calcType !== undefined) data.calcType = body.calcType;
  if (body.isProRated !== undefined) data.isProRated = body.isProRated;
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
  if (body.isEnabled !== undefined) data.isEnabled = body.isEnabled;

  const resultingRow = {
    id: existing.id,
    code: existing.code,
    calcType: (data.calcType as string | undefined) ?? existing.calcType,
    sortOrder: (data.sortOrder as number | undefined) ?? existing.sortOrder,
    isEnabled: (data.isEnabled as boolean | undefined) ?? existing.isEnabled,
  };
  const orderingError = await checkSalaryComponentOrdering(session.tenantId!, resultingRow);
  if (orderingError) {
    return NextResponse.json(
      { error: "Validasi gagal", errors: [orderingError] },
      { status: 400 },
    );
  }

  const component = await prisma.salaryComponentDef.update({
    where: { id },
    data,
  });

  return NextResponse.json(component);
}
