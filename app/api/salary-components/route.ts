import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

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

  const body = await req.json();
  const { code, label, category, calcType, isProRated, sortOrder } = body;

  if (!code?.trim() || !label?.trim() || !category || !calcType) {
    return NextResponse.json({ error: "Code, label, category, and calcType required" }, { status: 400 });
  }

  const component = await prisma.salaryComponentDef.create({
    data: {
      tenantId: session.tenantId,
      code: code.trim().toLowerCase(),
      label: label.trim(),
      category,
      calcType,
      isProRated: isProRated ?? false,
      sortOrder: sortOrder ?? 0,
    },
  });

  return NextResponse.json(component, { status: 201 });
}
