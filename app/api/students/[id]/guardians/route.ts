import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { success } = rateLimit(`add-guardian:${getClientIp(req)}`, 10, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: studentId } = await params;

  // Verify student belongs to tenant
  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: session.tenantId },
  });
  if (!student) return NextResponse.json({ error: "Siswa tidak ditemukan" }, { status: 404 });

  const body = await req.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Nama wali wajib diisi" }, { status: 400 });
  }

  const guardian = await prisma.guardian.create({
    data: {
      name: body.name.trim(),
      relationship: body.relationship || "WALI",
      phone: body.phone?.trim() || null,
      email: body.email?.trim() || null,
      whatsapp: body.whatsapp?.trim() || null,
      isPrimary: body.isPrimary ?? false,
      student: { connect: { id: studentId } },
    },
  });

  return NextResponse.json(guardian, { status: 201 });
}
