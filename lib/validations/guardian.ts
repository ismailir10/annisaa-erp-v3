import { z } from "zod";

export const createGuardianSchema = z.object({
  name: z.string().min(1, "Nama wali wajib diisi").max(200),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email("Email tidak valid").max(200).optional().nullable(),
  whatsapp: z.string().max(20).optional().nullable(),
  // No silent default — pre-fix `.default("WALI")` masked combobox-state
  // bugs (FIND-009): the form selected "Ayah" but submit dropped the value
  // and the server quietly persisted "WALI".
  relationship: z.enum(["AYAH", "IBU", "WALI", "OTHER"]),
  // isPrimary stays optional; first-guardian auto-default is applied in the
  // POST route (FIND-010) since it needs a DB count, not a static default.
  isPrimary: z.boolean().optional(),
  parentNik: z.string().max(20).optional().nullable(),
  education: z.string().max(100).optional().nullable(),
  occupation: z.string().max(100).optional().nullable(),
  employer: z.string().max(200).optional().nullable(),
  employerAddress: z.string().max(500).optional().nullable(),
  employerCity: z.string().max(100).optional().nullable(),
  incomeRange: z.string().max(50).optional().nullable(),
});

export const updateGuardianSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email("Email tidak valid").max(200).optional().nullable(),
  whatsapp: z.string().max(20).optional().nullable(),
  relationship: z.enum(["AYAH", "IBU", "WALI", "OTHER"]).optional(),
  isPrimary: z.boolean().optional(),
  parentNik: z.string().max(20).optional().nullable(),
  education: z.string().max(100).optional().nullable(),
  occupation: z.string().max(100).optional().nullable(),
  employer: z.string().max(200).optional().nullable(),
  employerAddress: z.string().max(500).optional().nullable(),
  employerCity: z.string().max(100).optional().nullable(),
  incomeRange: z.string().max(50).optional().nullable(),
});

export const toggleGuardianStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});
