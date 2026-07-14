import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { createFeeComponentSchema } from "@/lib/validations/fee-component";

// Cache fee components for 1 hour (static data)
export const revalidate = 3600;

export async function GET() {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json([], { status: 401 });

  const components = await prisma.feeComponentDef.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(components);
}

export async function POST(req: NextRequest) {
  const { success } = rateLimit(`create-fee-component:${getClientIp(req)}`, 5, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = createFeeComponentSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validasi gagal", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { code, label, category, isRecurring, sortOrder } = parsed.data;

  const component = await prisma.feeComponentDef.create({
    data: { tenantId: session.tenantId, code, label, category, isRecurring, sortOrder },
  });
  return NextResponse.json(component, { status: 201 });
}
