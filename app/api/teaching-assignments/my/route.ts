import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Teacher: get my assigned classes
export async function GET() {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json({error:"Unauthorized"}, { status: 401 });
  if (session.role !== "TEACHER" || !session.employeeId) return NextResponse.json({error:"Forbidden"}, {status:403});

  const assignments = await prisma.teachingAssignment.findMany({
    where: {
      employeeId: session.employeeId,
      classSection: { tenantId: session.tenantId },
    },
    include: {
      classSection: {
        select: {
          id: true,
          name: true,
          capacity: true,
          status: true,
          academicYear: {select:{status:true}},
          program: { select: { name: true, code: true } },
          campus: { select: { name: true } },
          _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
        },
      },
    },
  });

  return NextResponse.json(assignments);
}
