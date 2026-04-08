import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Teacher: submit leave request
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.employeeId || session.role !== "TEACHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { leaveType, startDate, endDate, reason } = body;

  if (!leaveType || !startDate || !endDate || !reason?.trim()) {
    return NextResponse.json({ error: "Mohon lengkapi: jenis cuti, tanggal, dan alasan" }, { status: 400 });
  }

  // Calculate days (inclusive)
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (end < start) {
    return NextResponse.json({ error: "Tanggal selesai harus setelah tanggal mulai" }, { status: 400 });
  }

  let days = 0;
  const current = new Date(start);
  while (current <= end) {
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) days++; // Skip weekends
    current.setDate(current.getDate() + 1);
  }

  if (days === 0) {
    return NextResponse.json({ error: "Tidak ada hari kerja dalam rentang tanggal tersebut" }, { status: 400 });
  }

  // Check balance for ANNUAL and SICK
  if (leaveType === "ANNUAL" || leaveType === "SICK") {
    const employee = await prisma.employee.findUnique({
      where: { id: session.employeeId },
      select: { leaveBalanceAnnual: true, leaveBalanceSick: true },
    });

    const year = new Date().getFullYear();
    const approved = await prisma.leaveRequest.findMany({
      where: {
        employeeId: session.employeeId,
        status: "APPROVED",
        leaveType,
        startDate: { gte: `${year}-01-01` },
      },
    });
    const used = approved.reduce((s, r) => s + r.days, 0);
    const total = leaveType === "ANNUAL" ? employee!.leaveBalanceAnnual : employee!.leaveBalanceSick;
    const remaining = total - used;

    if (days > remaining) {
      return NextResponse.json(
        { error: `Sisa cuti ${leaveType === "ANNUAL" ? "tahunan" : "sakit"} tidak cukup (tersisa ${remaining} hari)` },
        { status: 400 }
      );
    }
  }

  // Check for overlapping requests
  const overlap = await prisma.leaveRequest.findFirst({
    where: {
      employeeId: session.employeeId,
      status: { in: ["PENDING", "APPROVED"] },
      OR: [
        { startDate: { lte: endDate }, endDate: { gte: startDate } },
      ],
    },
  });
  if (overlap) {
    return NextResponse.json({ error: "Sudah ada pengajuan cuti yang bertumpuk pada tanggal tersebut" }, { status: 400 });
  }

  const request = await prisma.leaveRequest.create({
    data: {
      employeeId: session.employeeId,
      leaveType,
      startDate,
      endDate,
      days,
      reason: reason.trim(),
    },
  });

  return NextResponse.json(request, { status: 201 });
}

// Admin: list all leave requests
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json([], { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {
    employee: { tenantId: session.tenantId },
  };
  if (status && status !== "all") where.status = status;

  const requests = await prisma.leaveRequest.findMany({
    where,
    include: {
      employee: { select: { nama: true, kode: true, jabatan: true, campus: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(requests);
}
