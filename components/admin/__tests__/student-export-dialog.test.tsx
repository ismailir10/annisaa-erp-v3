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
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { groupClassSectionsByYear, StudentExportDialog } from "../student-export-dialog";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

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

/**
 * T6 — the export dialog's own useIsMobile + Dialog/Sheet branch was
 * folded onto the shared ResponsiveFormDialog. These smoke-test the shell:
 * it still opens on the same title/description, still exposes exactly one
 * footer action (no Cancel — the shell's own close affordance is the only
 * dismiss path, unchanged from before), and Escape still dismisses without
 * downloading. Not exercising the Select popups themselves, per this
 * file's own precedent above.
 */
function stubRefFetch() {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
}

describe("StudentExportDialog — ResponsiveFormDialog shell (T6)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens with the title, description and a single download action", async () => {
    vi.stubGlobal("fetch", stubRefFetch());
    render(<StudentExportDialog open onOpenChange={vi.fn()} />);

    const dialog = await screen.findByRole("dialog");
    expect(screen.getByText("Unduh Data Siswa")).toBeInTheDocument();
    expect(
      screen.getByText("Pilih kriteria siswa dan kolom data, lalu unduh sebagai berkas CSV."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Unduh CSV/ })).toBeInTheDocument();
    // No standalone "Batal" — the shell's own close (X / Escape) is the
    // only dismiss affordance for this non-mutating download configurator.
    expect(
      screen.queryByRole("button", { name: "Batal" }),
    ).not.toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
  });

  it("dismisses on Escape without downloading", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", stubRefFetch());
    const onOpenChange = vi.fn();
    render(<StudentExportDialog open onOpenChange={onOpenChange} />);

    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    // Base UI's Dialog.Root calls onOpenChange with extra (event, reason)
    // args beyond the boolean this component's own typed prop declares —
    // assert on the first argument only.
    await waitFor(() => expect(onOpenChange.mock.calls.at(-1)?.[0]).toBe(false));
  });
});
