import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  // Verify tenant ownership
  const existing = await prisma.program.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });

  const body = await req.json();
  const program = await prisma.program.update({
    where: { id },
    data: {
      name: body.name?.trim(),
      description: body.description?.trim() || null,
      type: body.type,
      ageMin: body.ageMin,
      ageMax: body.ageMax,
      isActive: body.isActive,
    },
  });
  return NextResponse.json(program);
}
