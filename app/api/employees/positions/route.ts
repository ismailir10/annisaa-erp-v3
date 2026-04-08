import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Returns distinct positions from existing employees
export async function GET() {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json([], { status: 401 });

  const employees = await prisma.employee.findMany({
    where: { tenantId: session.tenantId },
    select: { jabatan: true },
    distinct: ["jabatan"],
    orderBy: { jabatan: "asc" },
  });

  const positions = employees.map((e) => e.jabatan);
  return NextResponse.json(positions);
}
