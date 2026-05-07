// Generic relation-list endpoint for the scaffold form-time RELATION renderer.
//
// GET /api/scaffold/<Entity>?q=<substring>&limit=<n>
//   - 200 → { items: Array<{ id: string; label: string }>, hasMore: boolean }
//   - 400 `unknown_entity` if <Entity> is not in `RELATION_LOOKUPS`
//   - 401 `unauthenticated` if no session
//   - 405 on non-GET
//
// Allowlist: `lib/scaffold/relation-lookups.ts` (frozen literal-keyed map).
// Defaults to deny — no `prisma[req.params.entity]` reflection. The reflection
// at `(prisma as ...)[cfg.prismaDelegate]` operates on the validated map's
// hardcoded literal value, not user input.
//
// Tenant-scoped + soft-deleted excluded on every query. No per-role gating
// this cycle — admin role is the only caller of the relation combobox today
// (canary mounts under `/admin/student/new`). Parent/teacher portals will
// need an `accessRoles` field on `RelationLookupConfig` before they mount a
// Student-relation combobox.
//
// Cycle: docs/cycles/2026-05-08-p2-entity-actions.md (T2)

import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getRelationLookup } from "@/lib/scaffold/relation-lookups";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_Q_LEN = 100;

type Delegate = {
  findMany: (args: {
    where: Record<string, unknown>;
    take: number;
    orderBy: Record<string, "asc" | "desc">;
    select: Record<string, true>;
  }) => Promise<Array<Record<string, unknown>>>;
};

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ entity: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { entity } = await ctx.params;
  const cfg = getRelationLookup(entity);
  if (!cfg) {
    return NextResponse.json(
      { error: "unknown_entity", entity },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, MAX_Q_LEN);
  const rawLimit = Number(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT));
  const limit = Math.max(
    1,
    Math.min(MAX_LIMIT, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT),
  );

  const where: Record<string, unknown> = {
    tenantId: session.tenantId,
    deletedAt: null,
  };
  if (q.length > 0) {
    where.OR = cfg.searchFields.map((f) => ({
      [f]: { contains: q, mode: "insensitive" as const },
    }));
  }

  const delegate = (
    prisma as unknown as Record<string, Delegate>
  )[cfg.prismaDelegate];

  const rows = await delegate.findMany({
    where,
    take: limit + 1,
    orderBy: { [cfg.displayField]: "asc" },
    select: { id: true, [cfg.displayField]: true },
  });

  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;
  const items = trimmed.map((r) => ({
    id: String(r.id),
    label: String(r[cfg.displayField] ?? r.id),
  }));

  return NextResponse.json({ items, hasMore });
}
