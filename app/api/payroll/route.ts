import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json([], { status: 403 });
  }

  const runs = await prisma.payrollRun.findMany({
    where: { tenantId: session.tenantId },
    include: { _count: { select: { items: true } } },
    orderBy: { periodStart: "desc" },
  });

  return NextResponse.json(runs);
}
