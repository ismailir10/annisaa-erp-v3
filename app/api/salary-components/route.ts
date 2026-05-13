import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { createSalaryComponentSchema } from "@/lib/validations/payroll";

// Cache salary components for 1 hour (static data)
export const revalidate = 3600;

export async function GET() {
  const auth = await requirePermission("payroll.view");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const components = await prisma.salaryComponentDef.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(components);
}

export async function POST(req: NextRequest) {
  const { success } = rateLimit(`salary-component-create:${getClientIp(req)}`, 10, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const auth = await requirePermission("payroll.create");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Body harus JSON valid" }, { status: 400 });
  }

  const parsed = createSalaryComponentSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Validasi gagal",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const { code, label, category, calcType, isProRated, sortOrder } = parsed.data;

  const component = await prisma.salaryComponentDef.create({
    data: {
      tenantId: session.tenantId,
      code: code.toLowerCase(),
      label,
      category,
      calcType,
      isProRated: isProRated ?? false,
      sortOrder: sortOrder ?? 0,
    },
  });

  return NextResponse.json(component, { status: 201 });
}
