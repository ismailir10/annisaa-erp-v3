import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ session: vi.fn(), family: vi.fn(), outstanding: vi.fn(), attendance: vi.fn(), notes: vi.fn(), development: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.session }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("@/lib/parent-helpers", () => ({ getParentWithChildren: mocks.family, getParentOutstandingForStudents: mocks.outstanding }));
vi.mock("@/lib/db", () => ({ prisma: { studentAttendance: { findMany: mocks.attendance }, studentJournalNote: { findMany: mocks.notes } } }));
vi.mock("@/lib/curriculum/perkembangan-loader", () => ({ loadStudentPerkembangan: mocks.development }));
import ParentDashboard from "../page";

const children = [
  { studentId: "child-a", studentName: "Alya Nur Rahma", studentNickname: "Alya", className: "TK A", relationship: "IBU" },
  { studentId: "child-b", studentName: "Alya Nur Zahra", studentNickname: "Alya", className: "TK B", relationship: "IBU" },
];
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-25T04:00:00Z"));
  mocks.session.mockResolvedValue({ role: "GUARDIAN", tenantId: "tenant-a" });
  mocks.family.mockResolvedValue({ parent: { id: "parent-a", name: "Ibu Rina" }, children });
  mocks.outstanding.mockResolvedValue({ count: 0, total: 0, nearestDue: null, items: [] });
  mocks.attendance.mockResolvedValue([]);
  mocks.notes.mockResolvedValue([{ studentId: "child-a", body: "Berbagi mainan dengan teman.", createdAt: new Date("2026-09-24T04:00:00Z"), date: "2026-09-24" }]);
  mocks.development.mockResolvedValue({ hasActiveWeek: false, latestThisWeek: [] });
});
afterEach(() => vi.useRealTimers());

describe("parent home authoritative household summary", () => {
  it("scopes all summary queries to guardian-linked children and teacher-authored active notes", async () => {
    const html = renderToStaticMarkup(await ParentDashboard());
    expect(mocks.attendance).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ studentId: { in: ["child-a", "child-b"] }, student: { tenantId: "tenant-a" }, isVoided: false }) }));
    expect(mocks.notes).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "tenant-a", studentId: { in: ["child-a", "child-b"] }, status: "ACTIVE", authorRole: "TEACHER" } }));
    expect(mocks.outstanding).toHaveBeenCalledWith(["child-a", "child-b"], "tenant-a");
    expect(mocks.development.mock.calls).toEqual([["tenant-a", "child-a"], ["tenant-a", "child-b"]]);
    expect(html).toContain("Alya Nur Rahma");
    expect(html).toContain("Alya Nur Zahra");
    expect(html).toContain("Berbagi mainan dengan teman.");
    expect(html).toContain('/parent/student-journal?child=child-b&amp;view=notes');
  });

  it("never interprets absent attendance records as children being present", async () => {
    const html = renderToStaticMarkup(await ParentDashboard());
    expect(html).toContain("2 anak belum memiliki catatan kehadiran hari ini.");
    expect(html).toContain("Belum dicatat");
    expect(html).not.toContain("sudah hadir");
  });

  it("announces household attendance only when each child's saved record is present", async () => {
    mocks.attendance.mockResolvedValue(children.map(child => ({ studentId: child.studentId, date: "2026-09-25", status: "PRESENT" })));
    const html = renderToStaticMarkup(await ParentDashboard());
    expect(html).toContain("2 anak");
    expect(html).toContain("sudah hadir.");
    expect(html).not.toContain("Belum dicatat");
  });

  it("propagates an unavailable invoice query to recovery instead of rendering a false paid summary", async () => {
    mocks.outstanding.mockRejectedValue(new Error("invoice read unavailable"));
    await expect(ParentDashboard()).rejects.toThrow("invoice read unavailable");
  });
});
