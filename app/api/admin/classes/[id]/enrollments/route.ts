import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { validateBody } from "@/lib/api/validate";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { enrollmentAddSchema } from "@/lib/validations/class";
import { ensureYearWritableForClass } from "@/lib/classes/year-guard";
import {
  CLASS_WRITE_BUDGET,
  CLASS_WRITE_WINDOW_MS,
  isUniqueViolation,
} from "../../_helpers";

// Add a student to a class's roster. The class is identified by the [id] path
// segment (ClassSection.id). Capacity check + duplicate-enrollment guard + the
// ARCHIVED-year guard all run before the create.

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("academic.edit");
  if ("error" in auth) return auth.error;
  const { session } = auth;
  const { id: classId } = await ctx.params;

  const { success } = rateLimit(
    `class-enrollment-add:${getClientIp(req)}`,
    CLASS_WRITE_BUDGET,
    CLASS_WRITE_WINDOW_MS,
  );
  if (!success) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan" },
      { status: 429 },
    );
  }

  const yearGuard = await ensureYearWritableForClass(classId, session.tenantId);
  if (yearGuard instanceof NextResponse) return yearGuard;

  const parsed = await validateBody(enrollmentAddSchema, await req.json());
  if (parsed.error) return parsed.error;
  const { studentId } = parsed.data;

  const classSection = await prisma.classSection.findFirst({
    where: { id: classId, tenantId: session.tenantId },
    select: { id: true, capacity: true, academicYearId: true, name: true },
  });
  if (!classSection) {
    return NextResponse.json(
      { error: "Kelas tidak ditemukan" },
      { status: 404 },
    );
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: session.tenantId },
    select: { id: true, name: true },
  });
  if (!student) {
    return NextResponse.json(
      { error: "Siswa tidak ditemukan." },
      { status: 400 },
    );
  }

  try {
    // Capacity check + create wrapped in a transaction with a Postgres advisory
    // lock keyed on classId. The lock serialises concurrent POSTs for the same
    // class so two parallel requests at capacity-1 cannot both pass the count
    // check and overfill (same pattern as `lib/sessions/reconcile.ts` + the
    // invoice-payment route).
    const today = new Date().toISOString().slice(0, 10);
    const created = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${classId}))`;

      const activeCount = await tx.studentEnrollment.count({
        where: { classSectionId: classId, status: "ACTIVE" },
      });
      if (activeCount >= classSection.capacity) {
        throw new EnrollmentBlocked("CAPACITY_EXCEEDED", {
          message: `Kelas penuh (${activeCount}/${classSection.capacity}). Naikkan kapasitas terlebih dahulu.`,
          status: 422,
        });
      }

      const existingThisYear = await tx.studentEnrollment.findFirst({
        where: {
          studentId,
          status: "ACTIVE",
          classSection: { academicYearId: classSection.academicYearId },
        },
        select: { id: true, classSectionId: true },
      });
      if (existingThisYear) {
        throw new EnrollmentBlocked("ALREADY_ENROLLED", {
          message:
            "Siswa sudah terdaftar di kelas lain pada tahun ajaran ini.",
          status: 409,
          extra: { existingClassSectionId: existingThisYear.classSectionId },
        });
      }

      return tx.studentEnrollment.create({
        data: {
          studentId,
          classSectionId: classId,
          enrollDate: today,
          status: "ACTIVE",
        },
        select: {
          id: true,
          enrollDate: true,
          status: true,
          student: { select: { id: true, name: true, nis: true } },
        },
      });
    });

    await recordAudit({
      tenantId: session.tenantId,
      actorId: session.id,
      entity: "StudentEnrollment",
      entityId: created.id,
      action: "class.enrollment.add",
      after: {
        studentId,
        classSectionId: classId,
        className: classSection.name,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err instanceof EnrollmentBlocked) {
      return NextResponse.json(
        { error: err.detail.message, code: err.code, ...(err.detail.extra ?? {}) },
        { status: err.detail.status },
      );
    }
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        {
          error: "Siswa sudah terdaftar di kelas ini.",
          code: "ALREADY_ENROLLED",
        },
        { status: 409 },
      );
    }
    throw err;
  }
}

class EnrollmentBlocked extends Error {
  constructor(
    public readonly code: "CAPACITY_EXCEEDED" | "ALREADY_ENROLLED",
    public readonly detail: {
      message: string;
      status: number;
      extra?: Record<string, unknown>;
    },
  ) {
    super(detail.message);
    this.name = "EnrollmentBlocked";
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("academic.edit");
  if ("error" in auth) return auth.error;
  const { session } = auth;
  const { id: classId } = await ctx.params;

  const { success } = rateLimit(
    `class-enrollment-remove:${getClientIp(req)}`,
    CLASS_WRITE_BUDGET,
    CLASS_WRITE_WINDOW_MS,
  );
  if (!success) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan" },
      { status: 429 },
    );
  }

  const yearGuard = await ensureYearWritableForClass(classId, session.tenantId);
  if (yearGuard instanceof NextResponse) return yearGuard;

  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get("studentId");
  if (!studentId) {
    return NextResponse.json(
      { error: "studentId wajib disediakan." },
      { status: 400 },
    );
  }

  // Tenant scope is intrinsic — both the class and the student are filtered.
  const enrollment = await prisma.studentEnrollment.findFirst({
    where: {
      studentId,
      classSectionId: classId,
      status: "ACTIVE",
      classSection: { tenantId: session.tenantId },
    },
    select: { id: true, studentId: true },
  });
  if (!enrollment) {
    return NextResponse.json(
      { error: "Pendaftaran tidak ditemukan." },
      { status: 404 },
    );
  }

  await prisma.studentEnrollment.update({
    where: { id: enrollment.id },
    data: { status: "WITHDRAWN" },
  });

  await recordAudit({
    tenantId: session.tenantId,
    actorId: session.id,
    entity: "StudentEnrollment",
    entityId: enrollment.id,
    action: "class.enrollment.remove",
    before: { studentId, classSectionId: classId, status: "ACTIVE" },
    after: { status: "WITHDRAWN" },
  });

  return NextResponse.json({ ok: true });
}
