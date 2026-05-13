import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { getTodayInTimezone } from "@/lib/attendance/timezone";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: studentId } = await params;
  const { classSectionId } = await req.json();

  if (!classSectionId) {
    return NextResponse.json({ error: "Kelas wajib dipilih" }, { status: 400 });
  }

  // Verify student belongs to tenant
  const student = await prisma.student.findFirst({ where: { id: studentId, tenantId: session.tenantId } });
  if (!student) return NextResponse.json({ error: "Siswa tidak ditemukan" }, { status: 404 });

  // Check age if student has DOB and program has age limits (pre-validation, before transaction)
  const sectionInfo = await prisma.classSection.findUnique({
    where: { id: classSectionId },
    include: { program: true },
  });
  if (!sectionInfo) return NextResponse.json({ error: "Kelas tidak ditemukan" }, { status: 404 });

  if (student?.dateOfBirth && sectionInfo.program.ageMin) {
    const dob = new Date(student.dateOfBirth);
    const ageInMonths = Math.floor((Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
    if (sectionInfo.program.ageMin && ageInMonths < sectionInfo.program.ageMin) {
      return NextResponse.json({ error: `Usia siswa (${ageInMonths} bulan) di bawah batas minimum program (${sectionInfo.program.ageMin} bulan)` }, { status: 400 });
    }
    if (sectionInfo.program.ageMax && ageInMonths > sectionInfo.program.ageMax) {
      return NextResponse.json({ error: `Usia siswa (${ageInMonths} bulan) di atas batas maksimum program (${sectionInfo.program.ageMax} bulan)` }, { status: 400 });
    }
  }

  // Atomic capacity check + duplicate enrollment guard
  const today = getTodayInTimezone("Asia/Jakarta");
  try {
    const enrollment = await prisma.$transaction(async (tx) => {
      // Check for existing ACTIVE enrollment in any class
      const existingEnrollment = await tx.studentEnrollment.findFirst({
        where: { studentId, status: "ACTIVE" },
      });
      if (existingEnrollment) {
        throw new EnrollError("Siswa sudah terdaftar di kelas lain. Tarik siswa dari kelas sebelumnya terlebih dahulu.");
      }

      // Lock the class section row to prevent concurrent enrollment
      const section = await tx.$queryRaw<Array<{ id: string; capacity: number; active_count: bigint }>>`
        SELECT cs.id, cs.capacity, COUNT(se.id)::int as active_count
        FROM "ClassSection" cs
        LEFT JOIN "StudentEnrollment" se ON se."classSectionId" = cs.id AND se.status = 'ACTIVE'
        WHERE cs.id = ${classSectionId}
        GROUP BY cs.id, cs.capacity
        FOR UPDATE OF cs
      `;
      if (section.length === 0) {
        throw new EnrollError("Kelas tidak ditemukan", 404);
      }
      if (Number(section[0].active_count) >= section[0].capacity) {
        throw new EnrollError(`Kelas penuh (${Number(section[0].active_count)}/${section[0].capacity})`);
      }

      return tx.studentEnrollment.create({
        data: { studentId, classSectionId, enrollDate: today },
      });
    });

    return NextResponse.json(enrollment, { status: 201 });
  } catch (err) {
    if (err instanceof EnrollError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("enroll:", err);
    return NextResponse.json({ error: "Terjadi kesalahan server" }, { status: 500 });
  }
}

class EnrollError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
