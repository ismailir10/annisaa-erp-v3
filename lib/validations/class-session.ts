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

/**
 * Client form schema for the "Ubah Guru Sesi" dialog (T2, 2026-09-27
 * admin-finish-standard cycle). The Select's "no substitute chosen" state is
 * the empty string (base-ui Select has no null value), while the API's
 * `teacherId` is `string | null` — the form keeps `""` and the submit
 * handler converts it to `null`.
 *
 * The route requires a `substituteReason` whenever the chosen effective
 * teacher differs from the session's homeroom snapshot (`defaultTeacherId`,
 * route ~93-104). That comparison needs the session's `defaultTeacherId`,
 * which this form is never meant to let the user edit — it is carried as a
 * hidden, non-rendered field (seeded from the opened session, see
 * `SwapSessionDialog`) purely so `superRefine` below can evaluate the rule
 * and put the resulting issue on the *visible* `substituteReason` field.
 * `defaultTeacherId` itself is never sent to the API; the route still
 * re-derives and enforces the same rule against its own DB read (never
 * trusting a client-supplied `defaultTeacherId` for that comparison).
 */
export const swapClassSessionTeacherFormSchema = z
  .object({
    teacherId: z.string(),
    substituteReason: z
      .string()
      .trim()
      .max(300, "Alasan pengganti maksimal 300 karakter")
      .optional(),
    defaultTeacherId: z.string().nullable(),
  })
  .superRefine((values, ctx) => {
    const effectiveTeacherId = values.teacherId || null;
    const isSubstitution = effectiveTeacherId !== values.defaultTeacherId;
    if (isSubstitution && !values.substituteReason) {
      ctx.addIssue({
        code: "custom",
        path: ["substituteReason"],
        message: "Alasan pengganti wajib diisi untuk pergantian guru.",
      });
    }
  });

export type SwapClassSessionTeacherFormInput = z.infer<
  typeof swapClassSessionTeacherFormSchema
>;
