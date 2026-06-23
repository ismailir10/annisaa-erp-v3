/**
 * Enrollment-application option lists — hardcoded for the An Nisaa' pilot
 * (Cycle A). Values are stable enum-like strings stored in the application's
 * JSON blobs; labels are the Indonesian display text shown on the form and in
 * the admin detail. `lib/enrollment/submit-validation.ts` validates submitted
 * values against the `*_VALUES` sets derived here.
 *
 * Income brackets are transcribed verbatim from the paper "Penghasilan"
 * field. Occupation de-dupes the paper form's letter gap (a,b,c,e,f,g — no
 * "d") into six clean options + free-text "Lainnya" (cycle assumption 7).
 * Agama and Golongan Darah have no printed options on the paper form; we add
 * the conventional Indonesian dropdowns for a clean digital capture.
 */

export type Option = { value: string; label: string };

export const GENDER_OPTIONS: Option[] = [
  { value: "L", label: "Laki-laki" },
  { value: "P", label: "Perempuan" },
];

export const AGAMA_OPTIONS: Option[] = [
  { value: "ISLAM", label: "Islam" },
  { value: "KRISTEN", label: "Kristen" },
  { value: "KATOLIK", label: "Katolik" },
  { value: "HINDU", label: "Hindu" },
  { value: "BUDDHA", label: "Buddha" },
  { value: "KONGHUCU", label: "Konghucu" },
];

export const KEWARGANEGARAAN_OPTIONS: Option[] = [
  { value: "WNI", label: "WNI" },
  { value: "WNI_KETURUNAN", label: "WNI Keturunan" },
];

export const LIVING_WITH_OPTIONS: Option[] = [
  { value: "ORANG_TUA", label: "Orang tua" },
  { value: "WALI", label: "Wali" },
];

export const BIRTH_DELIVERY_OPTIONS: Option[] = [
  { value: "NORMAL", label: "Normal" },
  { value: "CAESAR", label: "Caesar" },
];

export const BIRTH_TERM_OPTIONS: Option[] = [
  { value: "CUKUP_BULAN", label: "Cukup bulan" },
  { value: "PREMATURE", label: "Prematur" },
];

export const BLOOD_TYPE_OPTIONS: Option[] = [
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "AB", label: "AB" },
  { value: "O", label: "O" },
  { value: "TIDAK_TAHU", label: "Tidak tahu" },
];

export const EDUCATION_OPTIONS: Option[] = [
  { value: "SD", label: "SD / Sederajat" },
  { value: "SMP", label: "SMP / Sederajat" },
  { value: "SMA", label: "SMA / Sederajat" },
  { value: "D1_D3", label: "D1 – D3" },
  { value: "S1_D4", label: "S1 / D4" },
  { value: "S2", label: "S2" },
  { value: "S3", label: "S3" },
  { value: "LAINNYA", label: "Lain-lain" },
];

export const OCCUPATION_OPTIONS: Option[] = [
  { value: "ASN_NON_GURU", label: "Aparatur Sipil Negara (Non guru)" },
  { value: "GURU", label: "Guru" },
  { value: "KARYAWAN_SWASTA", label: "Karyawan swasta" },
  { value: "WIRASWASTA", label: "Wiraswasta / Pengusaha" },
  { value: "TNI_POLRI", label: "TNI atau Polri" },
  { value: "LAINNYA", label: "Lain-lain" },
];

// Verbatim from the paper "Penghasilan" field.
export const INCOME_OPTIONS: Option[] = [
  { value: "LT_1850", label: "< Rp 1.850.000" },
  { value: "1850_4680", label: "Rp 1.850.000 – Rp 4.680.000" },
  { value: "4681_4792", label: "Rp 4.681.000 – Rp 4.792.000" },
  { value: "4793_7000", label: "Rp 4.793.000 – Rp 7.000.000" },
  { value: "7001_10000", label: "Rp 7.001.000 – Rp 10.000.000" },
  { value: "GT_10000", label: "> Rp 10.000.000" },
];

/** Set of valid values for an option list — used by submit-validation. */
export function valuesOf(options: Option[]): Set<string> {
  return new Set(options.map((o) => o.value));
}

export const GENDER_VALUES = valuesOf(GENDER_OPTIONS);
export const AGAMA_VALUES = valuesOf(AGAMA_OPTIONS);
export const KEWARGANEGARAAN_VALUES = valuesOf(KEWARGANEGARAAN_OPTIONS);
export const LIVING_WITH_VALUES = valuesOf(LIVING_WITH_OPTIONS);
export const BIRTH_DELIVERY_VALUES = valuesOf(BIRTH_DELIVERY_OPTIONS);
export const BIRTH_TERM_VALUES = valuesOf(BIRTH_TERM_OPTIONS);
export const BLOOD_TYPE_VALUES = valuesOf(BLOOD_TYPE_OPTIONS);
export const EDUCATION_VALUES = valuesOf(EDUCATION_OPTIONS);
export const OCCUPATION_VALUES = valuesOf(OCCUPATION_OPTIONS);
export const INCOME_VALUES = valuesOf(INCOME_OPTIONS);

/** Max repeating "keluarga inti yang pernah bersekolah" rows (cycle assumption 6). */
export const MAX_PRIOR_FAMILY_ATTENDEES = 4;

/** Application status lifecycle (Cycle A — no fee gate yet). */
export const ENROLLMENT_STATUSES = [
  "INVITED",
  "SUBMITTED",
  "UNDER_REVIEW",
  "ACCEPTED",
  "REJECTED",
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];
