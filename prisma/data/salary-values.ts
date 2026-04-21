// Synthetic demo salary values. Real figures are kept locally and NEVER
// committed to this repo.
//
// Keys match the synthetic employee kode values in ./employees.ts.
// All amounts are round demo numbers in IDR.

const teacherBase = {
  gaji_pokok: 1_000_000, tunjangan_jabatan: 300_000, tunjangan_gt: 150_000,
  bpjs_perusahaan: 120_000, tunjangan_transport: 50_000, tunjangan_msk: 0,
  insentif_outdoor: 0, insentif_libur: 0, insentif_3m: 0, insentif_dc: 0,
  insentif_dll: 0, deduksi_bpjs: 120_000, deduksi_dplk_dll: 0,
};
const staffBase = {
  gaji_pokok: 800_000, tunjangan_jabatan: 200_000, tunjangan_gt: 100_000,
  bpjs_perusahaan: 100_000, tunjangan_transport: 50_000, tunjangan_msk: 0,
  insentif_outdoor: 0, insentif_libur: 0, insentif_3m: 0, insentif_dc: 0,
  insentif_dll: 0, deduksi_bpjs: 100_000, deduksi_dplk_dll: 0,
};

export const salaryValues: Record<string, Record<string, number>> = {
  E001: { gaji_pokok: 2000000, tunjangan_jabatan: 600000, tunjangan_gt: 300000, bpjs_perusahaan: 300000, tunjangan_transport: 50000, tunjangan_msk: 0, insentif_outdoor: 0, insentif_libur: 0, insentif_3m: 0, insentif_dc: 0, insentif_dll: 0, deduksi_bpjs: 300000, deduksi_dplk_dll: 500000 },
  E002: { gaji_pokok: 1500000, tunjangan_jabatan: 500000, tunjangan_gt: 250000, bpjs_perusahaan: 200000, tunjangan_transport: 50000, tunjangan_msk: 0, insentif_outdoor: 0, insentif_libur: 0, insentif_3m: 0, insentif_dc: 0, insentif_dll: 0, deduksi_bpjs: 200000, deduksi_dplk_dll: 100000 },
  E003: { ...teacherBase },
  E004: { ...teacherBase },
  E005: { ...teacherBase },
  E006: { ...teacherBase },
  E007: { gaji_pokok: 900000,  tunjangan_jabatan: 250000, tunjangan_gt: 100000, bpjs_perusahaan: 100000, tunjangan_transport: 50000, tunjangan_msk: 0, insentif_outdoor: 0, insentif_libur: 0, insentif_3m: 0, insentif_dc: 0, insentif_dll: 0, deduksi_bpjs: 100000, deduksi_dplk_dll: 0 },
  E008: { gaji_pokok: 800000,  tunjangan_jabatan: 200000, tunjangan_gt: 100000, bpjs_perusahaan: 0,      tunjangan_transport: 50000, tunjangan_msk: 0, insentif_outdoor: 0, insentif_libur: 0, insentif_3m: 0, insentif_dc: 0, insentif_dll: 0, deduksi_bpjs: 0,      deduksi_dplk_dll: 0 },
  E009: { gaji_pokok: 700000,  tunjangan_jabatan: 150000, tunjangan_gt: 0,      bpjs_perusahaan: 0,      tunjangan_transport: 40000, tunjangan_msk: 0, insentif_outdoor: 0, insentif_libur: 0, insentif_3m: 0, insentif_dc: 0, insentif_dll: 0, deduksi_bpjs: 0,      deduksi_dplk_dll: 0 },
  E010: { gaji_pokok: 0,       tunjangan_jabatan: 0,      tunjangan_gt: 0,      bpjs_perusahaan: 0,      tunjangan_transport: 30000, tunjangan_msk: 0, insentif_outdoor: 0, insentif_libur: 0, insentif_3m: 0, insentif_dc: 0, insentif_dll: 0, deduksi_bpjs: 0,      deduksi_dplk_dll: 0 },
};

// Bulk teacher salary rows (E011–E026) — teacherBase tier with small bucket jitter.
for (let n = 11; n <= 26; n++) {
  const kode = `E${String(n).padStart(3, "0")}`;
  const tier = n <= 16 ? 1.0 : n <= 22 ? 0.95 : 0.9;
  salaryValues[kode] = {
    ...teacherBase,
    gaji_pokok: Math.round(teacherBase.gaji_pokok * tier),
    tunjangan_jabatan: Math.round(teacherBase.tunjangan_jabatan * tier),
    tunjangan_gt: Math.round(teacherBase.tunjangan_gt * tier),
  };
}

// Bulk staff salary rows (E027–E028).
salaryValues["E027"] = { ...staffBase };
salaryValues["E028"] = { ...staffBase, bpjs_perusahaan: 0, deduksi_bpjs: 0 };
