import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

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
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  if (!body.code?.trim() || !body.label?.trim()) {
    return NextResponse.json({ error: "Kode dan label wajib diisi" }, { status: 400 });
  }

  const component = await prisma.feeComponentDef.create({
    data: {
      tenantId: session.tenantId,
      code: body.code.trim().toLowerCase(),
      label: body.label.trim(),
      category: body.category ?? "TUITION",
      isRecurring: body.isRecurring ?? true,
      sortOrder: body.sortOrder ?? 0,
    },
  });
  return NextResponse.json(component, { status: 201 });
}
