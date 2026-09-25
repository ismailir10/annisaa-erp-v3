/** Match the classroom mark endpoint. Single-session days share its row;
 * multi-session pickup records do not stand in for the classroom daily mark.
 * Pass records newest-first for deterministic legacy fallback. */
export function classroomAttendanceByStudent<T extends {studentId:string;sessionId:string|null}>(records:T[], sessionIds:string[]): Map<string,T> {
  const single = sessionIds.length === 1 ? sessionIds[0] : null;
  const selected = new Map<string,T>();
  for (const record of records) {
    if (record.sessionId !== null && record.sessionId !== single) continue;
    const current = selected.get(record.studentId);
    if (!current || (single && current.sessionId === null && record.sessionId === single)) selected.set(record.studentId,record);
  }
  return selected;
}
