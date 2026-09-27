import { z } from "zod";
import { optionalEmail } from "./optional-email";

// Used by PUT /api/parents/[id] — edits the Parent contact fields shown on
// the /admin/guardians list ("Wali Murid"). Junction-table fields like
// relationship/isPrimary belong to StudentGuardian and are edited via the
// existing /api/guardians/[id] route.
export const updateParentSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi").max(200).optional(),
  phone: z.string().max(20).optional().nullable(),
  email: optionalEmail,
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

/**
 * Form schema for the "Edit Wali" dialog on `/admin/guardians`
 * (react-hook-form + zodResolver). The dialog reuses the shared
 * `GuardianFormBody` (components/admin/guardian-edit-dialog.tsx), which
 * pre-dates this migration and keeps its own `form`/`setForm` prop contract
 * — it also renders inside the Student-detail and Guardian-detail pages,
 * which are out of scope for this cycle, so its signature is left alone.
 * This page bridges react-hook-form state to that contract instead of
 * changing it (see docs/cycles/2026-09-27-admin-forms-rhf.md).
 *
 * Derived from `updateParentSchema`, not a divergent copy: every field
 * keeps that schema's validator except `childrenTotal`, whose form value is
 * the `GuardianForm`'s string ("" when unset) rather than a coerced number —
 * `z.coerce.number()` alone turns `""` into `0`, not the "clear the field"
 * `null` the previous handler produced with `payload.childrenTotal === ""
 * ? null : Number(...)`. The preprocess below reproduces that exactly.
 * `nik` is omitted — `GuardianForm` only ever carries the unified
 * `parentNik` key (never the legacy `nik` alias), so keeping it would leave
 * an unindexable field on the bridged form-values type.
 */
export const parentFormSchema = updateParentSchema.omit({ childrenTotal: true, nik: true }).extend({
  childrenTotal: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.union([z.null(), z.coerce.number().int().min(0, "Jumlah anak tidak valid")]),
  ),
});
