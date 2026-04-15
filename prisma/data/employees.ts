// Synthetic demo dataset. Real employee records are kept locally and NEVER
// committed to this repo. See CONTRIBUTING / README for how to use a real
// dataset in a private deployment.
//
// Shape is identical to the production dataset so seed.ts works unchanged.
export const employees = [
  { kode: "E001", nama: "Guru Satu",  formalName: "Guru Satu S.Pd.",  email: "guru01@example.test", jabatan: "Ka.Div Pendidikan", bankAccountNo: "0000000001", bankName: "Bank Demo", noHp: "+628120000001", bpjsEnrolled: true,  campus: "taman-aster" },
  { kode: "E002", nama: "Guru Dua",   formalName: "Guru Dua S.Pd.",   email: "guru02@example.test", jabatan: "WakasekKur",        bankAccountNo: "0000000002", bankName: "Bank Demo", noHp: "+628120000002", bpjsEnrolled: true,  campus: "taman-aster" },
  { kode: "E003", nama: "Guru Tiga",  formalName: null,               email: "guru03@example.test", jabatan: "Walas A1",          bankAccountNo: "0000000003", bankName: "Bank Demo", noHp: "+628120000003", bpjsEnrolled: true,  campus: "taman-aster" },
  { kode: "E004", nama: "Guru Empat", formalName: "Guru Empat S.Pd.", email: "guru04@example.test", jabatan: "Walas A2",          bankAccountNo: "0000000004", bankName: "Bank Demo", noHp: "+628120000004", bpjsEnrolled: true,  campus: "taman-aster" },
  { kode: "E005", nama: "Guru Lima",  formalName: null,               email: "guru05@example.test", jabatan: "Walas B1",          bankAccountNo: "0000000005", bankName: "Bank Demo", noHp: "+628120000005", bpjsEnrolled: true,  campus: "metland-cibitung" },
  { kode: "E006", nama: "Guru Enam",  formalName: "Guru Enam S.Pd.",  email: "guru06@example.test", jabatan: "Walas B2",          bankAccountNo: "0000000006", bankName: "Bank Demo", noHp: "+628120000006", bpjsEnrolled: true,  campus: "metland-cibitung" },
  { kode: "E007", nama: "Staf Satu",  formalName: null,               email: "staf01@example.test", jabatan: "TU",                bankAccountNo: "0000000007", bankName: "Bank Demo", noHp: "+628120000007", bpjsEnrolled: true,  campus: "taman-aster" },
  { kode: "E008", nama: "Staf Dua",   formalName: null,               email: "staf02@example.test", jabatan: "Humas",             bankAccountNo: "0000000008", bankName: "Bank Demo", noHp: "+628120000008", bpjsEnrolled: false, campus: "taman-aster" },
  { kode: "E009", nama: "Staf Tiga",  formalName: null,               email: "staf03@example.test", jabatan: "Rumah Tangga",      bankAccountNo: "0000000009", bankName: "Bank Demo", noHp: "+628120000009", bpjsEnrolled: false, campus: "metland-cibitung" },
  { kode: "E010", nama: "Staf Empat", formalName: null,               email: "staf04@example.test", jabatan: "Pengasuh",          bankAccountNo: "0000000010", bankName: "Bank Demo", noHp: "+628120000010", bpjsEnrolled: false, status: "INACTIVE", campus: "metland-cibitung" },
] as const;
