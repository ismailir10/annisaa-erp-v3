import { describe, it, expect } from "vitest";
import {
  buildReportSections,
  buildReportCardData,
  formatTermLabel,
  SECTION_ORDER,
} from "@/lib/raport/build";

describe("buildReportSections", () => {
  it("returns all 8 sections in canonical order", () => {
    const sections = buildReportSections({}, {});
    expect(sections).toHaveLength(8);
    expect(sections.map((s) => s.label)).toEqual([
      "Pembukaan",
      "Nilai Agama & Budi Pekerti",
      "Jati Diri",
      "STEAM / Literasi",
      "Unjuk Kerja",
      "Penutup",
      "Rencana Tindak Lanjut",
      "Kegiatan Disarankan di Rumah",
    ]);
  });

  it("formats level-bearing sections with Indonesian long-form labels", () => {
    const sections = buildReportSections(
      { RELIGIOUS_MORAL: "CONSISTENT", IDENTITY: "EMERGING", STEAM: "NEEDS_REINFORCEMENT" },
      {},
    );
    const byLabel = Object.fromEntries(sections.map((s) => [s.label, s.level]));
    expect(byLabel["Nilai Agama & Budi Pekerti"]).toBe("Mampu dan Konsisten");
    expect(byLabel["Jati Diri"]).toBe("Mampu Belum Konsisten");
    expect(byLabel["STEAM / Literasi"]).toBe("Perlu Penguatan");
  });

  it("never attaches a level to INTRODUCTION or closing sections", () => {
    const sections = buildReportSections(
      // even if a stray level leaks into a non-level-bearing key, it is dropped
      { INTRODUCTION: "CONSISTENT", CLOSING: "CONSISTENT" } as Record<string, unknown>,
      {},
    );
    const byLabel = Object.fromEntries(sections.map((s) => [s.label, s.level]));
    expect(byLabel["Pembukaan"]).toBeNull();
    expect(byLabel["Penutup"]).toBeNull();
  });

  it("passes narratives through and defaults missing ones to empty string", () => {
    const sections = buildReportSections({}, { RELIGIOUS_MORAL: "Ananda rajin berdoa." });
    const byLabel = Object.fromEntries(sections.map((s) => [s.label, s.narrative]));
    expect(byLabel["Nilai Agama & Budi Pekerti"]).toBe("Ananda rajin berdoa.");
    expect(byLabel["Jati Diri"]).toBe("");
  });

  it("drops an unknown level to null rather than echoing the raw code", () => {
    const sections = buildReportSections({ STEAM: "BOGUS" } as Record<string, unknown>, {});
    const steam = sections.find((s) => s.label === "STEAM / Literasi");
    expect(steam?.level).toBeNull();
  });

  it("tolerates null/undefined input maps", () => {
    expect(buildReportSections(null, undefined)).toHaveLength(8);
  });
});

describe("formatTermLabel", () => {
  it("joins term, semester, academic year", () => {
    expect(formatTermLabel(1, 1, "2025/2026")).toBe("Triwulan 1 · Semester 1 · 2025/2026");
  });
});

describe("buildReportCardData", () => {
  const base = {
    schoolName: "TKIT Demo",
    studentName: "Ahmad",
    className: "TKIT A",
    termNumber: 1,
    semesterNumber: 1,
    academicYear: "2025/2026",
    entry: {
      sectionLevels: { RELIGIOUS_MORAL: "CONSISTENT" },
      sectionNarratives: { RELIGIOUS_MORAL: "Berkembang baik." },
      sickDays: 2,
      permittedAbsenceDays: 1,
      unexcusedAbsenceDays: 0,
      totalSchoolDays: 60,
      memorizationNotes: "An-Naba 1-10",
    },
    measurement: { heightCm: 110.5, weightKg: 18.2 },
  };

  it("maps entry fields, attendance, measurements, and term label", () => {
    const data = buildReportCardData(base);
    expect(data.schoolName).toBe("TKIT Demo");
    expect(data.studentName).toBe("Ahmad");
    expect(data.className).toBe("TKIT A");
    expect(data.termLabel).toBe("Triwulan 1 · Semester 1 · 2025/2026");
    expect(data.attendance).toEqual({ sick: 2, permitted: 1, unexcused: 0, total: 60 });
    expect(data.hafalan).toBe("An-Naba 1-10");
    expect(data.height).toBe("110.5");
    expect(data.weight).toBe("18.2");
    expect(data.sections).toHaveLength(8);
    expect(data.generatedDate).toBeTruthy();
  });

  it("nulls out missing measurements", () => {
    const data = buildReportCardData({ ...base, measurement: null });
    expect(data.height).toBeNull();
    expect(data.weight).toBeNull();
  });
});

describe("SECTION_ORDER", () => {
  it("is the 5 bucketed + 3 closing sections", () => {
    expect(SECTION_ORDER).toHaveLength(8);
  });
});
