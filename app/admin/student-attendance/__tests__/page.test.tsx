/**
 * Admin UI audit fixes (T7, finding #10) — the Kelas filter Select relied on
 * `<SelectValue placeholder="Kelas" />` as its only name, but
 * `classSectionFilter` defaults to "all", which always matches the "Semua
 * Kelas" item — so the placeholder never renders and the trigger has no
 * visible or programmatic name at all. The `Dari` / `Sampai` / `Bulan`
 * labels were `<span>`s sitting next to inputs with no `htmlFor`/`id`
 * association. `getByLabelText` only resolves a control through a real
 * label association — it does not fall back to nearby unassociated text.
 * Against the pre-fix markup every assertion below would throw
 * `Unable to find a label with the text of: ...`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import StudentAttendancePage from "../page";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const CLASS_SECTIONS = [
  {
    id: "cs-1",
    name: "TK B 1",
    academicYear: { id: "ay-1", name: "2026/2027", status: "ACTIVE" },
    capacity: 20,
    _count: { enrollments: 10 },
  },
];

function stubFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/class-sections")) {
      return Promise.resolve({
        ok: true,
        json: async () => CLASS_SECTIONS,
      } as Response);
    }
    if (url.includes("/api/student-attendance/stats")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ present: 0, absent: 0, sick: 0, permission: 0 }),
      } as Response);
    }
    if (url.includes("/api/student-attendance?")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });
}

describe("StudentAttendancePage — attendance filter accessible names (AC10)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", stubFetch());
  });

  it("resolves getByLabelText for the class filter and the date-range inputs", async () => {
    render(<StudentAttendancePage />);

    const classFilter = await screen.findByLabelText("Kelas");
    expect(classFilter).toBeInTheDocument();
    expect(classFilter.tagName).toBe("BUTTON");

    const dateFrom = screen.getByLabelText("Dari");
    expect(dateFrom).toHaveAttribute("type", "date");

    const dateTo = screen.getByLabelText("Sampai");
    expect(dateTo).toHaveAttribute("type", "date");
  });
});
