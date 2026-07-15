import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseKelasSheet, findKelasSheet, listKelasSheetCodes } from "../parse-xlsx";

/**
 * Builds an "A/B-style" sheet (no leading offset — col A carries "No.")
 * with a Tinggal column, matching `Data A1`/`Data A2` in the real
 * workbook. Header super-row at row 2, sub-row at row 3, data from row 4.
 */
function buildOffset0Sheet(workbook: ExcelJS.Workbook, name: string) {
  const sheet = workbook.addWorksheet(`Data ${name}`);

  sheet.getRow(1).values = [undefined, "TAHUN AJARAN 2025/2026"];

  const superRow = sheet.getRow(2);
  superRow.getCell(1).value = "No.";
  superRow.getCell(2).value = "NIS";
  superRow.getCell(3).value = "NISN";
  superRow.getCell(4).value = "Nama Peserta Didik";
  superRow.getCell(5).value = "Nama Peserta Didik";
  superRow.getCell(6).value = "L/P";
  superRow.getCell(7).value = "Kelahiran";
  superRow.getCell(8).value = "Kelahiran";
  superRow.getCell(9).value = "No. NIK";
  superRow.getCell(10).value = "No. NIK";
  superRow.getCell(11).value = "No. NIK";
  superRow.getCell(12).value = "No. KK";
  superRow.getCell(17).value = "Tinggal";
  superRow.getCell(18).value = "Alamat";
  superRow.getCell(19).value = "Desa/";
  superRow.getCell(20).value = "Kecamatan";
  superRow.getCell(21).value = "Telp. Ayah";
  superRow.getCell(22).value = "Telp. Ibu";

  const subRow = sheet.getRow(3);
  subRow.getCell(1).value = "No.";
  subRow.getCell(2).value = "NIS";
  subRow.getCell(3).value = "NISN";
  subRow.getCell(4).value = " Lengkap ";
  subRow.getCell(5).value = "Panggilan";
  subRow.getCell(6).value = "L/P";
  subRow.getCell(7).value = "Tempat";
  subRow.getCell(8).value = "Tanggal";
  subRow.getCell(9).value = "Anak";
  subRow.getCell(10).value = "Ayah";
  subRow.getCell(11).value = "Ibu";
  subRow.getCell(12).value = "No. KK";
  subRow.getCell(15).value = "Anak ke-";
  subRow.getCell(17).value = "Tinggal";
  subRow.getCell(18).value = "Alamat";
  subRow.getCell(19).value = "Kelurahan";
  subRow.getCell(20).value = "Kecamatan";
  subRow.getCell(21).value = "Telp. Ayah";
  subRow.getCell(22).value = "Telp. Ibu";
  subRow.getCell(23).value = "Nama Ayah";
  subRow.getCell(24).value = "Pendidikan";
  subRow.getCell(25).value = "Pekerjaan";
  subRow.getCell(26).value = "Nama Kantor";
  subRow.getCell(27).value = "Alamat";
  subRow.getCell(28).value = "Kota/Kab.";
  subRow.getCell(29).value = "Penghasilan";
  subRow.getCell(30).value = "Nama Ibu";
  subRow.getCell(31).value = "Pendidikan";
  subRow.getCell(32).value = "Pekerjaan";
  subRow.getCell(33).value = "Nama Kantor";
  subRow.getCell(34).value = "Alamat";
  subRow.getCell(35).value = "Kota/Kab.";
  subRow.getCell(36).value = "Penghasilan";

  return sheet;
}

/**
 * Builds a "DC/TD/KB-style" sheet — offset by 1 column vs the A/B style
 * (col A blank, "No." starts at col B) and with NO Tinggal column at all,
 * matching `Data DC`/`Data KB1`/`Data TD2` in the real workbook.
 */
