import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await prisma.admission.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== session.tenantId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const admission = await prisma.admission.update({
    where: { id },
    data: {
      status: body.status ?? existing.status,
      notes: body.notes?.trim() ?? existing.notes,
      followUpDate: body.followUpDate ?? existing.followUpDate,
      parentPhone: body.parentPhone?.trim() ?? existing.parentPhone,
      parentWhatsapp: body.parentWhatsapp?.trim() ?? existing.parentWhatsapp,
    },
  });
  return NextResponse.json(admission);
}
