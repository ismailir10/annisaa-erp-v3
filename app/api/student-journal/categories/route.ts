import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/student-journal/guards";
import {
  createCategorySchema,
  scopeSchema,
} from "@/lib/validations/student-journal";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { session } = guard;

  const { searchParams } = new URL(req.url);
  const scopeParam = searchParams.get("scope");
  const statusParam = searchParams.get("status") ?? "ACTIVE";

  let scope: "SCHOOL" | "HOME" | undefined;
  if (scopeParam) {
    const s = scopeSchema.safeParse(scopeParam);
    if (!s.success) {
      return NextResponse.json({ error: "scope tidak valid" }, { status: 400 });
    }
    scope = s.data;
  }

  const tmpl = await prisma.studentJournalTemplate.findUnique({
    where: { tenantId: session.tenantId },
  });
  if (!tmpl) return NextResponse.json({ data: [] });

  const categories = await prisma.studentJournalCategory.findMany({
    where: {
      templateId: tmpl.id,
      ...(scope && { scope }),
      ...(statusParam !== "ALL" && { status: statusParam }),
    },
    include: {
      indicators: {
        where: statusParam !== "ALL" ? { status: statusParam } : undefined,
        orderBy: { order: "asc" },
      },
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ data: categories });
}

export async function POST(req: NextRequest) {
  const { success } = rateLimit(`sj-categories-post:${getClientIp(req)}`, 20, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { session } = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const parsed = createCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input tidak valid" },
      { status: 400 },
    );
  }

  const tmpl = await prisma.studentJournalTemplate.upsert({
    where: { tenantId: session.tenantId },
    update: {},
    create: { tenantId: session.tenantId, status: "ACTIVE" },
  });

  const cat = await prisma.studentJournalCategory.create({
    data: {
      templateId: tmpl.id,
      name: parsed.data.name,
      scope: parsed.data.scope,
      order: parsed.data.order,
    },
  });
  return NextResponse.json({ data: cat }, { status: 201 });
}
