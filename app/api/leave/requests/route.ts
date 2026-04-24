import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { parsePagination, parseSort } from "@/lib/api/pagination";
import { paginatedResponse } from "@/lib/api/response";
import { validateBody } from "@/lib/api/validate";
import { createLeaveRequestSchema } from "@/lib/validations/leave";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// Teacher: submit leave request
export async function POST(req: NextRequest) {
  const { success } = rateLimit(`leave-request:${getClientIp(req)}`, 5, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.employeeId || session.role !== "TEACHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await validateBody(createLeaveRequestSchema, await req.json());
  if (result.error) return result.error;
  const { leaveType, startDate, endDate, reason } = result.data;

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

  // Single fetch: check active status + grab leave balances in one query
  const employee = await prisma.employee.findUnique({
    where: { id: session.employeeId },
    select: { status: true, leaveBalanceAnnual: true, leaveBalanceSick: true },
  });
  if (employee?.status !== "ACTIVE") {
    return NextResponse.json({ error: "Karyawan tidak aktif" }, { status: 400 });
  }

  // Check balance for ANNUAL and SICK via DB aggregate (no rows fetched)
  if (leaveType === "ANNUAL" || leaveType === "SICK") {
    const year = new Date().getFullYear();
    const usedAgg = await prisma.leaveRequest.aggregate({
      _sum: { days: true },
      where: {
        employeeId: session.employeeId,
        status: "APPROVED",
        leaveType,
        startDate: { gte: `${year}-01-01` },
      },
    });
    const used = usedAgg._sum.days ?? 0;
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
      reason,
    },
  });

  return NextResponse.json(request, { status: 201 });
}

// Admin: list all leave requests
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
  }

  const { searchParams } = new URL(req.url);
  const { skip, take, page, pageSize } = parsePagination(searchParams);
  const sort = parseSort(searchParams, {
    allow: ["createdAt", "startDate", "endDate", "status", "leaveType", "days"],
    default: "createdAt",
    defaultOrder: "desc",
  });
  if (sort instanceof Response) return sort;
  const { orderBy } = sort;
  const status = searchParams.get("status");
  const search = searchParams.get("search") ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const employeeFilter: any = { tenantId: session.tenantId };
  if (search) {
    employeeFilter.nama = { contains: search, mode: "insensitive" };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { employee: employeeFilter };
  if (status && status !== "all") where.status = status;

  const [requests, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      skip,
      take,
      include: {
        employee: {
          select: { nama: true, kode: true, jabatan: true, campus: { select: { name: true } } },
        },
      },
      orderBy,
    }),
    prisma.leaveRequest.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(requests, total, page, pageSize));
}
