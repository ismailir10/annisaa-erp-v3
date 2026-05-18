import { z } from "zod";

export const createStudentSchema = z.object({
  name: z.string().min(1, "Nama siswa wajib diisi"),
  nickname: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  gender: z.enum(["L", "P"]).optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  nis: z.string().optional().nullable(),
  nisn: z.string().optional().nullable(),
  birthPlace: z.string().optional().nullable(),
  nik: z.string().optional().nullable(),
  kkNumber: z.string().optional().nullable(),
  livingWith: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  // Admin-created students normally land ACTIVE; allowing the full enum lets
  // admins backfill historical rows (GRADUATED / WITHDRAWN) without a second PUT.
  status: z.enum(["ACTIVE", "INACTIVE", "GRADUATED", "WITHDRAWN"]).optional(),
  guardians: z.array(z.object({
    name: z.string().min(1, "Nama wali wajib diisi"),
    relationship: z.enum(["AYAH", "IBU", "WALI", "OTHER"]).default("WALI"),
    phone: z.string().optional().nullable(),
    email: z.string().email("Email tidak valid").optional().nullable(),
    whatsapp: z.string().optional().nullable(),
    isPrimary: z.boolean().default(false),
  })).optional(),
});

export const updateStudentSchema = createStudentSchema.partial().extend({
  status: z.enum(["ACTIVE", "INACTIVE", "GRADUATED", "WITHDRAWN"]).optional(),
  // Inline edit from Student detail "Riwayat Status" sub-card.
  // Withdrawal date is set by the /withdraw lifecycle API and stays read-only.
  // .trim() before .min(1) so whitespace-only payloads from a direct API call
  // (bypassing the client's client-side trim guard) are still rejected.
  withdrawalReason: z.string().trim().min(1, "Alasan tidak boleh kosong").optional(),
});

export const enrollStudentSchema = z.object({
  classSectionId: z.string().min(1, "Kelas wajib dipilih"),
});
