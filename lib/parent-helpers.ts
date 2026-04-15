import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";

export type StudentInvoices = {
  id: string;
  invoiceNumber: string;
  periodLabel: string;
  totalDue: unknown;
  totalPaid: unknown;
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
 */
export async function getStudentInvoices(studentId: string): Promise<StudentInvoices[]> {
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

  return invoices;
}
