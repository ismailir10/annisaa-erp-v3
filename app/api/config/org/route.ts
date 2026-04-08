import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json(null, { status: 401 });

  const config = await prisma.orgConfig.findUnique({
    where: { tenantId: session.tenantId },
  });

  return NextResponse.json(config);
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  const config = await prisma.orgConfig.upsert({
    where: { tenantId: session.tenantId },
    update: {
      workingDays: JSON.stringify(body.workingDays),
      workStartTime: body.workStartTime,
      workEndTime: body.workEndTime,
      gracePeriodMinutes: parseInt(body.gracePeriodMinutes),
      timezone: body.timezone,
      payrollPeriodStartDay: parseInt(body.payrollPeriodStartDay),
      payrollPeriodEndDay: parseInt(body.payrollPeriodEndDay),
    },
    create: {
      tenantId: session.tenantId,
      workingDays: JSON.stringify(body.workingDays),
      workStartTime: body.workStartTime,
      workEndTime: body.workEndTime,
      gracePeriodMinutes: parseInt(body.gracePeriodMinutes),
      timezone: body.timezone,
      payrollPeriodStartDay: parseInt(body.payrollPeriodStartDay),
      payrollPeriodEndDay: parseInt(body.payrollPeriodEndDay),
    },
  });

  return NextResponse.json(config);
}
