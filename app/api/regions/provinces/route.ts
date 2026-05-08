// GET /api/regions/provinces
// Returns all 38 Indonesian provinces. Tenant-agnostic (global reference data).
// Auth: getSession() required (cycle Spec §2).
//
// Cycle: docs/cycles/2026-05-08-p2-addresses-idn-chain.md (T3)

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
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
