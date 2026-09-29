import type { GridState } from "@/lib/student-journal/optimistic-save";

/**
 * Class-level bulk fill for the daily journal (TCH-7).
 *
 * Everything here is pure: it decides *which cells change*, and the entry page
 * feeds those cells through the same optimistic + coalesced write path a single
 * tap uses. There is deliberately no second way to write a journal cell.
 */

export type BulkCategory = {
  id: string;
  name: string;
  indicators: { id: string; label: string }[];
};

/** What the bulk action applies to: every indicator, one category, or one indicator. */
export type BulkScope =
  | { kind: "all" }
  | { kind: "category"; categoryId: string }
  | { kind: "indicator"; indicatorId: string };

export type BulkCell = { studentId: string; indicatorId: string; checked: boolean };

export type BulkPlan = {
  /** The cells that will change, with their new value. Already-correct cells are omitted. */
  cells: BulkCell[];
  /** The same cells with the value they held before, in the same order — the undo snapshot. */
  previous: BulkCell[];
};

/** `<select>` value <-> scope. Ids are cuid-like, so a prefix is unambiguous. */
export function encodeBulkScope(scope: BulkScope): string {
  if (scope.kind === "category") return `cat:${scope.categoryId}`;
  if (scope.kind === "indicator") return `ind:${scope.indicatorId}`;
  return "all";
}

export function decodeBulkScope(value: string): BulkScope {
  if (value.startsWith("cat:")) return { kind: "category", categoryId: value.slice(4) };
  if (value.startsWith("ind:")) return { kind: "indicator", indicatorId: value.slice(4) };
  return { kind: "all" };
}

export function bulkScopeIndicatorIds(categories: BulkCategory[], scope: BulkScope): string[] {
  if (scope.kind === "all") return categories.flatMap((c) => c.indicators.map((i) => i.id));
  if (scope.kind === "category") {
    return categories.find((c) => c.id === scope.categoryId)?.indicators.map((i) => i.id) ?? [];
  }
  return categories.some((c) => c.indicators.some((i) => i.id === scope.indicatorId))
    ? [scope.indicatorId]
    : [];
}

/**
 * Cells that must change so every (student x indicator) in scope equals
 * `checked`. Cells that already hold the value are skipped: a re-apply writes
 * nothing, and the undo snapshot never contains cells the action did not touch.
 */
export function planBulkChange({
  categories,
  state,
  scope,
  studentIds,
  checked,
}: {
  categories: BulkCategory[];
  state: GridState;
  scope: BulkScope;
  studentIds: string[];
  checked: boolean;
}): BulkPlan {
  const indicatorIds = bulkScopeIndicatorIds(categories, scope);
  const cells: BulkCell[] = [];
  const previous: BulkCell[] = [];
  for (const studentId of studentIds) {
    for (const indicatorId of indicatorIds) {
      const current = state[studentId]?.[indicatorId] ?? false;
      if (current === checked) continue;
      cells.push({ studentId, indicatorId, checked });
      previous.push({ studentId, indicatorId, checked: current });
    }
  }
  return { cells, previous };
}

/**
 * Cells to restore when the teacher taps "Batalkan". A cell she has edited by
 * hand since the bulk action (its value no longer equals what the bulk wrote)
 * is left alone: undo reverts the bulk gesture, not later work.
 */
export function planBulkUndo(state: GridState, plan: BulkPlan): BulkCell[] {
  const restore: BulkCell[] = [];
  plan.cells.forEach((applied, i) => {
    const current = state[applied.studentId]?.[applied.indicatorId] ?? false;
    if (current === applied.checked) restore.push(plan.previous[i]);
  });
  return restore;
}

/** Split a list into request-sized pieces (last one may be shorter). */
export function chunkItems<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new RangeError("chunk size must be >= 1");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Entries per POST. The server rejects more than `JOURNAL_BATCH_MAX_ENTRIES`;
 * the client stays well under it so one request's transaction (an upsert + an
 * audit row per entry) finishes comfortably inside its timeout on a cold pooler.
 */
export const JOURNAL_BATCH_CHUNK = 100;
