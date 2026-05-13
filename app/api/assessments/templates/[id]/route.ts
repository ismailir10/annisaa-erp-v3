import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { updateAssessmentTemplateSchema } from "@/lib/validations/assessment-template";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const template = await prisma.assessmentTemplate.findFirst({
    where: { id, tenantId: session.tenantId },
    include: {
      program: { select: { name: true } },
      categories: {
        orderBy: { sortOrder: "asc" },
        include: { indicators: { orderBy: { sortOrder: "asc" } } },
      },
      _count: { select: { assessments: true } },
    },
  });

  if (!template) return NextResponse.json({ error: "Template tidak ditemukan" }, { status: 404 });
  return NextResponse.json(template);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { success } = rateLimit(`update-template:${getClientIp(req)}`, 20, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.assessmentTemplate.findFirst({
    where: { id, tenantId: session.tenantId },
    include: { _count: { select: { assessments: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Template tidak ditemukan" }, { status: 404 });

  const body = await req.json();
  const parsed = updateAssessmentTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input tidak valid" }, { status: 400 });
  }

  const { categories, ...scalar } = parsed.data;

  // Kategori structure is locked once any StudentAssessment row references
  // this template — deleting an AssessmentIndicator cascades to
  // StudentAssessmentScore (see prisma/schema.prisma), which would silently
  // erase teacher scores. The client UI also disables the builder when
  // _count.assessments > 0; this is the server-side enforcement.
  if (categories && existing._count.assessments > 0) {
    return NextResponse.json(
      {
        error:
          "Template sudah dipakai penilaian. Nama dan tipe bisa diubah, tetapi struktur kategori dikunci.",
      },
      { status: 409 },
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (Object.keys(scalar).length > 0) {
      await tx.assessmentTemplate.update({ where: { id }, data: scalar });
    }
    if (categories) {
      // Replace-all rewrite. Safe because _count.assessments === 0 above —
      // no StudentAssessmentScore rows reference any of these indicators yet.
      await tx.assessmentCategory.deleteMany({ where: { templateId: id } });
      if (categories.length > 0) {
        for (let ci = 0; ci < categories.length; ci++) {
          const cat = categories[ci];
          await tx.assessmentCategory.create({
            data: {
              templateId: id,
              name: cat.name.trim(),
              sortOrder: ci,
              indicators: {
                create: cat.indicators.map((desc, ii) => ({
                  description: desc.trim(),
                  sortOrder: ii,
                })),
              },
            },
          });
        }
      }
    }
    return tx.assessmentTemplate.findUnique({
      where: { id },
      include: {
        categories: {
          orderBy: { sortOrder: "asc" },
          include: { indicators: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
  });

  revalidatePath("/api/assessments/templates");
  return NextResponse.json(updated);
}
