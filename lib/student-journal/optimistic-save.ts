/** state[studentId][indicatorId] = checked */
export type GridState = Record<string, Record<string, boolean>>;

export function getJournalCellKey(studentId: string, indicatorId: string) {
  return `${studentId}:${indicatorId}`;
}

export function applyJournalCellValue(
  state: GridState,
  studentId: string,
  indicatorId: string,
  checked: boolean,
): GridState {
  return {
    ...state,
    [studentId]: {
      ...(state[studentId] ?? {}),
      [indicatorId]: checked,
    },
  };
}

export function shouldApplyJournalSaveResult(
  latestRequestIds: Record<string, number | undefined>,
  cellKey: string,
  requestId: number,
) {
  return latestRequestIds[cellKey] === requestId;
}