function buildOffset1Sheet(workbook: ExcelJS.Workbook, name: string) {
  const sheet = workbook.addWorksheet(`Data ${name}`);

  sheet.getRow(1).values = [undefined, undefined, undefined, "TAHUN AJARAN 2025/2026"];

  const superRow = sheet.getRow(2);
  superRow.getCell(2).value = "No.";
  superRow.getCell(3).value = "NIS";
  superRow.getCell(4).value = "NISN";
  superRow.getCell(5).value = "Nama Peserta Didik";
  superRow.getCell(6).value = "Nama Peserta Didik";
  superRow.getCell(7).value = "L/P";
  superRow.getCell(8).value = "Kelahiran";
  superRow.getCell(9).value = "Kelahiran";
  superRow.getCell(10).value = "No. NIK";
  superRow.getCell(11).value = "No. NIK";
  superRow.getCell(12).value = "No. NIK";
  superRow.getCell(13).value = "No. KK";
  superRow.getCell(18).value = "Alamat";
  superRow.getCell(19).value = "Desa";
  superRow.getCell(20).value = "Kecamatan";
  superRow.getCell(21).value = "Telp. Ayah";
  superRow.getCell(22).value = "Telp. Ibu";

  const subRow = sheet.getRow(3);
  subRow.getCell(2).value = "No.";
  subRow.getCell(3).value = "NIS";
  subRow.getCell(4).value = "NISN";
  subRow.getCell(5).value = " Lengkap ";
  subRow.getCell(6).value = "Panggilan";
  subRow.getCell(7).value = "L/P";
  subRow.getCell(8).value = "Tempat";
  subRow.getCell(9).value = "Tanggal";
  subRow.getCell(10).value = "Anak";
  subRow.getCell(11).value = "Ayah";
  subRow.getCell(12).value = "Ibu";
  subRow.getCell(13).value = "No. KK";
  subRow.getCell(16).value = "Anak ke-";
  subRow.getCell(18).value = "Alamat";
  subRow.getCell(19).value = "Desa";
  subRow.getCell(20).value = "Kecamatan";
  subRow.getCell(21).value = "Telp. Ayah";
  subRow.getCell(22).value = "Telp. Ibu";
  subRow.getCell(23).value = "Nama Ayah";
  subRow.getCell(24).value = "Pendidikan";
  subRow.getCell(25).value = "Pekerjaan";
  subRow.getCell(26).value = "Nama Kantor";
  subRow.getCell(27).value = "Alamat";
  subRow.getCell(28).value = "Kota/Kab.";
  subRow.getCell(29).value = "Penghasilan";
  subRow.getCell(30).value = "Nama Ibu";
  subRow.getCell(31).value = "Pendidikan";
  subRow.getCell(32).value = "Pekerjaan";
  subRow.getCell(33).value = "Nama Kantor";
  subRow.getCell(34).value = "Alamat";
  subRow.getCell(35).value = "Kota/Kab.";
  subRow.getCell(36).value = "Penghasilan";

  return sheet;
}

describe("listKelasSheetCodes / findKelasSheet", () => {
  it("lists kelas codes from 'Data <X>' sheet names, tolerating a leading space", () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Data A1");
    workbook.addWorksheet(" Data TD2");
    workbook.addWorksheet("A1"); // attendance-only sheet, not a "Data" sheet
    workbook.addWorksheet("Sheet1");

    expect(listKelasSheetCodes(workbook).sort()).toEqual(["A1", "TD2"].sort());
    expect(findKelasSheet(workbook, "TD2")?.name).toBe(" Data TD2");
    expect(findKelasSheet(workbook, "ZZ")).toBeNull();
  });
});

describe("parseKelasSheet — A/B-style layout (offset 0, has Tinggal)", () => {
  it("extracts a full student row via header-text column detection", () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = buildOffset0Sheet(workbook, "A1");
    const row = sheet.getRow(4);
    row.getCell(1).value = 1;
    row.getCell(2).value = 2526137301;
    row.getCell(3).value = 3200771409;
    row.getCell(4).value = "Abizard Nabil Muttaqi";
    row.getCell(5).value = "Utta";
    row.getCell(6).value = "L";
    row.getCell(7).value = "Bekasi ";
    row.getCell(8).value = "27 Agustus 2020";
    row.getCell(9).value = "3216082708200008";
    row.getCell(10).value = "3275042108790027";
    row.getCell(11).value = "3275046502800025";
    row.getCell(12).value = "3275041304120043";
    row.getCell(15).value = 1;
    row.getCell(17).value = "Orang Tua";
    row.getCell(18).value = "Perum metland cibitung cluster ruellia blok D1/5";
    row.getCell(19).value = "Telagamurni";
    row.getCell(20).value = "Cikarang Barat";
    row.getCell(21).value = "085884210925";
    row.getCell(22).value = "085819259225";
    row.getCell(23).value = "Supardi";
    row.getCell(24).value = "SMA";
    row.getCell(25).value = "Karyawan Swasta";
    row.getCell(26).value = "PT. TainahExpres Indonesia";
    row.getCell(27).value = "Kawasan KBN";
    row.getCell(28).value = "Jakarta";
    row.getCell(29).value = "Rp. 5.000.000 s/d Rp. 10.000.000";
    row.getCell(30).value = "Siti Anisah";
    row.getCell(31).value = "SMA";
    row.getCell(32).value = "Karyawan Swasta";
    row.getCell(33).value = "PT. Rayovae Battery Indonesia";
    row.getCell(34).value = "Kawasan Industri MM2100";
    row.getCell(35).value = "Bekasi";
    row.getCell(36).value = "> Rp. 10.000.000";

    const records = parseKelasSheet(workbook, "A1");
    expect(records).toHaveLength(1);
    const r = records[0];

    expect(r.nis).toBe("2526137301");
    expect(r.nisn).toBe("3200771409");
    expect(r.namaLengkap).toBe("Abizard Nabil Muttaqi");
    expect(r.namaPanggilan).toBe("Utta");
    expect(r.gender).toBe("L");
    // merged-cell "Kelahiran" header case: Tempat/Tanggal sub-columns
    // must land in birthPlace/birthDateRaw respectively, not swapped.
    expect(r.birthPlace).toBe("Bekasi");
    expect(r.birthDateRaw).toBe("27 Agustus 2020");
    expect(r.nikAnak).toBe("3216082708200008");
    expect(r.kkNumber).toBe("3275041304120043");
    expect(r.childOrder).toBe(1);
    expect(r.tinggal).toBe("Orang Tua");
    expect(r.alamat).toBe("Perum metland cibitung cluster ruellia blok D1/5");
    expect(r.desaKelurahan).toBe("Telagamurni");
    expect(r.kecamatan).toBe("Cikarang Barat");
    expect(r.telpAyah).toBe("085884210925");
    expect(r.telpIbu).toBe("085819259225");

    expect(r.ayah).toEqual({
      nama: "Supardi",
      nik: "3275042108790027",
      pendidikan: "SMA",
      pekerjaan: "Karyawan Swasta",
      namaKantor: "PT. TainahExpres Indonesia",
      alamatKantor: "Kawasan KBN",
      kota: "Jakarta",
      penghasilan: "Rp. 5.000.000 s/d Rp. 10.000.000",
    });
    expect(r.ibu).toEqual({
      nama: "Siti Anisah",
      nik: "3275046502800025",
      pendidikan: "SMA",
      pekerjaan: "Karyawan Swasta",
      namaKantor: "PT. Rayovae Battery Indonesia",
      alamatKantor: "Kawasan Industri MM2100",
      kota: "Bekasi",
      penghasilan: "> Rp. 10.000.000",
    });
  });

  it("handles a real Excel Date cell for the birth date column", () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = buildOffset0Sheet(workbook, "A2");
    const row = sheet.getRow(4);
    row.getCell(4).value = "Erinka Abrina Alnita";
    row.getCell(8).value = new Date("2021-01-11T00:00:00.000Z");

    const records = parseKelasSheet(workbook, "A2");
    expect(records).toHaveLength(1);
    expect(records[0].birthDateRaw).toBeInstanceOf(Date);
    expect((records[0].birthDateRaw as Date).toISOString()).toBe("2021-01-11T00:00:00.000Z");
  });
});

