import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";

// Returns distinct positions from existing employees. Consumed only by admin
// HR pages — gate on hr.view so SCHOOL_ADMIN cannot probe jabatan values.
export async function GET() {
  const auth = await requirePermission("hr.view");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const employees = await prisma.employee.findMany({
    where: { tenantId: session.tenantId },
    select: { jabatan: true },
    distinct: ["jabatan"],
    orderBy: { jabatan: "asc" },
  });

  const positions = employees.map((e) => e.jabatan);
  return NextResponse.json(positions);
}
