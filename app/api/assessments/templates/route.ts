import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Cache GET responses for 2 hours — templates change infrequently
export const revalidate = 7200;

export async function GET() {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json([], { status: 401 });

  const templates = await prisma.assessmentTemplate.findMany({
    where: { tenantId: session.tenantId },
    include: {
      program: { select: { name: true } },
      categories: {
        orderBy: { sortOrder: "asc" },
        include: { indicators: { orderBy: { sortOrder: "asc" } } },
      },
      _count: { select: { assessments: true } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  // Verify programId belongs to tenant
  const program = await prisma.program.findFirst({
    where: { id: body.programId, tenantId: session.tenantId },
  });
  if (!program) return NextResponse.json({ error: "Program tidak ditemukan" }, { status: 404 });

  const template = await prisma.assessmentTemplate.create({
    data: {
      tenantId: session.tenantId,
      programId: body.programId,
      name: body.name?.trim(),
      type: body.type ?? "SEMESTER",
      categories: {
        create: (body.categories ?? []).map((cat: { name: string; indicators: string[] }, ci: number) => ({
          name: cat.name,
          sortOrder: ci,
          indicators: {
            create: (cat.indicators ?? []).map((desc: string, ii: number) => ({
              description: desc,
              sortOrder: ii,
            })),
          },
        })),
      },
    },
  });

  revalidatePath("/api/assessments/templates");
  return NextResponse.json(template, { status: 201 });
}
