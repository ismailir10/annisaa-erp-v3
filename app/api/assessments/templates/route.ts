import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { parsePagination } from "@/lib/api/pagination";
import { createAssessmentTemplateSchema } from "@/lib/validations/assessment-template";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json([], { status: 401 });

  const { searchParams } = new URL(req.url);
  const paginated = searchParams.get("page") !== null;

  const include = {
    program: { select: { name: true } },
    categories: {
      orderBy: { sortOrder: "asc" as const },
      include: { indicators: { orderBy: { sortOrder: "asc" as const } } },
    },
    _count: { select: { assessments: true } },
  };

  // ── Paginated list (admin UI) ────────────────────────────────────
  if (paginated) {
    const { page, pageSize, skip, take } = parsePagination(searchParams);
    const search = searchParams.get("search") ?? "";
    const isActiveParam = searchParams.get("isActive");

    const where = {
      tenantId: session.tenantId,
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
      ...(isActiveParam !== null ? { isActive: isActiveParam === "true" } : {}),
    };

    const [templates, total] = await Promise.all([
      prisma.assessmentTemplate.findMany({
        where,
        include,
        orderBy: { name: "asc" },
        skip,
        take,
      }),
      prisma.assessmentTemplate.count({ where }),
    ]);

    return NextResponse.json({
      data: templates,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  }

  // ── Full list (backward compat — teacher scoring page) ──────────
  const templates = await prisma.assessmentTemplate.findMany({
    where: { tenantId: session.tenantId },
    include,
    orderBy: { name: "asc" },
  });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const { success } = rateLimit(`create-template:${getClientIp(req)}`, 10, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createAssessmentTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input tidak valid" }, { status: 400 });
  }

  const program = await prisma.program.findFirst({
    where: { id: parsed.data.programId, tenantId: session.tenantId },
  });
  if (!program) return NextResponse.json({ error: "Program tidak ditemukan" }, { status: 404 });

  const name = parsed.data.name.trim();

  const existing = await prisma.assessmentTemplate.findFirst({
    where: {
      tenantId: session.tenantId,
      programId: parsed.data.programId,
      name,
      type: parsed.data.type,
    },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: "Template dengan nama dan tipe yang sama sudah ada untuk program ini.",
        existingId: existing.id,
      },
      { status: 409 },
    );
  }

  const template = await prisma.assessmentTemplate.create({
    data: {
      tenantId: session.tenantId,
      programId: parsed.data.programId,
      name,
      type: parsed.data.type,
      categories: parsed.data.categories.length
        ? {
            create: parsed.data.categories.map((cat, ci) => ({
              name: cat.name.trim(),
              sortOrder: ci,
              indicators: {
                create: cat.indicators.map((desc, ii) => ({
                  description: desc.trim(),
                  sortOrder: ii,
                })),
              },
            })),
          }
        : undefined,
    },
    include: {
      categories: {
        orderBy: { sortOrder: "asc" },
        include: { indicators: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });

  revalidatePath("/api/assessments/templates");
  return NextResponse.json(template, { status: 201 });
}
