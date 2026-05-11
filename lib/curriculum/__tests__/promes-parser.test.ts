import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  detectElementHeader,
  inferAgeGroup,
  parsePromesWorkbook,
  PromesParseError,
} from "../promes-parser";

const FIXTURE_DIR = resolve(__dirname, "..", "__fixtures__");
const TK_A_BUF = readFileSync(resolve(FIXTURE_DIR, "promes-tk-a-smt-1.xlsx"));
const TK_B_BUF = readFileSync(resolve(FIXTURE_DIR, "promes-tk-b-smt-1.xlsx"));

describe("detectElementHeader", () => {
  it.each([
    ["NAM PROGRAM SEMESTER 1", "RELIGIOUS_MORAL"],
    ["nam program semester 1", "RELIGIOUS_MORAL"],
    ["NILAI AGAMA DAN BUDI PEKERTI PROGRAM SEMESTER 1", "RELIGIOUS_MORAL"],
    ["JATI DIRI PROGRAM SEMESTER 1", "IDENTITY"],
    ["jati diri program semester 1", "IDENTITY"],
    ["STEAM / LITERASI PROGRAM SEMESTER 1", "STEAM"],
    ["LITERASI PROGRAM SEMESTER 1", "STEAM"],
    ["Motorik Program Semester 1", "MOTOR_SKILLS"],
    ["MOTORIK PROGRAM SEMESTER 1", "MOTOR_SKILLS"],
    ["SENI PROGRAM SEMESTER 1", "ART"],
    ["seni program semester 1", "ART"],
  ])("matches '%s' → %s", (input, expected) => {
    expect(detectElementHeader(input)).toBe(expected);
  });

  it("returns null for the workbook title row (no alias word)", () => {
    expect(
      detectElementHeader("PROGRAM SEMESTER TK A SEMESTER 1"),
    ).toBeNull();
  });

  it("returns null for the column header row", () => {
    expect(detectElementHeader("NO")).toBeNull();
    expect(detectElementHeader("CAPAIAN PERKEMBANGAN DIRI")).toBeNull();
  });

  it("does not match 'NAM' inside a longer word like 'PROGRAM'", () => {
    // 'PROGRAM' contains 'AM' but not 'NAM' as a word; ensure word-boundary.
    expect(detectElementHeader("PROGRAM SEMESTER")).toBeNull();
  });

  it("returns null for empty or whitespace-only input", () => {
    expect(detectElementHeader("")).toBeNull();
    expect(detectElementHeader("   ")).toBeNull();
    expect(detectElementHeader(null)).toBeNull();
    expect(detectElementHeader(undefined)).toBeNull();
  });
});

describe("inferAgeGroup", () => {
  async function loadWorkbook(buf: Buffer): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    return wb;
  }

  it("infers A from filename 'PROMES TK A SMT 1.xlsx'", async () => {
    const wb = await loadWorkbook(TK_A_BUF);
    expect(inferAgeGroup(wb, "PROMES TK A SMT 1.xlsx")).toBe("A");
  });

  it("infers B from filename 'promes tk b smt 1.xlsx'", async () => {
    const wb = await loadWorkbook(TK_B_BUF);
    expect(inferAgeGroup(wb, "promes tk b smt 1.xlsx")).toBe("B");
  });

  it("falls back to sheet content when filename absent", async () => {
    const wb = await loadWorkbook(TK_A_BUF);
    expect(inferAgeGroup(wb)).toBe("A");
  });

  it("returns null when neither filename nor sheet content hints", async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("plain");
    sheet.addRow(["unrelated content"]);
    sheet.addRow(["some other text"]);
    expect(inferAgeGroup(wb)).toBeNull();
    expect(inferAgeGroup(wb, "untitled.xlsx")).toBeNull();
  });
});

