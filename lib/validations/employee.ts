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
