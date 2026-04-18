import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { updateProgramSchema } from "@/lib/validations/program";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const existing = await prisma.program.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });

  const parsed = updateProgramSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

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
