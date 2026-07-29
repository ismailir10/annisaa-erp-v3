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

/**
 * Serialize async tasks per key: a task for a key starts only after the
 * previous task for that same key has settled. The client-side requestId
 * guard only orders what the *client* displays — without this, two rapid
 * taps on one cell race server-side and the DB keeps whichever write the
 * server happened to process last.
 */
export function enqueuePerKey(
  queues: Record<string, Promise<void> | undefined>,
  key: string,
  task: () => Promise<void>,
): Promise<void> {
  const run = (queues[key] ?? Promise.resolve()).then(task);
  const settled = run.catch(() => {});
  queues[key] = settled;
  void settled.then(() => {
    if (queues[key] === settled) delete queues[key];
  });
  return run;
}
