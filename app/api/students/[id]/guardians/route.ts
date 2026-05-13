import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { createGuardianSchema } from "@/lib/validations/guardian";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { success } = rateLimit(`add-guardian:${getClientIp(req)}`, 10, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: studentId } = await params;

  // Verify student belongs to tenant
  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: session.tenantId },
  });
  if (!student) return NextResponse.json({ error: "Siswa tidak ditemukan" }, { status: 404 });

  const raw = await req.json();
  const parsed = createGuardianSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input tidak valid" },
      { status: 400 }
    );
  }

  const {
    name, email = null, phone = null, whatsapp = null,
    relationship, isPrimary,
    parentNik = null, education = null, occupation = null,
    employer = null, employerAddress = null, employerCity = null, incomeRange = null,
  } = parsed.data;

  // Validate email doesn't collide with employee/admin
  if (email) {
    const emailCollision = await prisma.employee.findFirst({ where: { email, tenantId: session.tenantId } });
    if (emailCollision) {
      return NextResponse.json({ error: "Email ini sudah digunakan oleh karyawan. Gunakan email lain untuk orang tua." }, { status: 400 });
    }
  }

  // Find or create a Parent record
  let parent;
  if (email) {
    parent = await prisma.parent.upsert({
      where: { tenantId_email: { tenantId: session.tenantId, email } },
      create: { tenantId: session.tenantId, name, email, phone, whatsapp, nik: parentNik, education, occupation, employer, employerAddress, employerCity, incomeRange },
      update: { name, phone, whatsapp, nik: parentNik, education, occupation, employer, employerAddress, employerCity, incomeRange },
    });
  } else {
    parent = await prisma.parent.create({
      data: { tenantId: session.tenantId, name, phone, whatsapp, nik: parentNik, education, occupation, employer, employerAddress, employerCity, incomeRange },
    });
  }

  // FIND-010: auto-default isPrimary=true when this is the student's first
  // active guardian. The Zod schema leaves isPrimary optional and the API
  // owns the default because it needs to count siblings, not a static value.
  const priorGuardianCount = await prisma.studentGuardian.count({
    where: { studentId, status: "ACTIVE" },
  });
  const resolvedIsPrimary = isPrimary ?? priorGuardianCount === 0;

  // Create the StudentGuardian link
  const guardian = await prisma.studentGuardian.create({
    data: {
      studentId,
      parentId: parent.id,
      relationship,
      isPrimary: resolvedIsPrimary,
    },
    include: { parent: true },
  });

  return NextResponse.json(guardian, { status: 201 });
}
