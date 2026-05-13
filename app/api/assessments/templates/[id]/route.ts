import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
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
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Template tidak ditemukan" }, { status: 404 });

  const body = await req.json();
  const parsed = updateAssessmentTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input tidak valid" }, { status: 400 });
  }

  const { categories, ...scalar } = parsed.data;

  // Lock-and-rewrite inside a Serializable transaction. The lock check
  // (assessments count) MUST be re-read inside the txn — checking
  // outside introduces a TOCTOU window where a teacher could insert a
  // StudentAssessment between the read and the deleteMany, and the
  // FK-cascade on AssessmentIndicator → StudentAssessmentScore would
  // silently nuke the freshly-saved scores. Serializable aborts the
  // loser on conflict (P2034) — we surface 409 so the client retries.
  let lockConflict = false;
  let updated;
  try {
    updated = await prisma.$transaction(
      async (tx) => {
        if (categories) {
          const count = await tx.studentAssessment.count({ where: { templateId: id } });
          if (count > 0) {
            lockConflict = true;
            return null;
          }
        }
        if (Object.keys(scalar).length > 0) {
          await tx.assessmentTemplate.update({ where: { id }, data: scalar });
        }
        if (categories) {
          // Replace-all rewrite. Safe because the in-txn count above is 0
          // and Serializable isolation blocks concurrent inserts.
          await tx.assessmentCategory.deleteMany({ where: { templateId: id } });
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
        return tx.assessmentTemplate.findUnique({
          where: { id },
          include: {
            categories: {
              orderBy: { sortOrder: "asc" },
              include: { indicators: { orderBy: { sortOrder: "asc" } } },
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
      return NextResponse.json(
        { error: "Konflik penyimpanan, coba lagi." },
        { status: 409 },
      );
    }
    throw e;
  }

  if (lockConflict) {
    return NextResponse.json(
      {
        error:
          "Template sudah dipakai penilaian. Nama dan tipe bisa diubah, tetapi struktur kategori dikunci.",
      },
      { status: 409 },
    );
  }

  revalidatePath("/api/assessments/templates");
  return NextResponse.json(updated);
}
