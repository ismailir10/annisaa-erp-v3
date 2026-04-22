import { NextRequest, NextResponse } from "next/server";
import { requireGuardianForStudent } from "@/lib/student-journal/guards";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { parentActivityQuerySchema } from "@/lib/validations/parent-activity";
import { getStudentRecentActivity } from "@/lib/parent-activity";

/**
 * GET /api/parent/children/[id]/activity
 * Returns the latest cross-module events for the given child as a single
 * sorted feed. Rate-limited 60/min per IP.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ip = getClientIp(req);
  const { success } = rateLimit(`parent-activity:${ip}`, 60, 60_000);
  if (!success) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan" },
      { status: 429 },
    );
  }

  const { id: studentId } = await params;
  const guard = await requireGuardianForStudent(studentId);
  if (guard.error) return guard.error;
  const { session } = guard;

  const { searchParams } = new URL(req.url);
  const parsed = parentActivityQuerySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
    days: searchParams.get("days") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Query tidak valid" },
      { status: 400 },
    );
  }

  const data = await getStudentRecentActivity(studentId, session.tenantId, {
    limit: parsed.data.limit,
    days: parsed.data.days,
  });

  return NextResponse.json({ data });
}
