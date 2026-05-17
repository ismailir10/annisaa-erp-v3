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
