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

/**
 * Lookup parent + linked children. Caller-side preconditions enforce no
 * unscoped fan-out — `tenantId` is required, and at least one of
 * `parentId` / `email` must be a non-empty string. Without these guards
 * (i.e. the prior `tenantId ?? undefined` escape + bare `email` arg
 * shape), a session whose Parent row carries `email = null` could land
 * a `findFirst({ where: { email: null } })` query, returning the first
 * null-email parent globally. Staging today carries 200 such rows; one
 * leaked session would fan out to a foreign parent's guardians.
 */
async function _getParentWithChildren(parentId: string | null, email: string | null, tenantId: string) {
    // Loud contract enforcement instead of a non-null assertion: a future
    // caller landing here with both args null would otherwise produce
    // `findFirst({ where: { email: undefined, tenantId } })`, which Prisma
    // silently treats as an unfiltered tenant-only lookup (the staging
    // fan-out shape this cycle is closing).
    if (!parentId && (email === null || email.length === 0)) {
      throw new Error(
        "_getParentWithChildren: at least one of `parentId` / non-empty `email` is required",
      );
    }
    const whereClause = parentId
      ? { id: parentId, tenantId }
      : { email: email as string, tenantId };

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

const EMPTY_PARENT_RESULT = { parent: null, children: [] as ParentChild[] };

/**
 * Find a parent record from session (parentId or email fallback).
 * Returns the parent with all linked children via StudentGuardian.
 * Cached 60s per parent — keyed by (parentId, email, tenantId) tuple.
 *
 * Guard contract: the underlying lookup requires `tenantId` AND at least
 * one of `parentId` / non-empty `email`. Sessions that fail the contract
 * short-circuit to an empty result here rather than risking an unscoped
 * Prisma query (see `_getParentWithChildren` for the leak shape).
 *
 * Cache invalidation note: the static cache tag is `"parent-children"`,
 * so a `revalidateTag("parent-children")` call evicts every tenant's
 * cached entry — Next.js tags are global, not per-tuple. Per-parent
 * isolation applies to entry CREATION (the runtime args distinguish
 * entries) but NOT to invalidation. Coarse-grain eviction is the known
 * Next.js 14+ behaviour and is acceptable given the 60-s TTL.
 */
export async function getParentWithChildren(session: SessionUser) {
  if (!session.tenantId) return EMPTY_PARENT_RESULT;
  const hasEmail = typeof session.email === "string" && session.email.length > 0;
  if (!session.parentId && !hasEmail) return EMPTY_PARENT_RESULT;
  // Cache-key shape: when `parentId` is set, the lookup ignores `email`
  // (where = `{ id, tenantId }`). Pass `null` for email so two sessions
  // for the same parent — one with email, one without — share a single
  // cache entry rather than priming two slots for identical data.
  return _cachedGetParentWithChildren(
    session.parentId,
    session.parentId ? null : (hasEmail ? session.email : null),
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
 * Look up a single guardian-linked child by studentId — used by
 * `/parent/perkembangan/[studentId]` and the matching API route to enforce
 * "GUARDIAN may only read their own children" without leaking which
 * studentIds exist on the tenant.
 *
 * Returns null when the student is not linked to the session's parent
 * (whether because the studentId is bogus, belongs to another family in
 * the same tenant, or — defense in depth — the parent has no children
 * at all). Callers respond with a flat 404 in either case.
 *
 * Reuses the 60-s `getParentWithChildren` cache so screens that load
 * several children's perkembangan in parallel hit prisma at most once.
 */
export async function getParentChildById(
  session: SessionUser,
  studentId: string,
): Promise<ParentChild | null> {
  if (!studentId) return null;
  const { children } = await getParentWithChildren(session);
  return children.find((c) => c.studentId === studentId) ?? null;
}

/**
 * Fetch invoices for a specific student.
 * Only fetches unpaid/partially paid/overdue invoices, ordered by creation date.
 * Cached for 2 minutes, tagged for revalidation on payment mutations.
 */
// `unstable_cache` keys by serialising the runtime args, so each
// (studentId, tenantId) pair is a distinct cache entry. tenantId also
// appears in `where` as defense-in-depth.
export const getStudentInvoices = unstable_cache(
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
  // Tag string must stay in sync with the revalidateTag call in
  // app/api/assessments/student/[id]/route.ts (publish handler).
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

export type ParentOutstandingItem = {
  studentId: string;
  dueDate: string;
  remaining: number;
};

export type ParentOutstandingSummary = {
  count: number;
  total: number;
  nearestDue: string | null;
  items: ParentOutstandingItem[];
};

/**
 * Single source of truth for "outstanding tagihan" across the parent portal.
 *
 * Both `/parent` (home Tagihan tile) and `/parent/invoices` (Lunas-semua banner)
 * MUST compute outstanding from this helper. Any divergent query risks the
 * UAT-2026-05-03 INV-01 disagreement (home shows N unpaid, list shows "Lunas
 * semua") — a trust collapse for the persona whose top priority is on-time SPP.
 *
 * Aggregates household-wide across the supplied `studentIds`. Status allow-list
 * matches today's home: SENT / PARTIALLY_PAID / OVERDUE. Post-filter
 * `remaining > 0` so a PARTIALLY_PAID invoice with totalPaid === totalDue
 * (status not yet flipped to PAID) does not count.
 *
 * Uncached. Home is the latency-sensitive surface; cached list stays cached
 * separately. If benchmarks show home regressing > 100ms, add a 30 s cache.
 */
export async function getParentOutstandingForStudents(
  studentIds: string[],
  tenantId: string,
): Promise<ParentOutstandingSummary> {
  if (studentIds.length === 0) {
    return { count: 0, total: 0, nearestDue: null, items: [] };
  }
  const rows = await prisma.invoice.findMany({
    where: {
      tenantId,
      studentId: { in: studentIds },
      status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
    },
    select: { studentId: true, dueDate: true, totalDue: true, totalPaid: true },
  });

  const items: ParentOutstandingItem[] = [];
  let total = 0;
  let nearestDue: string | null = null;
  for (const r of rows) {
    const due = Number(r.totalDue);
    const paid = Number(r.totalPaid);
    const remaining = Math.max(0, due - paid);
    if (remaining <= 0) continue;
    items.push({ studentId: r.studentId, dueDate: r.dueDate, remaining });
    total += remaining;
    if (!nearestDue || r.dueDate < nearestDue) nearestDue = r.dueDate;
  }
  return { count: items.length, total, nearestDue, items };
}

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
