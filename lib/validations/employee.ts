import { z } from "zod";

export const createEmployeeSchema = z.object({
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

// F-13 fix: `status` is intentionally NOT extended onto the partial schema.
// PUT /api/employees/[id] must not accept `status` writes — that path was the
// bug enabling silent re-activation by sending `{status:"ACTIVE"}`. Status
// transitions go through the dedicated POST /deactivate and /restore
// endpoints which carry permission checks, audit logging, and rate limits.
// Zod's default `.strip()` mode drops unknown keys silently, so a stray
// `status` field on a PUT body is ignored rather than rejected.
export const updateEmployeeSchema = createEmployeeSchema.partial();

export const employeeStatusReasonSchema = z.object({
  reason: z.string().trim().max(500, "Alasan maksimal 500 karakter").optional(),
});
