import { describe, it, expect } from "vitest";
import {
  STUDENT_EXPORT_COLUMNS,
  ALL_EXPORT_COLUMN_KEYS,
  selectExportColumns,
  escapeCsvCell,
  buildStudentCsv,
  type StudentExportRow,
} from "@/lib/students/export";

function row(overrides: Partial<StudentExportRow> = {}): StudentExportRow {
  return {
    name: "Aisyah Putri",
    nickname: "Aisyah",
    gender: "P",
    birthPlace: "Jakarta",
    dateOfBirth: "2020-03-15",
    status: "ACTIVE",
    nis: "001",
    nisn: "1234567890",
    nik: "3173000000000001",
    kkNumber: "3173111111111111",
    address: "Jl. Melati No. 1",
    livingWith: "ORANG_TUA",
    enrollments: [
      {
        enrollDate: "2025-07-01",
        classSection: {
          name: "TKIT A",
          program: { name: "Taman Kanak-kanak" },
          academicYear: { name: "2025/2026" },
        },
      },
    ],
    guardians: [{ parent: { name: "Budi Santoso", phone: "081200000000" } }],
    ...overrides,
  };
}

describe("escapeCsvCell", () => {
  it("wraps every cell in quotes", () => {
    expect(escapeCsvCell("hello")).toBe('"hello"');
  });

  it("doubles internal quotes", () => {
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("preserves commas and newlines inside quotes (no spillover)", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("guards formula-injection lead characters with an apostrophe", () => {
    expect(escapeCsvCell("=SUM(A1)")).toBe(`"'=SUM(A1)"`);
    expect(escapeCsvCell("+1")).toBe(`"'+1"`);
    expect(escapeCsvCell("-1")).toBe(`"'-1"`);
    expect(escapeCsvCell("@cmd")).toBe(`"'@cmd"`);
    expect(escapeCsvCell("\t=x")).toBe(`"'\t=x"`);
  });

  it("leaves safe leading characters untouched", () => {
    expect(escapeCsvCell("Aisyah")).toBe('"Aisyah"');
    expect(escapeCsvCell("081200000000")).toBe('"081200000000"');
  });
});

describe("selectExportColumns", () => {
  it("returns all columns in canonical order when no keys given", () => {
    expect(selectExportColumns().map((c) => c.key)).toEqual([...ALL_EXPORT_COLUMN_KEYS]);
    expect(selectExportColumns([]).map((c) => c.key)).toEqual([...ALL_EXPORT_COLUMN_KEYS]);
  });

  it("filters to requested keys but preserves canonical order, not request order", () => {
    const cols = selectExportColumns(["nisn", "name"]);
    expect(cols.map((c) => c.key)).toEqual(["name", "nisn"]);
  });

  it("ignores unknown keys", () => {
    expect(selectExportColumns(["name", "bogus"]).map((c) => c.key)).toEqual(["name"]);
  });
});

describe("buildStudentCsv", () => {
  it("emits a header-only CSV for empty rows (HTTP-200-safe)", () => {
    const csv = buildStudentCsv([], ["name", "nis"]);
    expect(csv).toBe('"Nama Lengkap","NIS"\r\n');
  });

  it("renders display labels for gender / status / livingWith", () => {
    const csv = buildStudentCsv([row()], ["gender", "status", "livingWith"]);
    const [, dataLine] = csv.trimEnd().split("\r\n");
    expect(dataLine).toBe('"Perempuan","Aktif","Orang Tua"');
  });

  it("pulls class/program/year/enrollDate from the first active enrollment", () => {
    const csv = buildStudentCsv([row()], ["classSection", "program", "academicYear", "enrollDate"]);
    const [, dataLine] = csv.trimEnd().split("\r\n");
    expect(dataLine).toBe('"TKIT A","Taman Kanak-kanak","2025/2026","2025-07-01"');
  });

  it("blanks enrollment + guardian columns when the student has none", () => {
    const csv = buildStudentCsv([row({ enrollments: [], guardians: [] })], [
      "classSection",
      "program",
      "guardianName",
      "guardianPhone",
    ]);
    const [, dataLine] = csv.trimEnd().split("\r\n");
    expect(dataLine).toBe('"","","",""');
  });

  it("uses CRLF line endings and a trailing newline", () => {
    const csv = buildStudentCsv([row()], ["name"]);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(2); // header + 1 row
  });

  it("registry covers all four column groups", () => {
    const groups = new Set(STUDENT_EXPORT_COLUMNS.map((c) => c.group));
    expect([...groups].sort()).toEqual(["compliance", "enrollment", "guardian", "identity"]);
  });
});
