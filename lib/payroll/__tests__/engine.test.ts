import { describe, it, expect } from "vitest";
import { calculateEmployeePayroll, SalaryComponent, AttendanceVariables } from "../engine";

// Real salary components matching An Nisaa' structure
const components: SalaryComponent[] = [
  { id: "c1", code: "gaji_pokok", label: "Gaji Pokok", category: "INCOME", calcType: "FIXED", isProRated: true, sortOrder: 1 },
  { id: "c2", code: "tunjangan_jabatan", label: "Tunjangan Jabatan", category: "INCOME", calcType: "FIXED", isProRated: false, sortOrder: 2 },
  { id: "c3", code: "tunjangan_gt", label: "Tunjangan GT", category: "INCOME", calcType: "FIXED", isProRated: false, sortOrder: 3 },
  { id: "c4", code: "bpjs_perusahaan", label: "BPJS Perusahaan", category: "INCOME", calcType: "FIXED", isProRated: false, sortOrder: 4 },
  { id: "c5", code: "tunjangan_transport", label: "Tunjangan Transport", category: "INCOME", calcType: "ATTENDANCE_BASED", isProRated: false, sortOrder: 5 },
  { id: "c6", code: "tunjangan_msk", label: "Tunjangan Masuk", category: "INCOME", calcType: "ATTENDANCE_BASED", isProRated: false, sortOrder: 6 },
  { id: "c7", code: "insentif_outdoor", label: "Insentif Outdoor", category: "INCOME", calcType: "ATTENDANCE_BASED", isProRated: false, sortOrder: 7 },
  { id: "c8", code: "insentif_libur", label: "Insentif Libur", category: "INCOME", calcType: "ATTENDANCE_BASED", isProRated: false, sortOrder: 8 },
  { id: "c9", code: "insentif_3m", label: "Insentif 3M", category: "INCOME", calcType: "FIXED", isProRated: false, sortOrder: 9 },
  { id: "c10", code: "insentif_dc", label: "Insentif DC", category: "INCOME", calcType: "ATTENDANCE_BASED", isProRated: false, sortOrder: 10 },
  { id: "c11", code: "insentif_dll", label: "Insentif DLL", category: "INCOME", calcType: "FIXED", isProRated: false, sortOrder: 11 },
  { id: "c12", code: "deduksi_bpjs", label: "BPJS Karyawan", category: "DEDUCTION", calcType: "FIXED", isProRated: false, sortOrder: 12 },
  { id: "c13", code: "deduksi_dplk_dll", label: "DPLK & Lainnya", category: "DEDUCTION", calcType: "FIXED", isProRated: false, sortOrder: 13 },
];

const defaultVars: AttendanceVariables = {
  overtimeHours: 0,
  outdoorDays: 0,
  holidayWorkedDays: 0,
  dcDays: 0,
};

