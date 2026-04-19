import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { updateAdmissionSchema } from "@/lib/validations/admission";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await prisma.admission.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== session.tenantId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = updateAdmissionSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  // Validate status transitions
  const VALID_TRANSITIONS: Record<string, string[]> = {
    INQUIRY: ["VISIT_SCHEDULED", "CANCELLED"],
    VISIT_SCHEDULED: ["VISITED", "CANCELLED"],
    VISITED: ["ADMITTED", "CANCELLED"],
    ADMITTED: ["REGISTERED", "CANCELLED"],
    REGISTERED: ["CANCELLED"],
    CANCELLED: [], // Terminal state
  };

  if (body.status && body.status !== existing.status) {
    const allowed = VALID_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(body.status)) {
      return NextResponse.json({ error: `Tidak bisa mengubah status dari ${existing.status} ke ${body.status}` }, { status: 400 });
    }
  }

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
