import { z } from "zod";
import { optionalEmail } from "./optional-email";

export const createGuardianSchema = z.object({
  name: z.string().min(1, "Nama wali wajib diisi").max(200),
  phone: z.string().max(20).optional().nullable(),
  email: optionalEmail,
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
  address: z.string().max(500).optional().nullable(),
  childrenTotal: z.coerce.number().int().min(0).optional().nullable(),
  // Set once the admin has seen the duplicate-candidate list and chose to
  // create a new parent anyway. Absent on the first submit, which is what
  // lets the route run the check exactly once per decision.
  confirmNew: z.boolean().optional(),
});

// Shared by updateGuardianSchema and linkGuardianSchema: an HTML number input
// sends "Anak ke-" as a string, and an empty field must clear the column
// rather than coerce to 0. Preprocess so ""/null short-circuit to undefined.
const childOrderField = z
  .preprocess(
    (v) => (v === null || v === "" || v === undefined ? undefined : v),
    z.coerce.number().int().min(1).optional(),
  )
  .nullable()
  .optional();

/**
 * Linking a parent who already exists. Deliberately carries no bio fields —
 * the parent's own record owns those, and accepting them here would let the
 * "Tambah Wali" dialog silently overwrite another family's data. Only the
 * junction's own columns are settable.
 */
export const linkGuardianSchema = z.object({
  parentId: z.string().min(1, "Wali wajib dipilih"),
  relationship: z.enum(["AYAH", "IBU", "WALI", "OTHER"]),
  isPrimary: z.boolean().optional(),
  childOrder: childOrderField,
});

export const updateGuardianSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(20).optional().nullable(),
  email: optionalEmail,
  whatsapp: z.string().max(20).optional().nullable(),
  relationship: z.enum(["AYAH", "IBU", "WALI", "OTHER"]).optional(),
  isPrimary: z.boolean().optional(),
  // T8: per-junction "Anak ke-" position.
  childOrder: childOrderField,
  parentNik: z.string().max(20).optional().nullable(),
  education: z.string().max(100).optional().nullable(),
  occupation: z.string().max(100).optional().nullable(),
  employer: z.string().max(200).optional().nullable(),
  employerAddress: z.string().max(500).optional().nullable(),
  employerCity: z.string().max(100).optional().nullable(),
  incomeRange: z.string().max(50).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  childrenTotal: z.coerce.number().int().min(0).optional().nullable(),
});

export const toggleGuardianStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});
