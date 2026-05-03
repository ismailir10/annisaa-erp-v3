// @public — UptimeRobot ping target. No auth.
// DB-aware liveness check: GET → SELECT 1 → 200/503.
// Doubles as Supabase free-tier keepalive (5min UR ping = no auto-pause).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      sha: process.env.VERCEL_GIT_COMMIT_SHA || "local",
    });
  } catch (err) {
    console.error("[health] db check failed", err);
    return NextResponse.json(
      { ok: false, error: "db_unreachable" },
      { status: 503 },
    );
  }
}
