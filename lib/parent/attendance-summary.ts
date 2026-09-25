import { prisma } from "@/lib/db";
import { classroomAttendanceByStudent } from "@/lib/teacher/classroom-attendance";

export type ParentAttendanceStatus = "PRESENT" | "ABSENT" | "SICK" | "PERMISSION" | "MIXED";
export const PARENT_ATTENDANCE_LABELS: Record<ParentAttendanceStatus, string> = {
  PRESENT: "Hadir", ABSENT: "Alpa", SICK: "Sakit", PERMISSION: "Izin", MIXED: "Catatan berbeda",
};
export type ParentClassAttendance = { id: string; name: string; status: Exclude<ParentAttendanceStatus, "MIXED"> };
export type ParentDayAttendance = { status: ParentAttendanceStatus; classes: ParentClassAttendance[] };
type Row = {
  studentId: string; classSectionId: string; date: string; sessionId: string | null;
  status: string; classSection: { name: string };
};
type Session = { id: string; classSectionId: string; date: string };
const key = (classId: string, date: string) => `${classId}:${date}`;

/** Input records are newest-first, already restricted to authorized children.
 * Never arbitrarily replace one class's status with another class's status. */
export function summarizeParentAttendance(rows: Row[], sessions: Session[]) {
  const groups = new Map<string, Row[]>();
  const sessionsByDay = new Map<string, string[]>();
  for (const session of sessions) {
    const k = key(session.classSectionId, session.date);
    sessionsByDay.set(k, [...(sessionsByDay.get(k) ?? []), session.id]);
  }
  for (const row of rows) {
    const k = key(row.classSectionId, row.date);
    groups.set(k, [...(groups.get(k) ?? []), row]);
  }
  const result = new Map<string, Map<string, ParentDayAttendance>>();
  for (const [k, records] of groups) {
    for (const row of classroomAttendanceByStudent(records, sessionsByDay.get(k) ?? []).values()) {
      if (!(["PRESENT", "ABSENT", "SICK", "PERMISSION"] as string[]).includes(row.status)) continue;
      const days = result.get(row.studentId) ?? new Map<string, ParentDayAttendance>();
      const previous = days.get(row.date);
      const status = row.status as ParentClassAttendance["status"];
      const classes = [...(previous?.classes ?? []), { id: row.classSectionId, name: row.classSection.name, status }];
      days.set(row.date, { status: classes.every(c => c.status === status) ? status : "MIXED", classes: classes.sort((a,b) => a.name.localeCompare(b.name)) });
      result.set(row.studentId, days);
    }
  }
  return result;
}

/** Callers obtain child IDs through getParentWithChildren/resolveSelectedChild.
 * Tenancy remains in both queries; historical class/year status is unrestricted. */
export async function loadParentAttendanceSummary(tenantId: string, authorizedStudentIds: string[], dates: string[]) {
  if (!tenantId || authorizedStudentIds.length === 0 || dates.length === 0) return new Map<string, Map<string, ParentDayAttendance>>();
  const rows = await prisma.studentAttendance.findMany({
    where: { studentId: { in: authorizedStudentIds }, date: { in: dates }, isVoided: false, student: { tenantId }, classSection: { tenantId } },
    select: { studentId: true, classSectionId: true, date: true, sessionId: true, status: true, classSection: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (rows.length === 0) return new Map<string, Map<string, ParentDayAttendance>>();
  const sessions = await prisma.classSession.findMany({
    where: { classSectionId: { in: [...new Set(rows.map(r => r.classSectionId))] }, date: { in: dates }, classSection: { tenantId } },
    select: { id: true, classSectionId: true, date: true },
  });
  return summarizeParentAttendance(rows, sessions);
}
