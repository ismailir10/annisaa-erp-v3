// Demo-mode harness for the Playwright SELF-write canary spec. Exists
// solely so `e2e/parent/self-update.spec.ts` can invoke `updateGuardian`
// (which is a `"use server"` server action, not directly POST-able from a
// browser fetch) end-to-end.
//
// Production guard: returns 404 unless `DEMO_MODE === 'true'`. Mirrors
// `app/api/demo/login` posture — 404 (not 403) so an attacker cannot
// fingerprint the demo gate.
//
// Two POST modes:
//   { list: true }
//       → returns { ownGuardianId, otherGuardianId } where own is the
//         Guardian whose userId matches the current demo session, and
//         other is the seeded unowned fixture (userId IS NULL,
//         fullName === 'Demo Other Guardian'). Used by the spec to
//         resolve target IDs deterministically without a SQL fixture.
//   { id, payload, readback? }
//       → invokes `updateGuardian(id, payload)` and returns its
//         ActionResult JSON unchanged. If `readback === true` AND the
//         result was ok, additionally returns the post-update Guardian
//         row so the spec can assert state without a separate readback
//         endpoint.
//
// Auth: reuses the standard demo session cookie via `getSession`. No bypass.
//
// Cycle: docs/cycles/2026-05-08-p2-portal-write-widening.md (T4a)

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { updateGuardian } from "@/lib/guardians/actions/update";
import { UNOWNED_FIXTURE_GUARDIAN_NAME } from "@/prisma/seed/10-demo-parent-guardian";

const ListBodySchema = z.object({ list: z.literal(true) });
const UpdateBodySchema = z.object({
  id: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  readback: z.boolean().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.DEMO_MODE !== "true") {
    return new NextResponse(null, { status: 404 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const listResult = ListBodySchema.safeParse(body);
  if (listResult.success) {
    const own = await prisma.guardian.findFirst({
      where: {
        tenantId: session.tenantId,
        userId: session.userId,
        deletedAt: null,
      },
      select: { id: true },
    });
    const other = await prisma.guardian.findFirst({
      where: {
        tenantId: session.tenantId,
        userId: null,
        fullName: UNOWNED_FIXTURE_GUARDIAN_NAME,
        deletedAt: null,
      },
      select: { id: true },
    });
    return NextResponse.json({
      ownGuardianId: own?.id ?? null,
      otherGuardianId: other?.id ?? null,
    });
  }

  const updateResult = UpdateBodySchema.safeParse(body);
  if (!updateResult.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: updateResult.error.issues },
      { status: 400 },
    );
  }

  const { id, payload, readback } = updateResult.data;
  const result = await updateGuardian(id, payload);

  if (readback && result.ok) {
    const row = await prisma.guardian.findFirst({
      where: { id, tenantId: session.tenantId, deletedAt: null },
    });
    return NextResponse.json({ ...result, readback: row });
  }
  return NextResponse.json(result);
}
