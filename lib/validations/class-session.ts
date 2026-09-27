import { z } from "zod";

/**
 * Swap the EFFECTIVE teacher on a single ClassSession (academic-hierarchy-
 * refactor, Task 6). `teacherId` is nullable — a null clears the effective
 * teacher (rare, e.g. a cancelled day pending re-assignment). `defaultTeacherId`
 * is never touched by this schema: it stays as the homeroom snapshot for audit.
 *
 * A "revert to homeroom" is just the caller passing `teacherId` equal to the
 * session's `defaultTeacherId` with no `substituteReason` — no special field.
 */
export const swapClassSessionTeacherSchema = z.object({
  teacherId: z.string().min(1).nullable(),
  substituteReason: z
    .string()
    .max(300, "Alasan pengganti maksimal 300 karakter")
    .optional(),
});

export type SwapClassSessionTeacherInput = z.infer<
  typeof swapClassSessionTeacherSchema
>;

// Client form schema for the "Ubah Guru Sesi" dialog (T3, 2026-09-27
// admin-forms-rhf cycle). The Select's "no substitute chosen" state is the
// empty string (base-ui Select has no null value), while the API's
// `teacherId` is `string | null` — the form keeps `""` and the submit
// handler converts it to `null` (`values.teacherId || null`), matching the
// previous `submitSwap(swapTeacherId || null, swapReason)` call exactly.
export const swapClassSessionTeacherFormSchema = swapClassSessionTeacherSchema
  .omit({ teacherId: true })
  .extend({ teacherId: z.string() });

export type SwapClassSessionTeacherFormInput = z.infer<
  typeof swapClassSessionTeacherFormSchema
>;
