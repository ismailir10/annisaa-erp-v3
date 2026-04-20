import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, isSuperAdmin } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getScenario, listScenarioKeys } from "@/lib/uat/scenarios";

/**
 * POST /api/admin/uat-prep
 *
 * Runs a named UAT scenario against the caller's tenant to stage cross-role
 * preconditions (e.g. backfill Xendit payment URLs before a parent-portal
 * UAT run). SUPER_ADMIN only. Refuses to run against production unless the
 * ALLOW_UAT_PREP_IN_PROD env flag is explicitly set.
 */
const bodySchema = z.object({
  scenario: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const { success } = rateLimit(`uat-prep:${getClientIp(req)}`, 5, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  if (process.env.NODE_ENV === "production" && process.env.ALLOW_UAT_PREP_IN_PROD !== "true") {
    return NextResponse.json(
      { error: "UAT prep is disabled in production" },
      { status: 403 },
    );
  }

  const session = await getSession();
  if (!session?.tenantId || !isSuperAdmin(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const scenario = getScenario(parsed.data.scenario);
  if (!scenario) {
    return NextResponse.json(
      { error: `Unknown scenario. Available: ${listScenarioKeys().join(", ")}` },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  try {
    const result = await scenario.prep({ tenantId: session.tenantId, prisma });
    return NextResponse.json({
      scenario: scenario.key,
      ok: result.ok,
      actions: result.actions,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (err) {
    return NextResponse.json(
      {
        scenario: scenario.key,
        ok: false,
        error: err instanceof Error ? err.message : "Scenario failed",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}
