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

  const email = body.email?.trim() || null;
  const name = body.name.trim();
  const phone = body.phone?.trim() || null;
  const whatsapp = body.whatsapp?.trim() || null;

  // Find or create a Parent record
  let parent;
  if (email) {
    parent = await prisma.parent.upsert({
      where: { tenantId_email: { tenantId: session.tenantId, email } },
      create: { tenantId: session.tenantId, name, email, phone, whatsapp },
      update: { name, phone, whatsapp },
    });
  } else {
    parent = await prisma.parent.create({
      data: { tenantId: session.tenantId, name, phone, whatsapp },
    });
  }

  // Create the StudentGuardian link
  const guardian = await prisma.studentGuardian.create({
    data: {
      studentId,
      parentId: parent.id,
      relationship: body.relationship || "WALI",
      isPrimary: body.isPrimary ?? false,
    },
    include: { parent: true },
  });

  return NextResponse.json(guardian, { status: 201 });
}
