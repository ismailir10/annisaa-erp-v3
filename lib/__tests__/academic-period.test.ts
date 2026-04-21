import { describe, it, expect } from "vitest";
import { getCurrentPeriod } from "@/lib/academic-period";

describe("getCurrentPeriod", () => {
  it("returns Semester 1 for July (academic year start)", () => {
    expect(getCurrentPeriod(new Date(2025, 6, 15))).toBe("Semester 1 2025/2026");
  });

  it("returns Semester 1 for December", () => {
    expect(getCurrentPeriod(new Date(2025, 11, 20))).toBe("Semester 1 2025/2026");
  });

  it("returns Semester 2 for January (still prior academic year)", () => {
    expect(getCurrentPeriod(new Date(2026, 0, 10))).toBe("Semester 2 2025/2026");
  });
});
