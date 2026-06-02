import { z } from "zod";

// Used by PUT /api/parents/[id] — edits the Parent contact fields shown on
// the /admin/guardians list ("Wali Murid"). Junction-table fields like
// relationship/isPrimary belong to StudentGuardian and are edited via the
// existing /api/guardians/[id] route.
export const updateParentSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi").max(200).optional(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email("Email tidak valid").max(200).optional().nullable(),
  whatsapp: z.string().max(20).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  // Both `nik` (legacy field name on the Parent row) and `parentNik` (the
  // unified GuardianForm key used by all three admin surfaces since T7) are
  // accepted. The PUT handler folds `parentNik` into the same db column.
  nik: z.string().max(20).optional().nullable(),
  parentNik: z.string().max(20).optional().nullable(),
  education: z.string().max(100).optional().nullable(),
  occupation: z.string().max(100).optional().nullable(),
  employer: z.string().max(200).optional().nullable(),
  employerAddress: z.string().max(500).optional().nullable(),
  employerCity: z.string().max(100).optional().nullable(),
  incomeRange: z.string().max(50).optional().nullable(),
  childrenTotal: z.coerce.number().int().min(0).optional().nullable(),
});

export const toggleParentStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});
