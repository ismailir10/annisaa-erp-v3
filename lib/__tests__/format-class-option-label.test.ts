import { describe, it, expect } from "vitest";
import { formatClassOptionLabel } from "@/lib/format";

describe("formatClassOptionLabel", () => {
  it("formats a full class with name, academic year, and occupancy", () => {
    expect(
      formatClassOptionLabel({
        name: "TK B 3",
        academicYearName: "2026/2027",
        enrolled: 10,
        capacity: 25,
      }),
    ).toBe("TK B 3 · TA 2026/2027 · 10/25");
  });

  it("renders zero enrolment as 0/25, not blank", () => {
    expect(
      formatClassOptionLabel({
        name: "KB A 1",
        academicYearName: "2026/2027",
        enrolled: 0,
        capacity: 25,
      }),
    ).toBe("KB A 1 · TA 2026/2027 · 0/25");
  });

  it("omits the TA segment entirely when academic year name is missing", () => {
    expect(
      formatClassOptionLabel({
        name: "TD 2",
        academicYearName: undefined,
        enrolled: 5,
        capacity: 20,
      }),
    ).toBe("TD 2 · 5/20");
  });

  it("omits the TA segment when academic year name is null", () => {
    expect(
      formatClassOptionLabel({
        name: "TD 2",
        academicYearName: null,
        enrolled: 5,
        capacity: 20,
      }),
    ).toBe("TD 2 · 5/20");
  });
});
