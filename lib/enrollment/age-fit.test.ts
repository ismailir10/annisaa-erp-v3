import { describe, it, expect } from "vitest";
import { evaluateAgeFit } from "./age-fit";

describe("evaluateAgeFit", () => {
  it("dead-branch regression: ageMin null + ageMax set is still checked (old code's outer `ageMin` guard made this branch dead)", () => {
    // dob giving exactly 60 months at the reference date
    const result = evaluateAgeFit({
      dob: "2020-07-14",
      referenceDate: "2025-07-14",
      ageMin: null,
      ageMax: 48,
      programName: "KB",
    });
    expect(result.ageMonths).toBe(60);
    expect(result.status).toBe("ABOVE_MAX");
  });

  it("ageMax null + ageMin set: a 24-month child is BELOW_MIN", () => {
    const result = evaluateAgeFit({
      dob: "2023-07-14",
      referenceDate: "2025-07-14",
      ageMin: 36,
      ageMax: null,
      programName: "TKIT-A",
    });
    expect(result.ageMonths).toBe(24);
    expect(result.status).toBe("BELOW_MIN");
  });

  it("exactly ageMin is OK (inclusive boundary)", () => {
    const result = evaluateAgeFit({
      dob: "2022-07-14",
      referenceDate: "2025-07-14", // exactly 36 months
      ageMin: 36,
      ageMax: 48,
      programName: "KB",
    });
    expect(result.ageMonths).toBe(36);
    expect(result.status).toBe("OK");
    expect(result.message).toBeNull();
  });

  it("exactly ageMax is OK (inclusive boundary)", () => {
    const result = evaluateAgeFit({
      dob: "2021-07-14",
      referenceDate: "2025-07-14", // exactly 48 months
      ageMin: 36,
      ageMax: 48,
      programName: "KB",
    });
    expect(result.ageMonths).toBe(48);
    expect(result.status).toBe("OK");
    expect(result.message).toBeNull();
  });

  it("one month below min is BELOW_MIN", () => {
    const result = evaluateAgeFit({
      dob: "2022-08-14",
      referenceDate: "2025-07-14", // 35 months
      ageMin: 36,
      ageMax: 48,
      programName: "KB",
    });
    expect(result.ageMonths).toBe(35);
    expect(result.status).toBe("BELOW_MIN");
  });

  it("one month above max is ABOVE_MAX", () => {
    const result = evaluateAgeFit({
      dob: "2021-06-14",
      referenceDate: "2025-07-14", // 49 months
      ageMin: 36,
      ageMax: 48,
      programName: "KB",
    });
    expect(result.ageMonths).toBe(49);
    expect(result.status).toBe("ABOVE_MAX");
  });

  it("missing dob is UNKNOWN with a null message and never blocks", () => {
    const result = evaluateAgeFit({
      dob: null,
      referenceDate: "2025-07-14",
      ageMin: 36,
      ageMax: 48,
      programName: "KB",
    });
    expect(result.ageMonths).toBeNull();
    expect(result.status).toBe("UNKNOWN");
    expect(result.message).toBeNull();
  });

  it("unparseable dob is also UNKNOWN with a null message", () => {
    const result = evaluateAgeFit({
      dob: "not-a-date",
      referenceDate: "2025-07-14",
      ageMin: 36,
      ageMax: 48,
      programName: "KB",
    });
    expect(result.ageMonths).toBeNull();
    expect(result.status).toBe("UNKNOWN");
    expect(result.message).toBeNull();
  });

  it("both bounds null is OK", () => {
    const result = evaluateAgeFit({
      dob: "2022-01-01",
      referenceDate: "2025-07-14",
      ageMin: null,
      ageMax: null,
      programName: "Pop Up Class",
    });
    expect(result.status).toBe("OK");
    expect(result.message).toBeNull();
  });

  it("message is non-null and names the program for BELOW_MIN", () => {
    const result = evaluateAgeFit({
      dob: "2023-07-14",
      referenceDate: "2025-07-14",
      ageMin: 36,
      ageMax: 48,
      programName: "KB",
    });
    expect(result.status).toBe("BELOW_MIN");
    expect(result.message).not.toBeNull();
    expect(result.message).toContain("KB");
  });

  it("message is non-null and names the program for ABOVE_MAX", () => {
    const result = evaluateAgeFit({
      dob: "2020-07-14",
      referenceDate: "2025-07-14",
      ageMin: null,
      ageMax: 48,
      programName: "KB",
    });
    expect(result.status).toBe("ABOVE_MAX");
    expect(result.message).not.toBeNull();
    expect(result.message).toContain("KB");
  });

  it("realistic staging case: 50-month child against TKIT-B's 60-72 band is BELOW_MIN", () => {
    // dob chosen to land at exactly 50 months on 2025-07-14
    const result = evaluateAgeFit({
      dob: "2021-05-14",
      referenceDate: "2025-07-14",
      ageMin: 60,
      ageMax: 72,
      programName: "TKIT-B",
    });
    expect(result.ageMonths).toBe(50);
    expect(result.status).toBe("BELOW_MIN");
    expect(result.message).toContain("TKIT-B");
  });
});
