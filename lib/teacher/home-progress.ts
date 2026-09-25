export type JournalProgressInput = {
  studentIds: string[];
  indicatorIds: string[];
  entries: { studentId: string; indicatorId: string; checked: boolean }[];
};

/** Count complete pupils, not interchangeable ticks. Ignore retired indicators,
 * duplicate rows, and pupils who no longer belong to the active roster. */
export function getJournalProgress({ studentIds, indicatorIds, entries }: JournalProgressInput) {
  const roster = new Set(studentIds);
  const indicators = new Set(indicatorIds);
  const checked = new Map<string, Set<string>>();
  for (const entry of entries) {
    if (!entry.checked || !roster.has(entry.studentId) || !indicators.has(entry.indicatorId)) continue;
    const row = checked.get(entry.studentId) ?? new Set<string>();
    row.add(entry.indicatorId);
    checked.set(entry.studentId, row);
  }
  const configured = indicators.size > 0;
  const completeStudents = configured
    ? [...roster].filter(id => checked.get(id)?.size === indicators.size).length : 0;
  return { configured, totalStudents: roster.size, completeStudents,
    completed: configured && roster.size > 0 && completeStudents === roster.size };
}

export function resolveTeacherDate(raw: string | null | undefined, fallback: string) {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  const parsed = new Date(`${raw}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw ? raw : fallback;
}

export type TeacherClassSummary = {
  id: string;
  name: string;
  rosterCount: number;
  attendanceRecorded: number | null;
  journal: ReturnType<typeof getJournalProgress> | null;
  replies: { studentId: string; studentName: string; count: number }[] | null;
  slot: string | null;
};
export type TeacherSessionSummary = { id: string; slot: string; className: string; rosterCount: number };

/** Slots have no clock times in the domain: prioritize the relevant half-day,
 * then full-day and upcoming work, without inventing a precise schedule. */
export function teacherSlotRank(slot: string | null, hour: number) {
  const order = hour < 12 ? ['MORNING', 'FULL_DAY', 'AFTERNOON'] : ['AFTERNOON', 'FULL_DAY', 'MORNING'];
  return slot ? order.indexOf(slot) < 0 ? 3 : order.indexOf(slot) : 3;
}
