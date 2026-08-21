import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { validateBody } from "@/lib/api/validate";
import { updateStudentSchema } from "@/lib/validations/student";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json(null, { status: 401 });
  if (!isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const student = await prisma.student.findFirst({
    where: { id, tenantId: session.tenantId },
    include: {
      guardians: {
        orderBy: { isPrimary: "desc" },
        include: {
          parent: {
            // The parent's OTHER active links are what make siblings visible
            // on this page: a student shares a brother or sister exactly when
            // they share a guardian. Narrow select — this is a nested list and
            // the detail page only needs a name to render a chip.
            include: {
              guardians: {
                where: { status: "ACTIVE" },
                select: {
                  student: { select: { id: true, name: true, status: true } },
                },
              },
            },
          },
        },
      },
      enrollments: {
        include: {
          classSection: {
            include: {
              // `type` + `academicYear.status` drive the detail header's
              // primary-enrollment pick (a student can hold a school and a
              // day-care enrollment at once, plus stale rows in archived
              // years). The list below still renders every enrollment —
              // the Riwayat Kelas tab is deliberately historical.
              program: { select: { name: true, code: true, type: true } },
              academicYear: { select: { name: true, status: true } },
              campus: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!student) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(student);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { success } = rateLimit(`update-student:${getClientIp(req)}`, 20, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.student.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rawBody = (await req.json()) as Record<string, unknown>;
  const result = await validateBody(updateStudentSchema, rawBody);
  if (result.error) return result.error;
  const body = result.data;

  // Direct PUT to GRADUATED bypasses the /graduate route's graduationDate +
  // enrollment cascade — force callers through the dedicated lifecycle action.
  if (body.status === "GRADUATED" && existing.status !== "GRADUATED") {
    return NextResponse.json(
      {
        error:
          "Gunakan aksi Luluskan untuk meluluskan siswa (mengisi tanggal lulus dan menutup pendaftaran kelas).",
      },
      { status: 400 }
    );
  }

  // Distinguish "not provided" (preserve existing) from "explicitly null" (clear).
  // Zod loses this distinction for nullable+optional fields, so consult raw body.
  const metadataProvided = Object.prototype.hasOwnProperty.call(rawBody, "metadata");
  const metadataValue = metadataProvided
    ? body.metadata == null
      ? null
      : JSON.stringify(body.metadata)
    : existing.metadata;

  const data = {
    name: body.name?.trim(),
    nickname: body.nickname !== undefined ? (body.nickname?.trim() || null) : undefined,
    dateOfBirth: body.dateOfBirth !== undefined ? (body.dateOfBirth || null) : undefined,
    gender: body.gender !== undefined ? (body.gender || null) : undefined,
    address: body.address !== undefined ? (body.address?.trim() || null) : undefined,
    notes: body.notes !== undefined ? (body.notes?.trim() || null) : undefined,
    nis: body.nis !== undefined ? (body.nis?.trim() || null) : undefined,
    nisn: body.nisn !== undefined ? (body.nisn?.trim() || null) : undefined,
    birthPlace: body.birthPlace !== undefined ? (body.birthPlace?.trim() || null) : undefined,
    nik: body.nik !== undefined ? (body.nik?.trim() || null) : undefined,
    kkNumber: body.kkNumber !== undefined ? (body.kkNumber?.trim() || null) : undefined,
    livingWith: body.livingWith !== undefined ? (body.livingWith?.trim() || null) : undefined,
    metadata: metadataValue,
    status: body.status ?? existing.status,
    // Inline edit from Student detail "Riwayat Status" sub-card (T5).
    // Undefined → Prisma skips the column; date stays owned by /withdraw API.
    withdrawalReason: body.withdrawalReason,
  };

  // Cascade: withdraw enrollments + cancel draft/sent invoices when student is
  // deactivated or withdrawn. Run the student.update in the SAME transaction
  // so the status flip and its cascade commit or roll back atomically.
  let student;
  if (body.status === "INACTIVE" || body.status === "WITHDRAWN") {
    student = await prisma.$transaction(async (tx) => {
      await tx.studentEnrollment.updateMany({
        where: { studentId: id, status: "ACTIVE" },
        data: { status: "WITHDRAWN" },
      });
      await tx.invoice.updateMany({
        where: { studentId: id, status: { in: ["DRAFT", "SENT", "PENDING_PAYMENT_LINK"] } },
        data: { status: "CANCELLED" },
      });
      return tx.student.update({ where: { id }, data });
    });
  } else {
    student = await prisma.student.update({ where: { id }, data });
  }

  return NextResponse.json(student);
}
