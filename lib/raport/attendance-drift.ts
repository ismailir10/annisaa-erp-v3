/**
 * ACAD-2: has the live presensi moved away from the attendance snapshot stored
 * on a saved raport? Pure so the editor and its tests share one rule.
 */
export type RaportAttendanceCounts = {
  permittedAbsenceDays: number;
  sickDays: number;
  unexcusedAbsenceDays: number;
  totalSchoolDays: number;
};

const FIELDS: (keyof RaportAttendanceCounts)[] = [
  "permittedAbsenceDays",
  "sickDays",
  "unexcusedAbsenceDays",
  "totalSchoolDays",
];

export function attendanceDrifted(
  saved: Partial<RaportAttendanceCounts> | null | undefined,
  live: Partial<RaportAttendanceCounts> | null | undefined,
): boolean {
  if (!saved || !live) return false;
  return FIELDS.some((f) => Number(saved[f] ?? 0) !== Number(live[f] ?? 0));
}

/** "Sakit 1 · Izin 1 · Alpa 0 · dari 2 hari sekolah" */
export function describeAttendance(a: Partial<RaportAttendanceCounts>): string {
  return `Sakit ${a.sickDays ?? 0} · Izin ${a.permittedAbsenceDays ?? 0} · Alpa ${a.unexcusedAbsenceDays ?? 0} · dari ${a.totalSchoolDays ?? 0} hari sekolah`;
}
