import { describe, it, expect } from "vitest";
import { formatAgeFromDob } from "./age";

describe("formatAgeFromDob", () => {
  it("returns null for missing input", () => {
    expect(formatAgeFromDob(null)).toBeNull();
    expect(formatAgeFromDob(undefined)).toBeNull();
    expect(formatAgeFromDob("")).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(formatAgeFromDob("15/03/2020")).toBeNull();
    expect(formatAgeFromDob("2020-3-15")).toBeNull();
    expect(formatAgeFromDob("not-a-date")).toBeNull();
    expect(formatAgeFromDob("2020-13-01")).toBeNull(); // bogus month
    expect(formatAgeFromDob("2020-02-32")).toBeNull(); // bogus day
  });

  it("returns null for future DOB", () => {
    const ref = new Date("2026-05-11T00:00:00Z");
    expect(formatAgeFromDob("2030-01-01", ref)).toBeNull();
  });

  it('renders "<n> tahun" when on exact birthday year', () => {
    const ref = new Date("2026-05-11T00:00:00Z");
    expect(formatAgeFromDob("2020-05-11", ref)).toBe("6 tahun");
    expect(formatAgeFromDob("2020-05-10", ref)).toBe("6 tahun"); // day after birthday
  });

  it('renders "<n> tahun <m> bulan" mid-year', () => {
    const ref = new Date("2026-05-11T00:00:00Z");
    expect(formatAgeFromDob("2020-02-11", ref)).toBe("6 tahun 3 bulan");
    expect(formatAgeFromDob("2022-08-11", ref)).toBe("3 tahun 9 bulan");
  });

  it('renders "<m> bulan" for under-1 year olds', () => {
    const ref = new Date("2026-05-11T00:00:00Z");
    expect(formatAgeFromDob("2025-11-11", ref)).toBe("6 bulan");
    expect(formatAgeFromDob("2026-02-11", ref)).toBe("3 bulan");
    expect(formatAgeFromDob("2026-05-11", ref)).toBe("0 bulan"); // same day
  });

  it("subtracts a year correctly when current month is before birth month", () => {
    const ref = new Date("2026-03-11T00:00:00Z");
    expect(formatAgeFromDob("2020-05-11", ref)).toBe("5 tahun 10 bulan");
  });

  it("subtracts a month correctly when current day is before birth day", () => {
    const ref = new Date("2026-05-10T00:00:00Z");
    expect(formatAgeFromDob("2020-05-15", ref)).toBe("5 tahun 11 bulan");
  });

  it("handles leap-year DOB without crashing", () => {
    const ref = new Date("2026-05-11T00:00:00Z");
    expect(formatAgeFromDob("2020-02-29", ref)).toBe("6 tahun 2 bulan");
  });
});
