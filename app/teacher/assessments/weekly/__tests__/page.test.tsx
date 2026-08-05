import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/attendance/timezone", () => ({ getTodayInTimezone: () => "2026-08-03" }));
vi.mock("@/lib/curriculum/weekly-assessment-loader", () => ({ loadWeeklyAssessment: vi.fn() }));
import { normalizeWeeklyDate, WeeklyDateRecovery } from "../page";

describe("weekly date recovery", () => {
  it("submits a required date query to the weekly route", () => {
    render(<WeeklyDateRecovery date="2026-08-03" />);
    const form = screen.getByRole("button", { name: "Lihat penilaian" }).closest("form");
    expect(form).toHaveAttribute("action", "/teacher/assessments/weekly");
    expect(form).toHaveAttribute("method", "get");
    expect(screen.getByLabelText("Pilih tanggal lain")).toHaveAttribute("name", "date");
    expect(screen.getByLabelText("Pilih tanggal lain")).toHaveAttribute("required");
    expect(screen.getByLabelText("Pilih tanggal lain")).toHaveValue("2026-08-03");
  });

  it("normalizes blank and impossible date queries", () => {
    expect(normalizeWeeklyDate(undefined, "2026-08-03")).toBe("2026-08-03");
    expect(normalizeWeeklyDate("", "2026-08-03")).toBe("2026-08-03");
    expect(normalizeWeeklyDate("2026-02-30", "2026-08-03")).toBe("2026-08-03");
    expect(normalizeWeeklyDate("2026-08-03", "2026-01-01")).toBe("2026-08-03");
  });
});
