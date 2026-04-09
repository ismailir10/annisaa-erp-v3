import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json([], { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const studentId = searchParams.get("studentId");

  const where: Record<string, unknown> = { tenantId: session.tenantId };
  if (status && status !== "all") where.status = status;
  if (studentId) where.studentId = studentId;

  const invoices = await prisma.invoice.findMany({
    where,
    include: {
      student: { select: { name: true, nickname: true } },
      _count: { select: { payments: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(invoices);
}
