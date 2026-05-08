// GET /api/regions/regencies
// Returns regencies for a given provinceId. Tenant-agnostic (global reference data).
// Auth: getSession() required (cycle Spec §2).
//
// Cycle: docs/cycles/2026-05-08-p2-addresses-idn-chain.md (T3)

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const querySchema = z.object({
  provinceId: z.string().regex(/^\d{2}$/, "invalid_province_id"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const provinceIdRaw = url.searchParams.get("provinceId");
  if (!provinceIdRaw) {
    return NextResponse.json({ error: "missing_parent_id", field: "provinceId" }, { status: 400 });
  }

  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query", issues: parsed.error.issues }, { status: 400 });
  }

  const { provinceId, page, pageSize } = parsed.data;
  const rows = await prisma.regency.findMany({
    where: { provinceId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
    take: pageSize + 1,
    skip: (page - 1) * pageSize,
  });

  const hasMore = rows.length > pageSize;
  const trimmed = hasMore ? rows.slice(0, pageSize) : rows;
  return NextResponse.json({
    items: trimmed.map((r) => ({ id: r.id, label: r.name })),
    hasMore,
  });
}
