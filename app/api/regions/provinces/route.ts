// GET /api/regions/provinces
// Returns all 38 Indonesian provinces. Tenant-agnostic (global reference data).
// Auth: getSession() required (cycle Spec §2).
//
// Strict mode: any query param (e.g. `?pageSize=10`) returns 400 — surfaces
// client typos rather than silently ignoring. Per AC3 "rejected with 400 to
// surface the mismatch rather than silently ignored". Province list is
// deliberately unbounded (38 rows constant); pagination params have no meaning.
//
// Cycle: docs/cycles/2026-05-08-p2-addresses-idn-chain.md (T3)

import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  if (url.searchParams.size > 0) {
    return NextResponse.json(
      {
        error: "invalid_query",
        message: "provinces route accepts no query params",
      },
      { status: 400 },
    );
  }

  const rows = await prisma.province.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return NextResponse.json({
    items: rows.map((r) => ({ id: r.id, label: r.name })),
    hasMore: false,
  });
}
