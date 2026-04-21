// Synthetic demo dataset. Real employee records are kept locally and NEVER
// committed to this repo. See CONTRIBUTING / README for how to use a real
// dataset in a private deployment.
//
// Shape is identical to the production dataset so seed.ts works unchanged.
//
// E001–E010 are stable anchors (E003 → u_teacher for E2E demo auth).
// E011–E028 are bulk demo teachers/staff added for dataset-scale coverage
// (seed scenario coverage cycle 2026-04-21).
type Emp = {
  kode: string;
  nama: string;
  formalName: string | null;
  email: string;
  jabatan: string;
  bankAccountNo: string;
  bankName: string;
  noHp: string;
  bpjsEnrolled: boolean;
  campus: "taman-aster" | "metland-cibitung";
  status?: "INACTIVE";
};

const base: Emp[] = [
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
];

// Bulk demo teachers (E011–E026) — 16 additional teachers across both campuses.
const bulkTeacherNames = [
  "Ustadzah Aminah", "Ustadzah Khadijah", "Ustadzah Fatimah", "Ustadzah Zainab",
  "Ustadzah Hafshah", "Ustadzah Ruqayyah", "Ustadzah Ummu Salamah", "Ustadzah Saudah",
  "Ustadzah Maimunah", "Ustadzah Juwairiyah", "Ustadzah Safiyyah", "Ustadzah Asma",
  "Ustadz Abdullah", "Ustadz Ibrahim", "Ustadz Umar", "Ustadz Utsman",
];
const bulkTeachers: Emp[] = bulkTeacherNames.map((nama, i) => {
  const n = i + 11; // E011..E026
  const kode = `E${String(n).padStart(3, "0")}`;
  const num = String(n).padStart(3, "0");
  const campus: Emp["campus"] = i % 2 === 0 ? "taman-aster" : "metland-cibitung";
  return {
    kode,
    nama,
    formalName: `${nama} S.Pd.`,
    email: `guru${num}@example.test`,
    jabatan: i < 6 ? "Guru Kelas" : i < 12 ? "Guru Pendamping" : "Guru Tahfizh",
    bankAccountNo: `00000000${num}`,
    bankName: "Bank Demo",
    noHp: `+62812${num}${num}`,
    bpjsEnrolled: i < 10,
    campus,
  };
});

// Bulk staff (E027–E028) — 2 additional support staff.
const bulkStaff: Emp[] = [
  { kode: "E027", nama: "Staf Lima", formalName: null, email: "staf05@example.test", jabatan: "Keuangan",   bankAccountNo: "0000000027", bankName: "Bank Demo", noHp: "+628120000027", bpjsEnrolled: true,  campus: "taman-aster" },
  { kode: "E028", nama: "Staf Enam", formalName: null, email: "staf06@example.test", jabatan: "Kebersihan", bankAccountNo: "0000000028", bankName: "Bank Demo", noHp: "+628120000028", bpjsEnrolled: false, campus: "metland-cibitung" },
];

export const employees: readonly Emp[] = [...base, ...bulkTeachers, ...bulkStaff];
