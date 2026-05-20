/**
 * T3 of feat/curriculum-cutover-prep — pins tenant-scope contract on the
 * legacy assessment page at /teacher/assessments/[classSectionId]/[templateId]/[period].
 *
 * Two paths the audit (2026-05-20 GAP-3) flagged need explicit gate coverage:
 *
 *   1. ClassSection lookup must filter by session.tenantId — a forged
 *      classSectionId from another tenant must return the "Kelas tidak
 *      ditemukan" EmptyState (outer guard).
 *
 *   2. TeachingAssignment.findFirst must include classSection.tenantId in
 *      its where (defense-in-depth — the outer guard at #1 already blocks
 *      cross-tenant, but propagating the scope here pins the contract
 *      against the recurring "forgot tenantId on junction-traversal" bug
 *      class that produced 3 RLS regressions in 6 weeks.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import type { SessionUser } from "@/lib/auth";

function findReactNodeWithProp(
  node: unknown,
  propName: string,
  needle: string,
): boolean {
  if (!node || typeof node !== "object") return false;
  const el = node as ReactElement<Record<string, unknown>>;
  if (
    el.props &&
    typeof el.props === "object" &&
    typeof el.props[propName] === "string" &&
    (el.props[propName] as string).includes(needle)
  ) {
    return true;
  }
  const children = (el.props as { children?: unknown } | undefined)?.children;
  if (Array.isArray(children)) {
    return children.some((c) => findReactNodeWithProp(c, propName, needle));
  }
  if (children) return findReactNodeWithProp(children, propName, needle);
  return false;
}

const classSectionFindFirst = vi.fn();
const teachingAssignmentFindFirst = vi.fn();
const assessmentTemplateFindFirst = vi.fn();
const studentEnrollmentFindMany = vi.fn();
const studentAssessmentFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    classSection: { findFirst: classSectionFindFirst },
    teachingAssignment: { findFirst: teachingAssignmentFindFirst },
    assessmentTemplate: { findFirst: assessmentTemplateFindFirst },
    studentEnrollment: { findMany: studentEnrollmentFindMany },
    studentAssessment: { findMany: studentAssessmentFindMany },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

const redirectMock = vi.fn((_to: string) => {
  throw new Error("REDIRECT");
});
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

function makeTeacherSession(tenantId: string): SessionUser {
  return {
    id: "u1",
    email: "t@t",
    role: "TEACHER",
    tenantId,
    employeeId: "emp-1",
    parentId: null,
    customRoleId: null,
    name: "Teacher",
    permissions: [],
  } as unknown as SessionUser;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/teacher/assessments/[classSectionId]/[templateId]/[period] tenant scope", () => {
  it("returns the Kelas tidak ditemukan EmptyState when classSectionId is cross-tenant", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeTeacherSession("tenant-A"));

    // Simulate the outer findFirst: cross-tenant lookup returns null because
    // the where filter scopes by session.tenantId.
    classSectionFindFirst.mockResolvedValue(null);

    const { default: Page } = await import(
      "@/app/teacher/assessments/[classSectionId]/[templateId]/[period]/page"
    );
    const result = await Page({
      params: Promise.resolve({
        classSectionId: "cs-from-tenant-B",
        templateId: "tpl-1",
        period: "2026-1",
      }),
    });

    // Outer findFirst was called with tenant-scoped where.
    expect(classSectionFindFirst).toHaveBeenCalledTimes(1);
    const outerArgs = classSectionFindFirst.mock.calls[0][0];
    expect(outerArgs.where.tenantId).toBe("tenant-A");
    expect(outerArgs.where.id).toBe("cs-from-tenant-B");

    // Template + TA lookups never run when classSection is missing.
    expect(assessmentTemplateFindFirst).not.toHaveBeenCalled();
    expect(teachingAssignmentFindFirst).not.toHaveBeenCalled();

    // The page returns an EmptyState (JSX); the rendered title is "Kelas tidak ditemukan".
    expect(findReactNodeWithProp(result, "title", "Kelas tidak ditemukan")).toBe(true);
  });

  it("TeachingAssignment.findFirst includes classSection.tenantId in where (defense-in-depth)", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeTeacherSession("tenant-A"));

    classSectionFindFirst.mockResolvedValue({
      id: "cs-1",
      name: "TKIT A",
      programId: "prog-1",
      program: { id: "prog-1", name: "TKIT" },
    });
    assessmentTemplateFindFirst.mockResolvedValue({
      id: "tpl-1",
      title: "T1",
      categories: [],
    });
    // TA lookup returns null → the page must render the "Akses ditolak"
    // EmptyState. We assert both the where shape (the defense-in-depth
    // contract) AND the render output (the user-facing behavior) so that
    // future refactors can't accidentally drop the TA-null branch without
    // failing the test.
    teachingAssignmentFindFirst.mockResolvedValue(null);

    const { default: Page } = await import(
      "@/app/teacher/assessments/[classSectionId]/[templateId]/[period]/page"
    );
    const result = await Page({
      params: Promise.resolve({
        classSectionId: "cs-1",
        templateId: "tpl-1",
        period: "2026-1",
      }),
    });

    expect(teachingAssignmentFindFirst).toHaveBeenCalledTimes(1);
    const taArgs = teachingAssignmentFindFirst.mock.calls[0][0];
    expect(taArgs.where.classSection.tenantId).toBe("tenant-A");
    expect(taArgs.where.classSection.status).toBe("ACTIVE");
    expect(taArgs.where.employeeId).toBe("emp-1");
    expect(taArgs.where.classSectionId).toBe("cs-1");
    expect(findReactNodeWithProp(result, "title", "Akses ditolak")).toBe(true);
  });
});
