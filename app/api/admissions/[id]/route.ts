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
      childName: body.childName?.trim() ?? existing.childName,
      childAge: body.childAge?.trim() ?? existing.childAge,
      childGender: body.childGender ?? existing.childGender,
      parentName: body.parentName?.trim() ?? existing.parentName,
      parentPhone: body.parentPhone?.trim() ?? existing.parentPhone,
      parentWhatsapp: body.parentWhatsapp?.trim() ?? existing.parentWhatsapp,
      parentEmail: body.parentEmail?.trim() ?? existing.parentEmail,
      programId: body.programId ?? existing.programId,
      source: body.source ?? existing.source,
      status: body.status ?? existing.status,
      notes: body.notes?.trim() ?? existing.notes,
      followUpDate: body.followUpDate ?? existing.followUpDate,
    },
  });
  return NextResponse.json(admission);
}
