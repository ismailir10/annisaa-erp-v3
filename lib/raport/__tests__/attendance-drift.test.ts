import { describe, it, expect } from "vitest";
import { attendanceDrifted, describeAttendance } from "../attendance-drift";

const saved = { permittedAbsenceDays: 1, sickDays: 1, unexcusedAbsenceDays: 0, totalSchoolDays: 2 };

describe("attendanceDrifted (ACAD-2)", () => {
  it("is false when the live counts equal the snapshot", () => {
    expect(attendanceDrifted(saved, { ...saved })).toBe(false);
  });
  it("is true when any one of the four counts moved", () => {
    expect(attendanceDrifted(saved, { ...saved, sickDays: 0 })).toBe(true);
    expect(attendanceDrifted(saved, { ...saved, totalSchoolDays: 3 })).toBe(true);
  });
  it("is false with nothing saved (a new raport is prefilled from live data anyway)", () => {
    expect(attendanceDrifted(null, saved)).toBe(false);
  });
  it("formats the counts for the banner", () => {
    expect(describeAttendance(saved)).toBe("Sakit 1 · Izin 1 · Alpa 0 · dari 2 hari sekolah");
  });
});