describe("calculateEmployeePayroll", () => {
  it("calculates Redacted Employee (ER2) correctly with 22 working days, all present", () => {
    // From Gaji-Okt24: ER2 net = 3,395,000
    const salaryValues = [
      { componentDefId: "c1", value: 1100000 }, // gaji_pokok
      { componentDefId: "c2", value: 565000 }, // tunjangan_jabatan
      { componentDefId: "c3", value: 250000 }, // tunjangan_gt
      { componentDefId: "c4", value: 185187 }, // bpjs_perusahaan
      { componentDefId: "c5", value: 60000 }, // tunjangan_transport per day
      { componentDefId: "c6", value: 0 },
      { componentDefId: "c7", value: 0 },
      { componentDefId: "c8", value: 0 },
      { componentDefId: "c9", value: 0 }, // insentif_3m
      { componentDefId: "c10", value: 0 },
      { componentDefId: "c11", value: 0 },
      { componentDefId: "c12", value: 185187 }, // deduksi_bpjs
      { componentDefId: "c13", value: 50000 }, // deduksi_dplk_dll
    ];

    const vars: AttendanceVariables = { ...defaultVars, outdoorDays: 0, dcDays: 0 };

    const result = calculateEmployeePayroll(
      components, salaryValues,
      22, // daysPresent (all 22 days)
      0, // daysLeave
      22, // actualWorkingDays
      vars
    );

    // gaji_pokok: 1,100,000 * (22/22) = 1,100,000
    // tunjangan_jabatan: 565,000
    // tunjangan_gt: 250,000
    // bpjs_perusahaan: 185,187
    // tunjangan_transport: 60,000 * 22 = 1,320,000
    // others: 0
    // gross = 1,100,000 + 565,000 + 250,000 + 185,187 + 1,320,000 = 3,420,187
    // deductions = 185,187 + 50,000 = 235,187
    // net = 3,420,187 - 235,187 = 3,185,000

    // Note: The spreadsheet shows 3,395,000 which includes additional items
    // (insentif_outdoor=60000, insentif_libur=60000, insentif_dc=90000)
    // that have attendance variables set. Without those, our calculation is correct.
    expect(result.netAmount).toBe(3185000);
    expect(result.grossAmount).toBe(3420187);
    expect(result.deductions).toBe(235187);
  });

  it("calculates with attendance variables (overtime, outdoor)", () => {
    const salaryValues = [
      { componentDefId: "c1", value: 1100000 },
      { componentDefId: "c2", value: 565000 },
      { componentDefId: "c3", value: 250000 },
      { componentDefId: "c4", value: 185187 },
      { componentDefId: "c5", value: 60000 },
      { componentDefId: "c6", value: 0 },
      { componentDefId: "c7", value: 30000 }, // insentif_outdoor per day
      { componentDefId: "c8", value: 60000 }, // insentif_libur per day
      { componentDefId: "c9", value: 0 },
      { componentDefId: "c10", value: 30000 }, // insentif_dc per day
      { componentDefId: "c11", value: 0 },
      { componentDefId: "c12", value: 185187 },
      { componentDefId: "c13", value: 50000 },
    ];

    const vars: AttendanceVariables = {
      overtimeHours: 0,
      outdoorDays: 2,
      holidayWorkedDays: 1,
      dcDays: 3,
    };

    const result = calculateEmployeePayroll(
      components, salaryValues,
      22, 0, 22, vars
    );

    // Additional: outdoor 30000*2=60000, libur 60000*1=60000, dc 30000*3=90000
    // = 210,000 extra
    expect(result.grossAmount).toBe(3420187 + 210000);
    expect(result.netAmount).toBe(3185000 + 210000);
  });

  it("pro-rates gaji_pokok for partial attendance", () => {
    const salaryValues = [
      { componentDefId: "c1", value: 1100000 },
      { componentDefId: "c2", value: 0 },
      { componentDefId: "c3", value: 0 },
      { componentDefId: "c4", value: 0 },
      { componentDefId: "c5", value: 60000 },
      { componentDefId: "c6", value: 0 },
      { componentDefId: "c7", value: 0 },
      { componentDefId: "c8", value: 0 },
      { componentDefId: "c9", value: 0 },
      { componentDefId: "c10", value: 0 },
      { componentDefId: "c11", value: 0 },
      { componentDefId: "c12", value: 0 },
      { componentDefId: "c13", value: 0 },
    ];

    const result = calculateEmployeePayroll(
      components, salaryValues,
      18, 0, 22, defaultVars
    );

    // gaji_pokok: 1,100,000 * 18/22 = 900,000
    // transport: 60,000 * 18 = 1,080,000
    expect(result.lines[0].calculatedAmount).toBe(900000);
    expect(result.lines.find(l => l.labelSnapshot === "Tunjangan Transport")?.calculatedAmount).toBe(1080000);
  });

  it("handles employee with zero salary (inactive/new)", () => {
    const salaryValues = components.map(c => ({ componentDefId: c.id, value: 0 }));
    const result = calculateEmployeePayroll(components, salaryValues, 22, 0, 22, defaultVars);
    expect(result.grossAmount).toBe(0);
    expect(result.deductions).toBe(0);
    expect(result.netAmount).toBe(0);
  });

  it("counts leave days for pro-rating", () => {
    const salaryValues = [
      { componentDefId: "c1", value: 1100000 },
      ...components.slice(1).map(c => ({ componentDefId: c.id, value: 0 })),
    ];

    const result = calculateEmployeePayroll(
      components, salaryValues,
      18, 2, 22, defaultVars // 18 present + 2 leave = 20 for pro-rating
    );

    // gaji_pokok: 1,100,000 * 20/22 = 1,000,000
    expect(result.lines[0].calculatedAmount).toBe(1000000);
  });
});
