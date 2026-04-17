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

/**
 * Find a parent record from session (parentId or email fallback).
 * Returns the parent with all linked children via StudentGuardian.
 */
export async function getParentWithChildren(session: SessionUser) {
    const parentId = session.parentId;

    const whereClause = parentId
      ? { id: parentId, tenantId: session.tenantId ?? undefined }
      : { email: session.email, tenantId: session.tenantId ?? undefined };

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
      return { parent: null, children: [] };
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