describe("parsePromesWorkbook — TK A fixture", () => {
  it("parses 5 elements, each with 3 TPs × 2 IKTPs (30 IKTPs total)", async () => {
    const parsed = await parsePromesWorkbook(TK_A_BUF, {
      filename: "PROMES TK A SMT 1.xlsx",
    });
    expect(Object.keys(parsed.byElement).sort()).toEqual([
      "ART",
      "IDENTITY",
      "MOTOR_SKILLS",
      "RELIGIOUS_MORAL",
      "STEAM",
    ]);
    for (const element of [
      "RELIGIOUS_MORAL",
      "IDENTITY",
      "STEAM",
      "MOTOR_SKILLS",
      "ART",
    ] as const) {
      const objectives = parsed.byElement[element];
      expect(objectives).toBeDefined();
      expect(objectives!.length).toBe(3);
      for (const obj of objectives!) {
        expect(obj.indicators.length).toBe(2);
      }
    }
    const total = Object.values(parsed.byElement).reduce(
      (sum, objs) =>
        sum + (objs ?? []).reduce((s, o) => s + o.indicators.length, 0),
      0,
    );
    expect(total).toBe(30);
  });

  it("returns inferredAgeGroup='A' from the filename hint", async () => {
    const parsed = await parsePromesWorkbook(TK_A_BUF, {
      filename: "PROMES TK A SMT 1.xlsx",
    });
    expect(parsed.inferredAgeGroup).toBe("A");
  });

  it("trims leading + trailing whitespace from TP content (NAM TP1 sentinel)", async () => {
    const parsed = await parsePromesWorkbook(TK_A_BUF);
    const tp1 = parsed.byElement.RELIGIOUS_MORAL?.find((o) => o.number === 1);
    expect(tp1).toBeDefined();
    // Source-of-truth in scripts/build-promes-fixtures.ts ships this cell
    // as "  Anak mengenal rukun iman dan rukun Islam dasar  " — the parser
    // must strip both leading and trailing whitespace.
    expect(tp1!.content).toBe(
      "Anak mengenal rukun iman dan rukun Islam dasar",
    );
    expect(tp1!.content.startsWith(" ")).toBe(false);
    expect(tp1!.content.endsWith(" ")).toBe(false);
  });

  it("preserves embedded comma noise in STEAM IKTP1.2 (merged-cell artefact)", async () => {
    const parsed = await parsePromesWorkbook(TK_A_BUF);
    const steamTp1 = parsed.byElement.STEAM?.find((o) => o.number === 1);
    expect(steamTp1).toBeDefined();
    expect(steamTp1!.indicators[1].content).toContain(",");
    expect(steamTp1!.indicators[1].content).toBe(
      "Memasangkan lambang bilangan, dengan jumlah benda",
    );
  });

  it("assigns monotone 1-indexed order within each parent objective", async () => {
    const parsed = await parsePromesWorkbook(TK_A_BUF);
    for (const objs of Object.values(parsed.byElement)) {
      for (const obj of objs ?? []) {
        expect(obj.indicators.map((i) => i.order)).toEqual([1, 2]);
      }
    }
  });

  it("extracts theme links per IKTP from TRUE markers", async () => {
    const parsed = await parsePromesWorkbook(TK_A_BUF);
    // NAM TP1 IKTP1 = themeLinks ["Saya Anak Sehat", "Aku Berakhlak"]
    const nam = parsed.byElement.RELIGIOUS_MORAL;
    expect(nam?.[0].indicators[0].themeNames).toEqual([
      "Saya Anak Sehat",
      "Aku Berakhlak",
    ]);
    // NAM TP1 IKTP2 = themeLinks ["Aku Berakhlak"]
    expect(nam?.[0].indicators[1].themeNames).toEqual(["Aku Berakhlak"]);
  });

  it("matches the mixed-case 'Motorik Program Semester 1' element header", async () => {
    const parsed = await parsePromesWorkbook(TK_A_BUF);
    expect(parsed.byElement.MOTOR_SKILLS?.length).toBe(3);
    // Confirm the first TP under MOTOR_SKILLS picked up its CAPAIAN.
    expect(parsed.byElement.MOTOR_SKILLS?.[0].competencyText).toBe(
      "Mengembangkan motorik kasar",
    );
  });

  it("matches the compound alias 'STEAM / LITERASI'", async () => {
    const parsed = await parsePromesWorkbook(TK_A_BUF);
    expect(parsed.byElement.STEAM?.length).toBe(3);
    expect(parsed.byElement.STEAM?.[0].competencyText).toBe(
      "Mengenal angka dan jumlah",
    );
  });
});