describe("parseKelasSheet — DC/TD/KB-style layout (offset 1, no Tinggal column)", () => {
  it("extracts a full student row despite the 1-column offset vs A/B sheets", () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = buildOffset1Sheet(workbook, "DC");
    const row = sheet.getRow(4);
    row.getCell(2).value = 1;
    row.getCell(3).value = 242528503;
    row.getCell(5).value = "Almafara Zoeya Fauqiyya";
    row.getCell(6).value = "Qia";
    row.getCell(7).value = "P";
    row.getCell(8).value = "Temanggung";
    row.getCell(9).value = new Date("2021-03-31T00:00:00.000Z");
    row.getCell(10).value = "3323017103210001";
    row.getCell(11).value = "332301069970002";
    row.getCell(12).value = "3578084906980002";
    row.getCell(13).value = "3323012502210001";
    row.getCell(16).value = 1;
    row.getCell(18).value = "Perum Taman Aster blok g2 no 33";
    row.getCell(19).value = "Telaga Asih";
    row.getCell(20).value = "Cikarang Barat";
    row.getCell(21).value = "085819373133";
    row.getCell(22).value = "085236838633";
    row.getCell(23).value = "Muhammad Alfanno Fauzan";
    row.getCell(30).value = "Safira Dylan Pertiwi";

    const records = parseKelasSheet(workbook, "DC");
    expect(records).toHaveLength(1);
    const r = records[0];

    expect(r.nis).toBe("242528503");
    expect(r.namaLengkap).toBe("Almafara Zoeya Fauqiyya");
    expect(r.namaPanggilan).toBe("Qia");
    expect(r.gender).toBe("P");
    expect(r.birthPlace).toBe("Temanggung");
    expect(r.birthDateRaw).toBeInstanceOf(Date);
    // DC/TD/KB sheets carry no Tinggal column at all — must be null, not
    // a stray value picked up from a neighbouring "Alamat"/"Anak ke-" cell.
    expect(r.tinggal).toBeNull();
    expect(r.alamat).toBe("Perum Taman Aster blok g2 no 33");
    expect(r.desaKelurahan).toBe("Telaga Asih");
    expect(r.kecamatan).toBe("Cikarang Barat");
    expect(r.ayah.nama).toBe("Muhammad Alfanno Fauzan");
    expect(r.ibu.nama).toBe("Safira Dylan Pertiwi");
  });

  it("stops at neither breaking nor fabricating rows past the last populated row", () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = buildOffset1Sheet(workbook, "KB1");
    sheet.getRow(4).getCell(5).value = "Citrik Byapari Candramahirah";
    sheet.getRow(5).getCell(5).value = ""; // blank spacer row — tolerated, not a hard stop
    sheet.getRow(6).getCell(5).value = "Dirandra Ahmad Santoso";

    const records = parseKelasSheet(workbook, "KB1");
    expect(records.map((r) => r.namaLengkap)).toEqual([
      "Citrik Byapari Candramahirah",
      "Dirandra Ahmad Santoso",
    ]);
  });
});

describe("parseKelasSheet — missing sheet", () => {
  it("returns an empty array rather than throwing when the kelas sheet doesn't exist", () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Sheet1");
    expect(parseKelasSheet(workbook, "TD1")).toEqual([]);
  });
});
