import { z } from "zod";

// F-10 (cycle 2026-05-13 staging-sweep-majors-cycle1): Bank and Rekening must
// be either both set or both empty. The sweep found Ismail Teacher Test had
// `bank="Bank BSI"` and `bankAccountNo=NULL`, which would emit an invalid
// row to the BSI bulk-export CSV at payroll time. Treat empty/whitespace
// strings as "not set" so a stray space doesn't pass the check.
function isFilled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function refineBankAccountPair<T extends { bankName?: string | null; bankAccountNo?: string | null }>(
  data: T,
  ctx: z.RefinementCtx,
): void {
  const bank = isFilled(data.bankName);
  const acct = isFilled(data.bankAccountNo);
  if (bank && !acct) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bankAccountNo"],
      message: "No. Rekening wajib diisi jika bank dipilih",
    });
  }
  if (acct && !bank) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bankName"],
      message: "Bank wajib dipilih jika No. Rekening diisi",
    });
  }
}

// Base shape — kept unrefined so we can derive a partial below without
// fighting zod's ZodEffects unwrapping.
const employeeBaseObject = z.object({
  nama: z.string().min(1, "Nama wajib diisi"),
  formalName: z.string().optional().nullable(),
  email: z.string().email("Email tidak valid"),
  noHp: z.string().optional().nullable(),
  jabatan: z.string().min(1, "Jabatan wajib diisi"),
  campusId: z.string().min(1, "Kampus wajib dipilih"),
  hireDate: z.string().min(1, "Tanggal masuk wajib diisi"),
  bankName: z.string().optional().nullable(),
  bankAccountNo: z.string().optional().nullable(),
  bpjsEnrolled: z.boolean().default(false),
  // F-26: caller-supplied role for the auto-created `User` row. Previously
  // hard-coded to `TEACHER`, which prevented HR from creating non-teaching
  // staff (admin/finance/etc.) through the employee form. Only TEACHER and
  // SCHOOL_ADMIN are accepted here — GUARDIAN is the parent role and is not
  // an employee. SUPER_ADMIN is intentionally excluded; promoting an
  // employee to SUPER_ADMIN must go through a deliberate admin-side flow.
  role: z.enum(["TEACHER", "SCHOOL_ADMIN"]).default("TEACHER"),
});

export const createEmployeeSchema = employeeBaseObject.superRefine(refineBankAccountPair);

// F-13 fix: `status` is intentionally NOT extended onto the partial schema.
// PUT /api/employees/[id] must not accept `status` writes — that path was the
// bug enabling silent re-activation by sending `{status:"ACTIVE"}`. Status
// transitions go through the dedicated POST /deactivate and /restore
// endpoints which carry permission checks, audit logging, and rate limits.
// Zod's default `.strip()` mode drops unknown keys silently, so a stray
// `status` field on a PUT body is ignored rather than rejected.
//
// Bank pair refinement also applies to partial updates: a PATCH that sets
// bankName without bankAccountNo (or vice-versa) is rejected the same way.
// Partial-only updates that touch neither field are unaffected.
export const updateEmployeeSchema = employeeBaseObject
  .partial()
  .superRefine(refineBankAccountPair);

export const employeeStatusReasonSchema = z.object({
  reason: z.string().trim().max(500, "Alasan maksimal 500 karakter").optional(),
});
