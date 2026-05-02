import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { requirePermission } from "@/lib/auth-guards";
import { parsePagination, parseSort } from "@/lib/api/pagination";
import { paginatedResponse } from "@/lib/api/response";
import { validateBody } from "@/lib/api/validate";
import { createLeaveRequestSchema } from "@/lib/validations/leave";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { calculateWorkingDays, parseWorkingDays } from "@/lib/payroll/working-days";

// Self-service: submit leave request
export async function POST(req: NextRequest) {
  const { success } = rateLimit(`leave-request:${getClientIp(req)}`, 5, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  // Permission gate (replaces legacy `session.role !== "TEACHER"` string
  // check). F-09 expansion — non-teaching staff with linked Employee rows
  // were previously locked out of submitting their own leave requests.
  if (!session?.employeeId || !hasPermission(session, "leave.submit")) {
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

  // F-07: holiday-aware working-day count. Previous loop skipped weekends
  // only — a leave request that straddled Idul Fitri counted the holiday
  // against the employee's balance. `calculateWorkingDays` is the canonical
  // tenant-aware day counter used by payroll; reusing it keeps leave/payroll
  // arithmetic consistent.
  const [orgConfig, holidays] = await Promise.all([
    prisma.orgConfig.findUnique({
      where: { tenantId: session.tenantId! },
      select: { workingDays: true },
    }),
    prisma.holiday.findMany({
      where: {
        tenantId: session.tenantId!,
        date: { gte: startDate, lte: endDate },
      },
      select: { date: true, isHalfDay: true },
    }),
  ]);

  const workingDayCodes = parseWorkingDays(orgConfig?.workingDays);
  // Default to Mon-Fri when OrgConfig is absent so a missing config does
  // not silently produce zero working days. Matches admin form default.
  const effectiveWorkingDays =
    workingDayCodes.length > 0 ? workingDayCodes : ["MON", "TUE", "WED", "THU", "FRI"];

  const days = calculateWorkingDays(startDate, endDate, effectiveWorkingDays, holidays);

  if (days <= 0) {
    return NextResponse.json({ error: "Tidak ada hari kerja dalam rentang tanggal tersebut" }, { status: 400 });
  }

  // F-10: balance check + overlap check + create wrapped in a single
  // serializable transaction. Prevents two concurrent submissions from both
  // passing the balance/overlap guard and inserting overlapping rows.
  // Errors are thrown as tagged Errors and converted to HTTP responses below
  // — Prisma's Serializable retry semantics rely on the transaction throwing.
  type LeaveTxError = { tag: "INACTIVE" | "INSUFFICIENT_BALANCE" | "OVERLAP"; message: string };
  try {
    const created = await prisma.$transaction(
      async (tx) => {
        const employee = await tx.employee.findFirst({
          where: { id: session.employeeId!, tenantId: session.tenantId! },
          select: { status: true, leaveBalanceAnnual: true, leaveBalanceSick: true },
        });
        if (employee?.status !== "ACTIVE") {
          const err: LeaveTxError = { tag: "INACTIVE", message: "Karyawan tidak aktif" };
          throw Object.assign(new Error(err.tag), err);
        }

        if (leaveType === "ANNUAL" || leaveType === "SICK") {
          const year = new Date().getFullYear();
          const usedAgg = await tx.leaveRequest.aggregate({
            _sum: { days: true },
            where: {
              employeeId: session.employeeId!,
              status: "APPROVED",
              leaveType,
              startDate: { gte: `${year}-01-01` },
            },
          });
          const used = usedAgg._sum.days ?? 0;
          const total = leaveType === "ANNUAL" ? employee.leaveBalanceAnnual : employee.leaveBalanceSick;
          const remaining = total - used;

          if (days > remaining) {
            const err: LeaveTxError = {
              tag: "INSUFFICIENT_BALANCE",
              message: `Sisa cuti ${leaveType === "ANNUAL" ? "tahunan" : "sakit"} tidak cukup (tersisa ${remaining} hari)`,
            };
            throw Object.assign(new Error(err.tag), err);
          }
        }

        const overlap = await tx.leaveRequest.findFirst({
          where: {
            employeeId: session.employeeId!,
            status: { in: ["PENDING", "APPROVED"] },
            OR: [{ startDate: { lte: endDate }, endDate: { gte: startDate } }],
          },
          select: { id: true },
        });
        if (overlap) {
          const err: LeaveTxError = {
            tag: "OVERLAP",
            message: "Sudah ada pengajuan cuti yang bertumpuk pada tanggal tersebut",
          };
          throw Object.assign(new Error(err.tag), err);
        }

        return tx.leaveRequest.create({
          data: {
            employeeId: session.employeeId!,
            leaveType,
            startDate,
            endDate,
            days,
            reason,
          },
        });
      },
      { isolationLevel: "Serializable" }
    );

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof Error) {
      const tag = (e as Error & Partial<LeaveTxError>).tag;
      const message = (e as Error & Partial<LeaveTxError>).message;
      if (tag === "INACTIVE" || tag === "INSUFFICIENT_BALANCE" || tag === "OVERLAP") {
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }
    throw e;
  }
}

// Admin: list all leave requests
export async function GET(req: NextRequest) {
  const auth = await requirePermission("leave.view");
  if ("error" in auth) return auth.error;
  const { session } = auth;

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
