import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { backfillSessionTeacher } from "@/lib/sessions/teacher-backfill";

// Cache GET responses for 1 hour — assignments change when teachers are reassigned
export const revalidate = 3600;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json([], { status: 401 });

  const { searchParams } = new URL(req.url);
  const classSectionId = searchParams.get("classSectionId");
  const employeeId = searchParams.get("employeeId");

  const where: Record<string, unknown> = {
    employee: { tenantId: session.tenantId },
  };
  if (classSectionId) where.classSectionId = classSectionId;
  if (employeeId) where.employeeId = employeeId;

  const assignments = await prisma.teachingAssignment.findMany({
    where,
    include: {
      employee: { select: { id: true, nama: true, kode: true, jabatan: true } },
      classSection: {
        select: { id: true, name: true, program: { select: { name: true } }, campus: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(assignments);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { employeeId, classSectionId, role } = await req.json();
  if (!employeeId || !classSectionId) {
    return NextResponse.json({ error: "Guru dan kelas wajib dipilih" }, { status: 400 });
  }

  // Cross-tenant FK check — unique constraint on (employeeId, classSectionId)
  // only blocks duplicates within a tenant. Without this check, an admin in
  // Tenant A could link a Tenant A employee to a Tenant B class (or vice
  // versa) simply by POSTing cross-tenant IDs from a crafted client.
  const [employee, classSection] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: employeeId, tenantId: session.tenantId },
      select: { id: true },
    }),
    prisma.classSection.findFirst({
      where: { id: classSectionId, tenantId: session.tenantId },
      select: { id: true },
    }),
  ]);
  if (!employee || !classSection) {
    return NextResponse.json(
      { error: "Guru atau kelas tidak ditemukan di tenant Anda" },
      { status: 403 },
    );
  }

  // Check for duplicate
  const existing = await prisma.teachingAssignment.findUnique({
    where: { employeeId_classSectionId: { employeeId, classSectionId } },
  });
  if (existing) {
    return NextResponse.json({ error: "Guru sudah ditugaskan ke kelas ini" }, { status: 400 });
  }

  const assignment = await prisma.teachingAssignment.create({
    data: { employeeId, classSectionId, role: role ?? "HOMEROOM" },
  });

  // A new HOMEROOM assignment becomes the section's effective homeroom — push
  // it onto the section's future ClassSession rows (targeted backfill, not a
  // full reconcile). The create above has already committed; a backfill
  // failure is logged but never rolls back the assignment — the backfill is
  // re-runnable and the assignment is independently valid.
  let reconcileWarning: string | undefined;
  if ((role ?? "HOMEROOM") === "HOMEROOM") {
    try {
      await backfillSessionTeacher(classSectionId, session.tenantId);
    } catch (err) {
      console.error(
        `[teaching-assignments POST] backfillSessionTeacher failed for section ${classSectionId}:`,
        err,
      );
      reconcileWarning = "Guru sesi kelas akan diperbarui otomatis.";
    }
  }

  revalidatePath("/api/teaching-assignments");
  return NextResponse.json(
    reconcileWarning ? { ...assignment, reconcileWarning } : assignment,
    { status: 201 },
  );
}
