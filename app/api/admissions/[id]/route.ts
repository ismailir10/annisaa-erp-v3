import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { updateAdmissionSchema } from "@/lib/validations/admission";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// Allowed status transitions for the Admission state machine.
// Reflects spec docs/superpowers/specs/2026-05-12-admission-student-domain-design.md §2.1.
// Pack 1 (foundation) aligns the enum + minimal guard surface; APPLIED/PAID transition
// guards (file completeness, invoice paid) are gated by route handlers added in Pack 4.
// Terminal states (REGISTERED, CANCELLED) have no outgoing transitions.
const VALID_TRANSITIONS: Record<string, string[]> = {
  INQUIRY: ["VISITED", "CANCELLED"],
  VISITED: ["APPLIED", "CANCELLED"],
  APPLIED: ["PAID", "CANCELLED"],
  PAID: ["ADMITTED", "CANCELLED"],
  ADMITTED: ["REGISTERED", "CANCELLED"],
  REGISTERED: [],
  CANCELLED: [],
};

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { success } = rateLimit(`update-admission:${getClientIp(req)}`, 20, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

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

  if (body.status && body.status !== existing.status) {
    const allowed = VALID_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status transition from ${existing.status} to ${body.status}` },
        { status: 400 },
      );
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
