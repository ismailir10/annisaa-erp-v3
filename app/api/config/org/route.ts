import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { validateBody } from "@/lib/api/validate";
import { orgConfigSchema } from "@/lib/validations/org-config";

export const revalidate = 3600; // 1h — org config is static between saves

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
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { success } = rateLimit(`update-org-config:${session.id}`, 5, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const result = await validateBody(orgConfigSchema, await req.json());
  if (result.error) return result.error;
  const d = result.data;
  const config = await prisma.orgConfig.upsert({
    where: { tenantId: session.tenantId },
    update: {
      workingDays: JSON.stringify(d.workingDays),
      workStartTime: d.workStartTime,
      workEndTime: d.workEndTime,
      gracePeriodMinutes: d.gracePeriodMinutes,
      timezone: d.timezone,
      payrollPeriodStartDay: d.payrollPeriodStartDay,
      payrollPeriodEndDay: d.payrollPeriodEndDay,
    },
    create: {
      tenantId: session.tenantId,
      workingDays: JSON.stringify(d.workingDays),
      workStartTime: d.workStartTime,
      workEndTime: d.workEndTime,
      gracePeriodMinutes: d.gracePeriodMinutes,
      timezone: d.timezone,
      payrollPeriodStartDay: d.payrollPeriodStartDay,
      payrollPeriodEndDay: d.payrollPeriodEndDay,
    },
  });

  revalidatePath("/api/config/org");
  return NextResponse.json(config);
}