describe("parsePromesWorkbook — TK B fixture", () => {
  it("parses 5 elements × 3 TPs × 2 IKTPs from canonical 'NILAI AGAMA DAN BUDI PEKERTI' alias", async () => {
    const parsed = await parsePromesWorkbook(TK_B_BUF, {
      filename: "PROMES TK B SMT 1.xlsx",
    });
    expect(parsed.byElement.RELIGIOUS_MORAL?.length).toBe(3);
    expect(parsed.inferredAgeGroup).toBe("B");
    // Verify the canonical TK B alias path (a different match branch than TK A's "NAM").
    expect(parsed.byElement.RELIGIOUS_MORAL?.[0].content).toBe(
      "Anak mengenal sifat wajib Allah dan kisah para nabi",
    );
  });
});

describe("parsePromesWorkbook — merged-cell hazard guards", () => {
  it("does NOT promote an IKTP row to a TP when col A has a stray digit but col B is empty", async () => {
    // Simulate the ExcelJS merged-cell hazard: an IKTP row that
    // accidentally carries a digit in col A (e.g. footnote ref, merged-
    // cell expansion remnant) but no CAPAIAN text in col B. The parser
    // must keep treating this as an IKTP, not as a phantom TP.
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("PROMES");
    sheet.addRow(["NAM PROGRAM SEMESTER 1"]);
    sheet.addRow([
      "NO",
      "CAPAIAN PERKEMBANGAN DIRI",
      "TUJUAN PEMBELAJARAN",
      "INDIKATOR KETERCAPAIAN TP",
      "Saya Anak Sehat",
    ]);
    sheet.addRow([1, "Cap 1", "TP 1 content", ""]);
    sheet.addRow(["", "", "", "First IKTP under TP 1"]);
    // Hazard row — col A has a digit, col B empty, col C carries text
    // that would mimic a merged-cell artefact. Without the col-B guard
    // this would become a phantom TP and orphan the next IKTP.
    sheet.addRow([2, "", "leftover merged text", ""]);
    sheet.addRow(["", "", "", "Second IKTP under TP 1, not under phantom"]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const parsed = await parsePromesWorkbook(buf);
    // Should still see exactly one TP under NAM.
    expect(parsed.byElement.RELIGIOUS_MORAL?.length).toBe(1);
    const tp1 = parsed.byElement.RELIGIOUS_MORAL?.[0];
    expect(tp1?.number).toBe(1);
    // Both IKTPs land under TP 1.
    expect(tp1?.indicators.map((i) => i.content)).toEqual([
      "First IKTP under TP 1",
      "Second IKTP under TP 1, not under phantom",
    ]);
  });
});

describe("parsePromesWorkbook — error paths", () => {
  it("throws EMPTY_WORKBOOK on a non-xlsx buffer", async () => {
    const garbage = Buffer.from("not an xlsx file at all", "utf8");
    await expect(parsePromesWorkbook(garbage)).rejects.toMatchObject({
      code: "EMPTY_WORKBOOK",
    });
  });

  it("throws EMPTY_WORKBOOK on a valid workbook with zero recognised elements", async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("plain");
    sheet.addRow(["random title"]);
    sheet.addRow(["NO", "CAPAIAN PERKEMBANGAN DIRI", "TUJUAN", "INDIKATOR"]);
    sheet.addRow([1, "stuff", "stuff", ""]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(parsePromesWorkbook(buf)).rejects.toThrow(PromesParseError);
    await expect(parsePromesWorkbook(buf)).rejects.toMatchObject({
      code: "EMPTY_WORKBOOK",
    });
  });

  it("PromesParseError carries an Indonesian userMessage", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("plain").addRow(["random title"]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    try {
      await parsePromesWorkbook(buf);
      throw new Error("expected parser to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(PromesParseError);
      expect((err as PromesParseError).userMessage).toMatch(/Berkas/);
    }
  });
});
