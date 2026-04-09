import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json([], { status: 401 });

  const programs = await prisma.program.findMany({
    where: { tenantId: session.tenantId },
    include: { _count: { select: { classSections: true } } },
    orderBy: { code: "asc" },
  });
  return NextResponse.json(programs);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const program = await prisma.program.create({
    data: {
      tenantId: session.tenantId,
      code: body.code?.trim().toUpperCase(),
      name: body.name?.trim(),
      description: body.description?.trim() || null,
      type: body.type ?? "SEMESTER",
      ageMin: body.ageMin ?? null,
      ageMax: body.ageMax ?? null,
    },
  });
  return NextResponse.json(program, { status: 201 });
}
