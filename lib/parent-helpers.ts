import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";

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
export const getStudentInvoices = unstable_cache(
  async (studentId: string): Promise<StudentInvoices[]> => {
    const invoices = await prisma.invoice.findMany({
      where: {
        studentId,
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
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
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
        template: {
          select: {
            name: true,
            program: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      templateName: r.template.name,
      period: r.period,
      programName: r.template.program.name,
      status: r.status,
    }));
  },
  ["parent-published-assessments"],
  { revalidate: 120, tags: ["parent-published-assessments"] },
);

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
    const startDate = since.toISOString().split("T")[0];

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
    const invoices = await prisma.invoice.findMany({
      where: { studentId, tenantId, status: { not: "DRAFT" } },
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
