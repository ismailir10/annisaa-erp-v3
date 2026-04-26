import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { getTodayInTimezone, getYmdInTimezone } from "@/lib/attendance/timezone";

export type StudentInvoices = {
  id: string;
  invoiceNumber: string;
  periodLabel: string;
  totalDue: number;
  totalPaid: number;
  status: string;
  xenditPaymentUrl: string | null;
  createdAt: Date;
};

export type ParentChild = {
  studentId: string;
  studentName: string;
  studentNickname: string | null;
  className: string | null;
  programName: string | null;
  relationship: string;
  student: {
    id: string;
    name: string;
    nickname: string | null;
    enrollments: {
      id: string;
      status: string;
      classSection: {
        id: string;
        name: string;
        program: { name: string };
      };
    }[];
  };
};

async function _getParentWithChildren(parentId: string | null, email: string, tenantId: string | null) {
    const whereClause = parentId
      ? { id: parentId, tenantId: tenantId ?? undefined }
      : { email, tenantId: tenantId ?? undefined };

    const parent = await prisma.parent.findFirst({
      where: whereClause,
      include: {
        guardians: {
          include: {
            student: {
              include: {
                enrollments: {
                  where: { status: "ACTIVE" },
                  include: {
                    classSection: {
                      include: { program: { select: { name: true } } },
                    },
                  },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!parent || parent.guardians.length === 0) {
      return { parent: null, children: [] as ParentChild[] };
    }

    const children: ParentChild[] = parent.guardians.map((sg) => {
      const enrollment = sg.student.enrollments[0] ?? null;
      return {
        studentId: sg.student.id,
        studentName: sg.student.name,
        studentNickname: sg.student.nickname,
        className: enrollment?.classSection.name ?? null,
        programName: enrollment?.classSection.program.name ?? null,
        relationship: sg.relationship,
        student: sg.student,
      };
    });

    return { parent, children };
}

const _cachedGetParentWithChildren = unstable_cache(
  _getParentWithChildren,
  ["parent-children"],
  { revalidate: 60, tags: ["parent-children"] }
);

/**
 * Find a parent record from session (parentId or email fallback).
 * Returns the parent with all linked children via StudentGuardian.
 * Cached 60s per parent — keyed by parentId or email + tenantId.
 */
export async function getParentWithChildren(session: SessionUser) {
  return _cachedGetParentWithChildren(
    session.parentId,
    session.email,
    session.tenantId
  );
}

/**
 * Resolve which child is selected from the URL param, defaulting to first.
 */
export function resolveSelectedChild(
  children: ParentChild[],
  childParam: string | undefined
): ParentChild | null {
  if (children.length === 0) return null;

  if (childParam) {
    const found = children.find((c) => c.studentId === childParam);
    if (found) return found;
  }

  return children[0];
}

/**
 * Fetch invoices for a specific student.
 * Only fetches unpaid/partially paid/overdue invoices, ordered by creation date.
 * Cached for 2 minutes, tagged for revalidation on payment mutations.
 */
// Module-level cache wrapper: Next.js `unstable_cache` serialises the runtime
// args (studentId, tenantId) into the cache key automatically, so each
// (studentId, tenantId) pair is a distinct cache entry. `tenantId` is also
// included in the Prisma `where` as defense-in-depth.
const _cachedGetStudentInvoices = unstable_cache(
  async (studentId: string, tenantId: string): Promise<StudentInvoices[]> => {
    const invoices = await prisma.invoice.findMany({
      where: {
        studentId,
        tenantId,
        status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
      },
      orderBy: { createdAt: "desc" as const },
      take: 5,
      select: {
        id: true,
        invoiceNumber: true,
        periodLabel: true,
        totalDue: true,
        totalPaid: true,
        status: true,
        xenditPaymentUrl: true,
        createdAt: true,
      },
    });

    return invoices.map((inv) => ({
      ...inv,
      totalDue: Number(inv.totalDue),
      totalPaid: Number(inv.totalPaid),
    }));
  },
  ["student-invoices"],
  { revalidate: 120, tags: ["student-invoices"] }
);

export async function getStudentInvoices(
  studentId: string,
  tenantId: string
): Promise<StudentInvoices[]> {
  return _cachedGetStudentInvoices(studentId, tenantId);
}

/**
 * Fetch today's attendance status for a student.
 * Returns null when no record exists for today (e.g. weekend, no class).
 */
export async function getTodayStudentAttendance(
  studentId: string,
  tenantId: string,
): Promise<string | null> {
  // Asia/Jakarta date — `toISOString()` would return UTC, so between 00:00
  // and 06:59 WIB the fallback resolved to *yesterday* in Jakarta. See the
  // `toLocalYmd` comment below for the analogous local-calendar caveat.
  const today = getTodayInTimezone("Asia/Jakarta");
  const record = await prisma.studentAttendance.findFirst({
    where: {
      studentId,
      date: today,
      isVoided: false,
      student: { tenantId },
    },
    select: { status: true },
  });
  return record?.status ?? null;
}

export type PublishedAssessmentListItem = {
  id: string;
  templateName: string;
  period: string;
  programName: string;
  status: string;
  publishedAt: string | null;
};

/**
 * Fetch every published assessment for a specific student.
 *
 * Tenant safety: callers resolve `studentId` via `getParentWithChildren()`,
 * which already applies the tenant filter; an assessment row is locked to a
 * tenant-scoped student, so the original `template: { tenantId }` JOIN was
 * defensive-in-depth but strictly redundant. Dropping it removes a JOIN.
 *
 * Cached 2 minutes, tagged so publish/unpublish mutations can invalidate.
 */
export const getPublishedAssessmentsForStudent = unstable_cache(
  async (studentId: string): Promise<PublishedAssessmentListItem[]> => {
    const rows = await prisma.studentAssessment.findMany({
      where: { studentId, status: "PUBLISHED" },
      select: {
        id: true,
        period: true,
        status: true,
        publishedAt: true,
        template: {
          select: {
            name: true,
            program: { select: { name: true } },
          },
        },
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    });
    return rows.map((r) => ({
      id: r.id,
      templateName: r.template.name,
      period: r.period,
      programName: r.template.program.name,
      status: r.status,
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    }));
  },
  ["parent-published-assessments"],
  { revalidate: 120, tags: ["parent-published-assessments"] },
);

/**
 * Attendance status values come from StudentAttendance.status:
 * PRESENT | SICK | PERMISSION | ABSENT (see prisma/schema.prisma).
 */
export type WeekAttendanceCounts = {
  PRESENT: number;
  SICK: number;
  PERMISSION: number;
  ABSENT: number;
};

/**
 * Format a Date as YYYY-MM-DD using LOCAL calendar components.
 * We avoid `toISOString()` here because it coerces to UTC and would shift
 * the date by one day for positive-UTC machines (e.g. Asia/Jakarta).
 */
function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Return YYYY-MM-DD for the Monday of the ISO week containing `ref`.
 * Monday = start of week (getDay() returns 1 for Monday, 0 for Sunday).
 */
export function mondayOfWeek(ref: Date): string {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toLocalYmd(d);
}

/**
 * Count attendance records falling inside the current ISO week
 * (Monday → `today` inclusive). Records are string dates in YYYY-MM-DD.
 * Records outside the window are ignored. Unknown statuses are ignored.
 */
export function countAttendanceThisWeek(
  records: { date: string; status: string }[],
  now: Date = new Date(),
): WeekAttendanceCounts {
  const monday = mondayOfWeek(now);
  const today = toLocalYmd(now);
  const counts: WeekAttendanceCounts = { PRESENT: 0, SICK: 0, PERMISSION: 0, ABSENT: 0 };
  for (const r of records) {
    if (r.date < monday || r.date > today) continue;
    if (r.status in counts) {
      counts[r.status as keyof WeekAttendanceCounts] += 1;
    }
  }
  return counts;
}

export type StudentAttendanceRecent = {
  id: string;
  date: string;
  status: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  notes: string | null;
};

/**
 * Fetch recent attendance records for a student (default last 30 days).
 * Cached 2 minutes, tagged so attendance mutations can invalidate.
 *
 * Tenant safety: callers resolve `studentId` via `getParentWithChildren()`,
 * which already tenant-scopes the student.
 */
export const getStudentAttendanceRecent = unstable_cache(
  async (studentId: string, days = 30): Promise<StudentAttendanceRecent[]> => {
    const since = new Date();
    since.setDate(since.getDate() - days);
    // Format the cutoff in Asia/Jakarta. `toISOString()` would return UTC;
    // `toLocalYmd` would return host-local (UTC on Vercel) — both drift the
    // "last 30 days" window by up to a day at the WIB midnight boundary.
    const startDate = getYmdInTimezone(since, "Asia/Jakarta");

    const records = await prisma.studentAttendance.findMany({
      where: { studentId, isVoided: false, date: { gte: startDate } },
      orderBy: { date: "desc" },
      select: {
        id: true,
        date: true,
        status: true,
        checkInTime: true,
        checkOutTime: true,
        notes: true,
      },
    });

    return records.map((r) => ({
      id: r.id,
      date: r.date,
      status: r.status,
      checkInTime: r.checkInTime?.toISOString() ?? null,
      checkOutTime: r.checkOutTime?.toISOString() ?? null,
      notes: r.notes,
    }));
  },
  ["parent-student-attendance-recent"],
  { revalidate: 120, tags: ["parent-student-attendance-recent"] },
);

export type InvoiceListItem = {
  id: string;
  invoiceNumber: string;
  periodLabel: string;
  dueDate: string;
  totalDue: number;
  totalPaid: number;
  status: string;
  xenditPaymentUrl: string | null;
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
};

/**
 * Fetch all non-DRAFT invoices for a specific student.
 * Cached for 2 minutes with parent-scoped key to prevent cross-parent data leak.
 * Key includes parentId + studentId + tenantId for triple isolation.
 */
export const getParentInvoiceList = unstable_cache(
  async (parentId: string, studentId: string, tenantId: string): Promise<InvoiceListItem[]> => {
    // Allow-list: parents see only invoices they can act on (SENT, PARTIALLY_PAID,
    // OVERDUE) plus historical PAID for the "Riwayat" group. PENDING_PAYMENT_LINK
    // (Xendit creation failed; admin must retry) and CANCELLED (voided by admin)
    // never reach the parent — there is nothing actionable and showing them
    // erodes trust on the most-visible money surface in the app.
    const invoices = await prisma.invoice.findMany({
      where: {
        studentId,
        tenantId,
        status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE", "PAID"] },
      },
      select: {
        id: true,
        invoiceNumber: true,
        periodLabel: true,
        dueDate: true,
        totalDue: true,
        totalPaid: true,
        status: true,
        xenditPaymentUrl: true,
        sentAt: true,
        paidAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      periodLabel: inv.periodLabel,
      dueDate: inv.dueDate,
      totalDue: Number(inv.totalDue),
      totalPaid: Number(inv.totalPaid),
      status: inv.status,
      xenditPaymentUrl: inv.xenditPaymentUrl,
      sentAt: inv.sentAt?.toISOString() ?? null,
      paidAt: inv.paidAt?.toISOString() ?? null,
      createdAt: inv.createdAt.toISOString(),
    }));
  },
  ["parent-invoice-list"],
  { revalidate: 120, tags: ["parent-invoice-list"] }
);
