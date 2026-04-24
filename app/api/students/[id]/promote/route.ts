import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { success } = rateLimit(`promote-student:${getClientIp(req)}`, 5, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: studentId } = await params;
  const { targetClassSectionId, notes } = await req.json();

  if (!targetClassSectionId) {
    return NextResponse.json({ error: "Kelas tujuan wajib dipilih" }, { status: 400 });
  }

  // Verify student belongs to tenant
  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: session.tenantId },
  });
  if (!student) {
    return NextResponse.json({ error: "Siswa tidak ditemukan" }, { status: 404 });
  }

  // Find current ACTIVE enrollment
  const currentEnrollment = await prisma.studentEnrollment.findFirst({
    where: { studentId, status: "ACTIVE" },
  });
  if (!currentEnrollment) {
    return NextResponse.json({ error: "Siswa tidak memiliki enrollment aktif" }, { status: 400 });
  }

  // Tenant check on target (the capacity check itself is locked inside the
  // transaction below — mirror of the enroll route pattern).
  const targetExists = await prisma.classSection.findFirst({
    where: { id: targetClassSectionId, tenantId: session.tenantId },
    select: { id: true },
  });
  if (!targetExists) {
    return NextResponse.json({ error: "Kelas tujuan tidak ditemukan" }, { status: 404 });
  }

  const today = new Date().toISOString().split("T")[0];

  // Transaction: lock target section row, re-check capacity, graduate old
  // enrollment, create/upsert new one. SELECT … FOR UPDATE prevents two
  // concurrent promotes from both seeing "one seat free" and overflowing.
  try {
    const newEnrollment = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string; capacity: number; active_count: bigint }>
      >`
        SELECT cs.id, cs.capacity, COUNT(se.id)::int AS active_count
        FROM "ClassSection" cs
        LEFT JOIN "StudentEnrollment" se
          ON se."classSectionId" = cs.id AND se.status = 'ACTIVE'
        WHERE cs.id = ${targetClassSectionId}
        GROUP BY cs.id, cs.capacity
        FOR UPDATE OF cs
      `;
      if (rows.length === 0) {
        throw new PromoteError("Kelas tujuan tidak ditemukan", 404);
      }
      const activeCount = Number(rows[0].active_count);
      if (activeCount >= rows[0].capacity) {
        throw new PromoteError(
          `Kelas tujuan penuh (${activeCount}/${rows[0].capacity})`,
        );
      }

      await tx.studentEnrollment.update({
        where: { id: currentEnrollment.id },
        data: { status: "GRADUATED", notes: notes || undefined },
      });

      return tx.studentEnrollment.upsert({
        where: { studentId_classSectionId: { studentId, classSectionId: targetClassSectionId } },
        create: {
          studentId,
          classSectionId: targetClassSectionId,
          enrollDate: today,
          status: "ACTIVE",
          notes: notes || null,
        },
        update: {
          status: "ACTIVE",
          enrollDate: today,
          notes: notes || null,
        },
        include: {
          classSection: { select: { id: true, name: true } },
        },
      });
    });

    return NextResponse.json(newEnrollment, { status: 201 });
  } catch (err) {
    if (err instanceof PromoteError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("promote:", err);
    return NextResponse.json({ error: "Terjadi kesalahan server" }, { status: 500 });
  }
}

class PromoteError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
