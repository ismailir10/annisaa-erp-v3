/**
 * class-picker-year-scoping cycle — Task 5, `groupClassSectionsByYear`.
 *
 * The Kelas filter on the export dialog is a read/filter surface over
 * historical data (unlike the write-path enroll/promote pickers), so it
 * legitimately keeps every academic year — it just needs to be organised
 * so the current year is obvious. This covers the grouping + ordering
 * logic directly rather than driving the actual `<Select>` popup open:
 * `components/ui/__tests__/select.test.tsx` never opens the base-ui Select
 * popup either (it only asserts the trigger's derived label), which is a
 * strong signal that DOM-level popup interaction isn't a reliable pattern
 * in this test environment. The pure function is where the real risk
 * (ordering: ACTIVE, then PLANNING, then ARCHIVED newest-first) lives, so
 * that's what's covered here.
 */
import { describe, it, expect } from "vitest";
import { groupClassSectionsByYear } from "../student-export-dialog";

const ACTIVE = { id: "y-2026", name: "2026/2027", status: "ACTIVE" };
const PLANNING = { id: "y-2027", name: "2027/2028", status: "PLANNING" };
const ARCHIVED_OLD = { id: "y-2021", name: "2021/2022", status: "ARCHIVED" };
const ARCHIVED_NEW = { id: "y-2025", name: "2025/2026", status: "ARCHIVED" };

describe("groupClassSectionsByYear", () => {
  it("groups sections under their academic year", () => {
    const groups = groupClassSectionsByYear([
      { id: "cs-1", name: "TK B 1", academicYear: ACTIVE, capacity: 25, _count: { enrollments: 10 } },
      { id: "cs-2", name: "TK B 2", academicYear: ACTIVE, capacity: 25, _count: { enrollments: 5 } },
      { id: "cs-3", name: "TK B 1", academicYear: ARCHIVED_OLD, capacity: 20, _count: { enrollments: 20 } },
    ]);

    expect(groups).toHaveLength(2);
    const activeGroup = groups.find((g) => g.year.id === ACTIVE.id);
    expect(activeGroup?.sections.map((s) => s.id)).toEqual(["cs-1", "cs-2"]);
    const archivedGroup = groups.find((g) => g.year.id === ARCHIVED_OLD.id);
    expect(archivedGroup?.sections.map((s) => s.id)).toEqual(["cs-3"]);
  });

  it("orders ACTIVE first, then PLANNING, then ARCHIVED newest-first", () => {
    const groups = groupClassSectionsByYear([
      { id: "cs-archived-old", name: "TK B 1", academicYear: ARCHIVED_OLD },
      { id: "cs-planning", name: "TK B 1", academicYear: PLANNING },
      { id: "cs-archived-new", name: "TK B 1", academicYear: ARCHIVED_NEW },
      { id: "cs-active", name: "TK B 1", academicYear: ACTIVE },
    ]);

    expect(groups.map((g) => g.year.id)).toEqual([
      ACTIVE.id,
      PLANNING.id,
      ARCHIVED_NEW.id,
      ARCHIVED_OLD.id,
    ]);
  });

  it("drops sections with no academic year rather than crashing", () => {
    const groups = groupClassSectionsByYear([
      { id: "cs-1", name: "TK B 1", academicYear: ACTIVE },
      { id: "cs-2", name: "TK B 2", academicYear: null },
      { id: "cs-3", name: "TK B 3" },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].sections.map((s) => s.id)).toEqual(["cs-1"]);
  });

  it("returns an empty array for an empty input", () => {
    expect(groupClassSectionsByYear([])).toEqual([]);
  });
});
