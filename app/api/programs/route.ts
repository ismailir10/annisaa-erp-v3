import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// Cache programs for 1 hour (static data)
export const revalidate = 3600;

export async function GET() {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json([], { status: 401 });

  const programs = await prisma.program.findMany({
    where: { tenantId: session.tenantId },
    include: { _count: { select: { classSections: true } } },
    orderBy: { code: "asc" },
  });
  return NextResponse.json(programs);
}

export async function POST(req: NextRequest) {
  const { success } = rateLimit(`create-program:${getClientIp(req)}`, 5, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const program = await prisma.program.create({
    data: {
      tenantId: session.tenantId,
      code: body.code?.trim().toUpperCase(),
      name: body.name?.trim(),
      description: body.description?.trim() || null,
      type: body.type ?? "SEMESTER",
      ageMin: body.ageMin ?? null,
      ageMax: body.ageMax ?? null,
    },
  });
  return NextResponse.json(program, { status: 201 });
}
