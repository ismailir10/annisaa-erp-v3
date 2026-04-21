import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { updateEnrollmentSchema } from "@/lib/validations/enrollment";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { success } = rateLimit(`enrollment-edit:${getClientIp(req)}`, 10, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = updateEnrollmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input tidak valid" }, { status: 400 });
  }

  // Verify tenant ownership via student
  const existing = await prisma.studentEnrollment.findFirst({
    where: { id, student: { tenantId: session.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Pendaftaran tidak ditemukan" }, { status: 404 });

  const updated = await prisma.studentEnrollment.update({
    where: { id },
    data: parsed.data,
    include: {
      student: { select: { name: true } },
      classSection: { select: { name: true } },
    },
  });

  return NextResponse.json(updated);
}
