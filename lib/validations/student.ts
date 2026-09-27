import { z } from "zod";
import { optionalTrimmed } from "./zod-helpers";

/**
 * Trim; empty (or unset) becomes an explicit `null`, never `undefined`.
 *
 * Unlike `optionalTrimmed` (which drops an empty field to `undefined` so
 * the key disappears from `JSON.stringify`'d output), the student edit/create
 * form needs the key to always survive serialisation: `PUT /api/students/[id]`
 * distinguishes "key absent → preserve the existing value" from "key present
 * as `null`/`\"\"` → clear it" (`body.x !== undefined ? … : undefined` per
 * field, app/api/students/[id]/route.ts ~177-187) — the same contract the
 * pre-migration client honoured by always sending every field, trimmed,
 * with `field.trim() || null`. This preprocess reproduces that exactly, so
 * the value type is `string | null`, never `string | null | undefined`.
 */
function nullableTrimmed(inner: z.ZodString) {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v ?? null;
    const t = v.trim();
    return t === "" ? null : t;
  }, inner.nullable());
}

/** Same contract as `nullableTrimmed` but without trimming — for fields the
 * old client sent as `field || null` (no `.trim()`): `dateOfBirth`, the
 * Jenis Kelamin `<Select>`'s `gender`, and `livingWith`. */
function nullableEmpty<T extends z.ZodTypeAny>(inner: T) {
  return z.preprocess((v) => (v === "" || v === undefined ? null : v), inner.nullable());
}

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

/**
 * Form schema for the Tambah/Edit Siswa dialogs on `/admin/students`
 * (react-hook-form + zodResolver — see `lib/forms/use-zod-form.ts`).
 *
 * Derived from `createStudentSchema`, not a divergent copy — but every
 * optional field is re-wrapped so its output is `string | null` (never
 * `undefined`), matching **exactly** what the pre-migration client sent on
 * every submit (`field.trim() || null`, or `field || null` for `dateOfBirth`
 * /`gender`/`livingWith`, always as an explicit key). This is deliberately
 * the opposite of the usual `optionalTrimmed`/`optionalEnum` convention
 * (which coerce a blank field to `undefined` so the key is *omitted*):
 * `PUT /api/students/[id]` reads "key absent" as "leave the column alone"
 * and "key present as `null`" as "clear it" (`body.x !== undefined ? … :
 * undefined` per field, app/api/students/[id]/route.ts ~177-187) — an
 * omitted key would silently stop an admin from ever clearing a field back
 * to blank. `name` gets `.trim()` for the same parity (the old client sent
 * `editForm.name.trim()`). `metadata` and `guardians` aren't edited from
 * this form and are omitted; `status` keeps the full 4-value enum from
 * `createStudentSchema` — the edit dialog's lifecycle lock
 * (GRADUATED/WITHDRAWN) is UI-only, mirroring the PUT route which already
 * rejects GRADUATED there.
 */
export const studentFormSchema = createStudentSchema
  .omit({ metadata: true, guardians: true })
  .extend({
    name: z.string().trim().min(1, "Nama siswa wajib diisi"),
    nickname: nullableTrimmed(z.string()),
    dateOfBirth: nullableEmpty(z.string()),
    gender: nullableEmpty(z.enum(["L", "P"])),
    address: nullableTrimmed(z.string()),
    notes: nullableTrimmed(z.string()),
    nis: nullableTrimmed(z.string()),
    nisn: nullableTrimmed(z.string()),
    birthPlace: nullableTrimmed(z.string()),
    nik: nullableTrimmed(z.string()),
    kkNumber: nullableTrimmed(z.string()),
    livingWith: nullableEmpty(z.string()),
    status: z.enum(["ACTIVE", "INACTIVE", "GRADUATED", "WITHDRAWN"]),
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
  // Required only when the age-fit check comes back BELOW_MIN/ABOVE_MAX and
  // the admin chooses to proceed anyway — see evaluateAgeFit in
  // lib/enrollment/age-fit.ts. Free text, non-empty; written into the
  // AuditLog `after` payload for `student.enroll.age-override`.
  ageOverrideReason: z.string().trim().min(1).optional(),
});

/**
 * Form schema for `StudentEnrollDialog` (react-hook-form + zodResolver).
 * Derived from `enrollStudentSchema`: `classSectionId` keeps its real
 * validator, but `ageOverrideReason` is re-wrapped with `optionalTrimmed` —
 * the API schema's `.trim().min(1).optional()` only lets `undefined` skip
 * the min-length check, while the dialog's default form value is `""` on
 * every submit that ISN'T an age-override retry (the common case). Without
 * this the resolver would reject the plain "pick a class and submit" path
 * with "String must contain at least 1 character(s)". The *contextual*
 * rule — reason required only once the 409 advisory step is showing — stays
 * enforced exactly as before: the confirm button disables on an empty
 * reason (see `reasonEmpty` in the dialog), not a schema refinement, since
 * that requirement depends on UI state the schema doesn't see.
 */
export const enrollStudentFormSchema = enrollStudentSchema.extend({
  ageOverrideReason: optionalTrimmed(z.string()),
});

export const graduateStudentSchema = z.object({
  graduationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal tidak valid")
    .optional(),
});

export const withdrawStudentSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Alasan pengunduran diri wajib diisi")
    .max(500, "Alasan pengunduran diri maksimal 500 karakter"),
  effectiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal tidak valid")
    .optional(),
});

export const promoteStudentSchema = z.object({
  targetClassSectionId: z.string().min(1, "Kelas tujuan wajib dipilih"),
  notes: z.string().trim().max(500, "Catatan maksimal 500 karakter").optional().nullable(),
});
