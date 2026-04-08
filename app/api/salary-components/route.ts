import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json([], { status: 401 });

  const components = await prisma.salaryComponentDef.findMany({
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
