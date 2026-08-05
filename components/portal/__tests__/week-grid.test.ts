import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { isWeekGridDateEditable, WeekGrid } from "../week-grid";

describe("isWeekGridDateEditable", () => {
  const today = "2026-07-30";

  it("lets admin correction mode edit past dates but not future dates", () => {
    expect(isWeekGridDateEditable("2026-07-29", today, false)).toBe(true);
    expect(isWeekGridDateEditable(today, today, false)).toBe(true);
    expect(isWeekGridDateEditable("2026-07-31", today, false)).toBe(false);
  });

  it("keeps parent anti-backfill mode limited to today", () => {
    expect(isWeekGridDateEditable("2026-07-29", today, true)).toBe(false);
    expect(isWeekGridDateEditable(today, today, true)).toBe(true);
  });

  it("uses explicit non-editable history glyphs in readonly mode", () => {
    render(createElement(WeekGrid, {
      categories: [{ id: "cat", name: "Kemandirian", scope: "SCHOOL", indicators: [{ id: "ind", label: "Merapi", order: 1 }] }],
      entries: [{ indicatorId: "ind", date: "2026-07-29", checked: true }],
      dates: ["2026-07-29", "2026-07-30"],
    }));

    expect(screen.getByRole("img", { name: "Merapi 2026-07-29 — diisi (hanya-baca)" })).toHaveTextContent("✓");
    expect(screen.getByRole("img", { name: "Merapi 2026-07-30 — belum diisi (hanya-baca)" })).toHaveTextContent("—");
    expect(screen.queryByRole("button", { name: /Merapi/ })).toBeNull();
  });
});
