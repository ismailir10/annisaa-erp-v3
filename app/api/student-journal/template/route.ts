import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/student-journal/guards";

// GET returns (and upserts on first read) the tenant's singleton template.
export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { session } = guard;

  const tmpl = await prisma.studentJournalTemplate.upsert({
    where: { tenantId: session.tenantId },
    update: {},
    create: { tenantId: session.tenantId, status: "ACTIVE" },
  });
  return NextResponse.json({ data: tmpl });
}
